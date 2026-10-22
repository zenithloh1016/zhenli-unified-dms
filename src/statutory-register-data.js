/**
 * Convert a ZIP of register books into editable statutory register worksheets.
 * Processing is local in the signed-in browser. Nothing is uploaded until
 * the user reviews and confirms matched companies.
 */
import {unzipSync} from 'fflate';
import {openMasterListingWorkbook} from './master-listing-reader.js';
import {matchRegisterBook} from './register-book-zip.js';

const MAX_ZIP=80*1024*1024,MAX_UNPACKED=160*1024*1024;
const MAX_WORKBOOK=20*1024*1024,MAX_PDF=35*1024*1024;
const MAX_ROWS=12000,MAX_COLS=250,MAX_CELLS=250000;
export const normValue=v=>String(v??'').replace(/\u0000/g,'').slice(0,15000);
export function sanitizeSheet(name,rows){
 const cleaned=(rows||[]).map(row=>Array.isArray(row)?row.slice(0,MAX_COLS).map(normValue):[]);
 if(cleaned.length>MAX_ROWS)throw Error('Worksheet has more than 12,000 rows.');
 let end=cleaned.length;
 while(end && !cleaned[end-1]?.some(x=>x.trim()))end--;
 const subset=cleaned.slice(0,end);
 if(subset.reduce((n,row)=>n+row.length,0)>MAX_CELLS)throw Error('Worksheet exceeds 250,000 cells.');
 return {name:String(name||'Register').slice(0,120),rows:subset};
}
export function validateRegisterBook(value){
 if(!value||value.version!==1||!Array.isArray(value.sheets)||value.sheets.length>100)
  throw Error('Statutory Register format is not supported.');
 let cells=0;
 for(const s of value.sheets){
  if(typeof s.name!=='string'||s.name.length>120||!Array.isArray(s.rows)||s.rows.length>MAX_ROWS)
   throw Error('Invalid worksheet name or rows.');
  for(const r of s.rows){
   if(!Array.isArray(r)||r.length>MAX_COLS)throw Error('Invalid worksheet columns.');
   for(const c of r){if(typeof c!=='string'||c.length>15000)throw Error('Invalid worksheet cell.');}
   cells+=r.length;
  }
 }
 if(cells>500000)throw Error('Statutory Register exceeds the 500,000-cell limit.');
 return value;
}
const toFile=(bytes,name)=>({
 name,size:bytes.byteLength,
 arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)
});
async function parseExcel(bytes,filename){
 if(bytes.byteLength<50||bytes.byteLength>MAX_WORKBOOK)throw Error('Excel workbook must be under 20 MB.');
 const book=await openMasterListingWorkbook(toFile(bytes,filename));
 const sheets=book.sheetNames.map(name=>sanitizeSheet(name,book.readSheet(name)));
 // Reject an empty or unrelated spreadsheet before it can replace a register.
 if(!sheets.some(s=>/register|master|share|directors?|members?|beneficial|charge|secretar|transfer|allot/i.test(s.name)))
  throw Error('No recognisable statutory register worksheets found.');
 const master=sheets.find(s=>/^master$/i.test(s.name));
 const row=master?.rows.find(r=>/^company name\s*:/i.test(r[0]||''));
 const headerName=row?String(row[1]||'').trim():'';
 return {sheets,headerName};
}
async function parsePdf(bytes){
 if(bytes.byteLength>MAX_PDF)throw Error('PDF exceeds the 35 MB text-extraction limit.');
 const pdfjs=await import('pdfjs-dist/build/pdf.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
 const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false});
 const pdf=await task.promise;
 try{
  if(pdf.numPages>150)throw Error('PDF has more than 150 pages; split it.');
  const sheets=[],preview=[];
  for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i);
   const raw=await page.getTextContent();
   const items=raw.items.filter(x=>x?.str?.trim())
    .map(x=>({str:String(x.str),x:+(x.transform?.[4]||0),y:+(x.transform?.[5]||0)}))
    .sort((a,b)=>Math.abs(b.y-a.y)>3?b.y-a.y:a.x-b.x);
   const lines=[];
   for(const item of items){
    const last=lines.at(-1);
    if(last && Math.abs(last.y-item.y)<3)last.items.push(item);
    else lines.push({y:item.y,items:[item]});
   }
   const text=lines.map(line=>line.items.sort((a,b)=>a.x-b.x).map(x=>x.str).join(' ').trim()).filter(Boolean);
   if(i===1)preview.push(...text.slice(0,35));
   sheets.push(sanitizeSheet('PDF Page '+i,text.map(x=>[x])));
  }
  if(!sheets.some(s=>s.rows.length))throw Error('This PDF is scanned/image-only or has no selectable text. Import an original Excel register instead.');
  const header=preview.join('\n');
  return {
   sheets,
   headerName:(header.match(/Company Name\s*:\s*([^\n]+)/i)||[])[1]?.trim()||'',
   headerNumber:(header.match(/Company No\.?\s*:\s*([^\n]+)/i)||[])[1]?.trim()||''
  };
 }finally{await pdf.destroy();}
}
export async function previewStatutoryZip(file,companies,{onProgress=()=>{}}={}){
 if(!file||!/\.zip$/i.test(file.name)||!file.size||file.size>MAX_ZIP)
  throw Error('Choose a nonempty Register Book ZIP file no larger than 80 MB.');
 if(!(companies||[]).length)throw Error('Add your companies to the Documents portfolio before import.');
 onProgress('Unpacking ZIP locally…');
 let entries;
 try{entries=Object.entries(unzipSync(new Uint8Array(await file.arrayBuffer())));}
 catch(e){throw Error('Unable to read ZIP: '+(e?.message||e));}
 entries=entries.filter(([p])=>!p.endsWith('/')&&!/(^|\/)(?:__MACOSX|\.DS_Store)(?:\/|$)/i.test(p));
 if(entries.length>600)throw Error('ZIP contains more than 600 files. Split the archive.');
 const total=entries.reduce((sum,[,bytes])=>sum+bytes.byteLength,0);
 if(total>MAX_UNPACKED)throw Error('Uncompressed ZIP exceeds 160 MB. Split it.');
 const result=[],seen=new Set();
 for(let i=0;i<entries.length;i++){
  const [path,bytes]=entries[i];
  const entry={path,company:null,sheets:[],status:'',error:''};
  try{
   const ext=path.split('.').at(-1).toLowerCase();
   if(!['xlsx','pdf'].includes(ext))throw Error('Unsupported for direct editing: use .xlsx or text-based .pdf.');
   if(!bytes.length)throw Error('Empty register document.');
   const parsed=ext==='xlsx'?await parseExcel(bytes,path):await parsePdf(bytes);
   const found=matchRegisterBook(path,companies,{
    headerName:parsed.headerName||'',
    headerNumber:parsed.headerNumber||''
   });
   if(!found.company)throw Error(found.reason);
   const company=found.company;
   // Never merge unrelated files into the same company's register silently.
   if(seen.has(company.id))throw Error('More than one source for this company; combine its worksheets in one Excel workbook.');
   entry.company=company;entry.sheets=parsed.sheets;entry.status=ext==='pdf'?'PDF text converted to editable lines (verify layout)':'Excel worksheets converted to editable cells';
   seen.add(company.id);
  }catch(e){entry.error=e?.message||String(e);}
  result.push(entry);
  if(i%3===0||i===entries.length-1)onProgress('Converted '+(i+1)+' of '+entries.length+' files…');
 }
 return {rows:result,matched:result.filter(r=>r.company).length,
  unmatched:result.filter(r=>!r.company).length,
  createdAt:new Date().toISOString()};
}
export function makeRegisterBook(company,row){
 const value={version:1,companyId:company.id,companyName:company.name,
  registrationNo:company.registration_no||'',sourceFile:row?.path||'Manual entry',
  importedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  sheets:row?.sheets?.map(s=>({name:s.name,rows:s.rows.map(r=>r.slice())}))||[
   {name:'Register of Directors',rows:[['Name','Identification No.','Appointment Date','Cessation Date','Remarks']]},
   {name:'Register of Members',rows:[['Name','Identification / Registration No.','Share Class','Shares Held','Date Became Member','Date Ceased']]},
   {name:'Register of Beneficial Owners',rows:[['Full Name','Identification No.','Criteria','Nature of Ownership','Effective Date','Cessation Date']]},
   {name:'Register of Secretaries',rows:[['Name','Registration No.','Appointment Date','Cessation Date']]},
   {name:'Register of Charges',rows:[['Chargee','Description','Creation Date','Registration Date','Status']]},
   {name:'Register of Share Allotments',rows:[['Allottee','Class','Number of Shares','Allotment Date']]},
   {name:'Register of Share Transfers',rows:[['Transferor','Transferee','Shares','Transfer Date']]}
  ]};
 return validateRegisterBook(value);
}
