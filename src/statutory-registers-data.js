/**
 * Editable statutory register data, imported locally from a company ZIP.
 * XLSX sheets are preserved as editable cells; text PDFs/DOCX become editable
 * text sections. No OCR or invented fields. No source ZIP leaves the device.
 */
import {previewRegisterZip} from './register-book-zip.js';
import {openMasterListingWorkbook} from './master-listing-reader.js';
import {unzipSync,strFromU8} from 'fflate';

export const DEFAULT_REGISTERS=[
 'Register of Directors','Register of Secretaries','Register of Members',
 'Register of Beneficial Owners','Register of Allotments','Register of Transfers',
 'Register of Charges','Register of Directors’ Shareholdings',
 'Register of Debenture Holders','Register of Registered Address','Other Statutory Register'
];
const MAX_BYTES=12*1024*1024;
const MAX_SECTIONS=120;
const text=v=>String(v??'');
export function blankRegister(company){
 return {version:1,companyId:company.id,companyName:company.name,
  registrationNo:company.registration_no||'',sections:[],
  updatedAt:'',sourceFiles:[]};
}
export function validateRegister(value){
 if(!value||value.version!==1||typeof value.companyId!=='string'||
   !Array.isArray(value.sections)||value.sections.length>MAX_SECTIONS)
  throw Error('Invalid statutory register format.');
 let size=0;
 for(const s of value.sections){
  if(!s||typeof s.id!=='string'||typeof s.title!=='string'||s.title.length>200)
   throw Error('Invalid statutory register section.');
  if(s.kind==='table'){
   if(!Array.isArray(s.columns)||s.columns.length>120||!Array.isArray(s.rows)||s.rows.length>12000)
    throw Error('Statutory register table exceeds safe limits.');
   for(const row of s.rows)if(!Array.isArray(row)||row.length!==s.columns.length)
    throw Error('Invalid statutory register table row.');
   size+=s.columns.join('').length;
   for(const row of s.rows)for(const cell of row){if(typeof cell!=='string'||cell.length>15000)throw Error('Statutory register cell is too long.');size+=cell.length;}
  }else if(s.kind==='text'){
   if(typeof s.content!=='string'||s.content.length>400000)throw Error('Register text exceeds 400,000 characters.');
   size+=s.content.length;
  }else throw Error('Unsupported statutory register section.');
 }
 if(size>MAX_BYTES)throw Error('Statutory register exceeds the 12 MB save limit. Split the register into smaller company records.');
 return value;
}
export function createSection(title,kind='table'){
 const selected=text(title).trim().slice(0,200)||'Other Statutory Register';
 return kind==='text'
  ?{id:crypto.randomUUID(),title:selected,kind:'text',content:'',sourceFile:''}
  :{id:crypto.randomUUID(),title:selected,kind:'table',
    columns:['Name / Particulars','Reference / ID','Effective Date','Remarks'],
    rows:[['','','','']],sourceFile:''};
}
export function appendImportedSections(existing,incoming){
 const base=structuredClone(validateRegister(existing));
 let added=0,skipped=0;
 for(const section of incoming){
  if(base.sections.length>=MAX_SECTIONS)throw Error('Too many register sections. Save or split the archive.');
  const same=base.sections.some(s=>s.title===section.title&&s.sourceFile===section.sourceFile&&
   (s.kind==='text'?s.content===section.content:JSON.stringify([s.columns,s.rows])===JSON.stringify([section.columns,section.rows])));
  if(same){skipped++;continue;}
  const title=base.sections.some(s=>s.title===section.title)
   ?section.title+' (Imported '+new Date().toISOString().slice(0,10)+')':section.title;
  base.sections.push({...section,title,id:crypto.randomUUID()});
  added++;
 }
 base.sourceFiles=[...new Set([...(base.sourceFiles||[]),...incoming.map(s=>s.sourceFile).filter(Boolean)])].slice(0,400);
 return {model:validateRegister(base),added,skipped};
}
async function workbookSections(bytes,path){
 const file={name:path.split('/').at(-1),size:bytes.byteLength,
  arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
 const workbook=await openMasterListingWorkbook(file);
 if(workbook.sheetNames.length>80)throw Error('Workbook has more than 80 sheets.');
 const sections=[];
 for(const sheet of workbook.sheetNames){
  const values=workbook.readSheet(sheet);
  const width=Math.max(1,...values.map(row=>row?.length||0));
  if(width>120)throw Error('Worksheet '+sheet+' has more than 120 columns.');
  const rows=values.map(row=>Array.from({length:width},(_,i)=>text(row?.[i])));
  if(!rows.some(row=>row.some(cell=>cell.trim())))continue;
  sections.push({id:crypto.randomUUID(),title:sheet.slice(0,200),kind:'table',
   columns:Array.from({length:width},(_,i)=>i<26?String.fromCharCode(65+i):'Column '+(i+1)),
   rows,sourceFile:path});
 }
 if(!sections.length)throw Error('Workbook has no editable worksheet data.');
 return sections;
}
async function pdfSection(bytes,path){
 const pdfjs=await import('pdfjs-dist/build/pdf.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
 const pdf=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
 try{
  if(pdf.numPages>160)throw Error('PDF exceeds 160 pages. Split it before import.');
  const lines=[];
  for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i);
   const raw=await page.getTextContent();
   const words=raw.items.filter(x=>x?.str?.trim()).map(x=>({
    s:x.str,x:+(x.transform?.[4]||0),y:+(x.transform?.[5]||0)
   })).sort((a,b)=>Math.abs(a.y-b.y)>3?b.y-a.y:a.x-b.x);
   const grouped=[];
   for(const w of words){
    const last=grouped.at(-1);
    if(last&&Math.abs(last.y-w.y)<3)last.words.push(w);
    else grouped.push({y:w.y,words:[w]});
   }
   lines.push('--- Page '+i+' ---');
   for(const line of grouped)lines.push(line.words.sort((a,b)=>a.x-b.x).map(x=>x.s).join(' '));
  }
  const content=lines.join('\n');
  if(!content.replace(/--- Page \d+ ---/g,'').trim())throw Error('Scanned/image-only PDF has no selectable text. Please transcribe from the original; no OCR was performed.');
  if(content.length>400000)throw Error('Extracted PDF text exceeds the safe limit; split the document.');
  return [{id:crypto.randomUUID(),title:path.split('/').at(-1).replace(/\.pdf$/i,'').slice(0,200),
   kind:'text',content,sourceFile:path}];
 }finally{await pdf.destroy();}
}
async function docxSection(bytes,path){
 const files=unzipSync(bytes,{filter:f=>f.name==='word/document.xml'});
 const source=files['word/document.xml'];
 if(!source)throw Error('Word document.xml missing.');
 const document=new DOMParser().parseFromString(strFromU8(source),'application/xml');
 if(document.getElementsByTagName('parsererror').length)throw Error('Invalid Word XML.');
 const paragraphs=Array.from(document.getElementsByTagNameNS('*','p'));
 const content=paragraphs.map(p=>Array.from(p.getElementsByTagNameNS('*','t')).map(t=>t.textContent||'').join('')).join('\n');
 if(!content.trim())throw Error('Word document contains no extractable text.');
 if(content.length>400000)throw Error('Word document is too long; split it.');
 return [{id:crypto.randomUUID(),title:path.split('/').at(-1).replace(/\.docx$/i,'').slice(0,200),
  kind:'text',content,sourceFile:path}];
}
/** Preview returns complete editable data per matched company but commits nothing. */
export async function previewStatutoryZip(file,companies,{onProgress=()=>{}}={}){
 const matched=await previewRegisterZip(file,companies,{onProgress});
 const sections=new Map(),errors=[],unmatched=[];
 for(let i=0;i<matched.rows.length;i++){
  const item=matched.rows[i];
  if(!item.company){unmatched.push({path:item.path,reason:item.reason});continue;}
  try{
   const ext=item.path.toLowerCase().split('.').at(-1);
   let parsed;
   if(ext==='xlsx')parsed=await workbookSections(item.bytes,item.path);
   else if(ext==='pdf')parsed=await pdfSection(item.bytes,item.path);
   else if(ext==='docx')parsed=await docxSection(item.bytes,item.path);
   else throw Error('Legacy .xls format cannot be embedded. Save as .xlsx and import again.');
   const group=sections.get(item.company.id)||{company:item.company,sections:[]};
   group.sections.push(...parsed);
   sections.set(item.company.id,group);
  }catch(err){errors.push({path:item.path,reason:err.message||String(err)});}
  if(i%3===0)onProgress('Converted '+(i+1)+' of '+matched.rows.length+' files to editable records…');
 }
 return {groups:[...sections.values()],unmatched,errors,ignored:matched.ignored,
  total:matched.rows.length,converted:matched.rows.length-unmatched.length-errors.length};
}
