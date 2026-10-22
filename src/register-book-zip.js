// Bulk Register Book ZIP matching: preview first, no auto-creation of unknown companies.
// Parsing is local. Never guess between companies or overwrite stored documents.
import {unzipSync} from 'fflate';

export const MAX_ZIP_BYTES=80*1024*1024;
export const MAX_REGISTER_FILE_BYTES=50*1024*1024;
const SUPPORTED=/\.(pdf|xlsx|xls|docx)$/i;
const SKIP_FILE=/(?:^|\/)(?:__MACOSX|\.DS_Store|Thumbs\.db)(?:\/|$)/i;
const removeExt=v=>String(v).replace(/\.(pdf|xlsx|xls|docx)$/i,'');
function norm(v){
 return String(v||'').normalize('NFKC').toUpperCase()
  .replace(/&/g,' AND ')
  .replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function relaxed(v){
 return norm(v).replace(/\bSDN BHD\b/g,'').replace(/\bMALAYSIA\b/g,'').replace(/\bM\b/g,'').replace(/\s+/g,' ').trim();
}
function stripNoise(v){
 return norm(removeExt(v)).replace(/\b(?:REGISTER BOOK|REGISTERBOOK|STATUTORY REGISTERS?|REGISTER OF MEMBERS|REGISTER OF DIRECTORS|COMPANY DOCUMENTS?|ZIP EXPORT|DOCUMENTS|PDF FILES?)\b/g,' ')
 .replace(/\b(?:COPY|FINAL|LATEST|UPDATED|FILE)\b/g,' ')
 .replace(/\b20\d{2}[- ]?\d{2}[- ]?\d{2}\b/g,' ')
 .replace(/\s+/g,' ').trim();
}
export function safeZipPath(path){
 return String(path||'').replace(/\\/g,'/').replace(/^\/+/,'');
}
export function safeRegisterFilename(path){
 const last=safeZipPath(path).split('/').at(-1)||'';
 return last.replace(/[^\p{L}\p{N} ._()\-&']/gu,'_').replace(/^\.+/,'').slice(0,220);
}
function registrationKeys(company){
 const n=String(company?.registration_no||'');
 const long=n.match(/\b\d{12}\b/g)||[];
 const old=n.match(/\b\d{5,8}\s*-\s*[A-Z0-9]\b/gi)||[];
 return [...new Set([...long,...old].map(norm))];
}
function candidatesFromFilename(path){
 const parts=safeZipPath(path).split('/').filter(x=>x&&!/^(?:__MACOSX|documents|register books?|registerbook|files|pdf|all companies)$/i.test(x));
 const file=parts.at(-1)||'';
 const names=[stripNoise(file),...parts.slice(0,-1).map(stripNoise)];
 return names.filter(x=>x.length>=6);
}
function matchName(value,c,allowRelaxed=false){
 const actual=allowRelaxed?relaxed(value):norm(value);
 const name=allowRelaxed?relaxed(c.name):norm(c.name);
 if(!name||name.length<8)return false;
 return actual===name || actual.includes(' '+name+' ') ||
  actual.startsWith(name+' ') || actual.endsWith(' '+name) ||
  actual.includes(' '+name+' ') || actual.includes(' '+name+' ') ||
  (actual.startsWith(name) && actual.charAt(name.length)===' ');
}
export function matchRegisterBook(path,companies,{headerName='',headerNumber=''}={}){
 const names=candidatesFromFilename(path);
 const exactIds=new Set();
 // Malaysian Register Books commonly append the former name, e.g.
 // "ABC SDN. BHD. (F.K.A. XYZ SDN. BHD.)". The alias is not the legal
 // present company name and must not invalidate a correct filename match.
 const cleanedHeader=String(headerName||'').replace(/\s*\(\s*F\.?\s*K\.?\s*A\.?\s*[\s\S]*$/i,'').trim();
 const headerNorm=norm(cleanedHeader);
 const headerNumberNorm=norm(headerNumber);
 if(headerNorm){
  let namesMatch=(companies||[]).filter(c=>norm(c.name)===headerNorm);
  if(!namesMatch.length)
   namesMatch=(companies||[]).filter(c=>relaxed(c.name)===relaxed(cleanedHeader));
  if(namesMatch.length===1)exactIds.add(namesMatch[0].id);
 }
 if(headerNumberNorm){
  for(const c of companies||[])if(registrationKeys(c).some(k=>k.length>=7 && headerNumberNorm.includes(k)))exactIds.add(c.id);
 }
 if(exactIds.size>1)return {company:null,reason:'Conflicting company name and registration number in register header'};
 if(exactIds.size===1){
  const company=(companies||[]).find(c=>exactIds.has(c.id));
  const filenameHits=(companies||[]).filter(c=>names.some(n=>matchName(n,c)));
  if(filenameHits.length && !filenameHits.some(c=>c.id===company.id))
   return {company:null,reason:'Register header does not match the company named in the ZIP path'};
  return {company,reason:'Matched register header'};
 }
 if(headerNorm || headerNumberNorm){
  // Header identifies a company not in this account. Do not guess from a filename.
  return {company:null,reason:'Register company details are not an unambiguous match to an existing DMS company'};
 }
 for(const relaxedMatching of [false,true]){
  const hits=(companies||[]).filter(c=>
   names.some(n=>matchName(n,c,relaxedMatching)) ||
   registrationKeys(c).some(k=>k.length>=7&&norm(path).includes(k))
  );
  if(hits.length===1)return {company:hits[0],reason:relaxedMatching?'Matched unique simplified company name':'Matched company name or registration no.'};
  if(hits.length>1)return {company:null,reason:'Ambiguous: '+hits.slice(0,4).map(x=>x.name).join(' / ')};
 }
 return {company:null,reason:'Company not found in DMS; verify ZIP filename or enclosing company folder'};
}
async function readPdfHeader(bytes){
 let document=null;
 try{
  const pdfjs=await import('pdfjs-dist/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,stopAtErrors:false});
  document=await task.promise;
  const page=await document.getPage(1);
  const raw=await page.getTextContent();
  const items=raw.items.filter(x=>x?.str?.trim()).map(x=>({s:x.str,x:+(x.transform?.[4]||0),y:+(x.transform?.[5]||0)}))
   .sort((a,b)=>Math.abs(b.y-a.y)>3?b.y-a.y:a.x-b.x);
  const lines=[];
  for(const x of items){const last=lines.at(-1);if(last&&Math.abs(last.y-x.y)<3)last.items.push(x);else lines.push({y:x.y,items:[x]});}
  const text=lines.map(x=>x.items.sort((a,b)=>a.x-b.x).map(v=>v.s).join(' ')).join('\n');
  return {
   name:(text.match(/Company Name\s*:\s*([^\n]+)/i)||[])[1]?.trim()||'',
   number:(text.match(/Company No\.?\s*:\s*([^\n]+)/i)||[])[1]?.trim()||''
  };
 }catch{return {name:'',number:''};}
 finally{if(document)await document.destroy().catch(()=>{});}
}
export async function previewRegisterZip(file,companies,{onProgress=()=>{}}={}){
 if(!file||!file.name.toLowerCase().endsWith('.zip'))throw Error('Select one ZIP archive containing companies’ Register Book files.');
 if(!file.size||file.size>MAX_ZIP_BYTES)throw Error('ZIP must not be empty or exceed 80 MB. Split larger archives.');
 if(!(companies||[]).length)throw Error('Import the Master Listing companies into DMS before importing Register Books.');
 onProgress('Opening ZIP archive locally…');
 let zip;
 try{zip=unzipSync(new Uint8Array(await file.arrayBuffer()));}
 catch(e){throw Error('Cannot unpack ZIP: '+(e.message||String(e)));}
 const entries=Object.entries(zip).filter(([path])=>!path.endsWith('/')&&!SKIP_FILE.test(path));
 if(entries.length>800)throw Error('ZIP contains more than 800 files. Split it into smaller archives.');
 const usable=entries.filter(([path])=>SUPPORTED.test(path));
 if(!usable.length)throw Error('No PDF, Excel Register Book or Word file found in the ZIP.');
 if(usable.length>500)throw Error('ZIP has more than 500 supported documents. Split it.');
 const total=usable.reduce((n,[,bytes])=>n+bytes.byteLength,0);
 if(total>350*1024*1024)throw Error('Uncompressed archive exceeds 350 MB; split into smaller files.');
 const rows=[];
 for(let i=0;i<usable.length;i++){
  const [path,bytes]=usable[i];
  if(!bytes.length){rows.push({path,reason:'Empty file',company:null});continue;}
  if(bytes.length>MAX_REGISTER_FILE_BYTES){rows.push({path,reason:'Document exceeds the 50 MB Supabase upload limit',company:null});continue;}
  let result=matchRegisterBook(path,companies);
  // For generic filenames, inspect a *text-based* PDF first page for exact company identity.
  if((!result.company||/Register Book(?: \(\d+\))?\.pdf$/i.test(path.split('/').at(-1)))&&/\.pdf$/i.test(path)){
   const header=await readPdfHeader(bytes);
   if(header.name||header.number)result=matchRegisterBook(path,companies,{headerName:header.name,headerNumber:header.number});
  }
  rows.push({path,filename:safeRegisterFilename(path),bytes,company:result.company,reason:result.reason});
  if(i%5===0)onProgress('Checked '+(i+1)+' of '+usable.length+' ZIP documents…');
 }
 return {rows,ignored:entries.length-usable.length,matched:rows.filter(x=>x.company).length,unmatched:rows.filter(x=>!x.company).length};
}
