/**
 * Private Register Book -> Master Listing enrichment.
 * Registers are parsed in the user's browser; no statutory names are bundled in public assets.
 * Only the two requested portfolio columns are changed. Every other field is retained.
 */
import {unzipSync} from 'fflate';
import {openMasterListingWorkbook} from './master-listing-reader.js';
import {companyData,validateMasterListing} from './master-listing-data.js';

export const REGISTER_PARTICULARS_COLUMNS=['Directors & Members','Beneficial Owners'];
const MAX_ZIP=80*1024*1024;
const MAX_UNPACKED=120*1024*1024;
const MAX_BOOK=20*1024*1024;
const maxField=15000;

const clean=value=>String(value??'').trim().replace(/[ \t]+/g,' ');
const firstLine=value=>clean(value).split(/\r?\n/)[0].trim();
const companyKey=value=>firstLine(value).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const field=(row,index)=>clean(row?.[index]);
const none=value=>!value||/^(?:-|--|N\/A|NA|NONE|NIL|0(?:\.0+)?)$/i.test(clean(value));
const same=(a,b)=>companyKey(a)===companyKey(b);
function unique(names){
 const seen=new Set();
 return names.filter(value=>{
  const key=companyKey(value);
  if(!key||seen.has(key))return false;
  seen.add(key);return true;
 });
}
function isActiveDirector(row,cessationCol){
 return none(field(row,cessationCol));
}
function directorsFrom(rows){
 const headerIndex=rows.findIndex(r=>/^director name$/i.test(field(r,0)));
 if(headerIndex<0)return [];
 const head=rows[headerIndex]||[];
 const cessationCol=head.findIndex(x=>/date of cessation/i.test(String(x??'')));
 if(cessationCol<0)return [];
 const names=[];
 for(const r of rows.slice(headerIndex+1)){
  const name=firstLine(field(r,0));
  if(!name||name.length>140||/^(?:director name|notes?|total|company name|date)$/i.test(name))continue;
  if(isActiveDirector(r,cessationCol))names.push(name);
 }
 return unique(names);
}
function membersFrom(rows){
 const names=[];
 for(let i=0;i<rows.length;i++){
  if(!/^name\s*:?\s*$/i.test(field(rows[i],0)))continue;
  const name=firstLine(field(rows[i],1));
  if(!name||name.length>140)continue;
  let ceased='',shares='';
  for(const r of rows.slice(i,i+15)){
   if(/date ceased to be a member/i.test(field(r,6)))ceased=field(r,7);
   if(/total shares held/i.test(field(r,6)))shares=field(r,7);
  }
  if(none(ceased)&&(!shares||(!none(shares)&&Number(shares.replace(/,/g,''))>0)))names.push(name);
 }
 return unique(names);
}
function beneficialOwnersFrom(rows){
 const headerIndex=rows.findIndex(r=>/^full name$/i.test(field(r,0)));
 if(headerIndex<0)return [];
 const names=[];
 for(const r of rows.slice(headerIndex+1)){
  const name=firstLine(field(r,0));
  if(!name||name.length>140||/^(?:notes?|total|full name|date)$/i.test(name))continue;
  const status=field(r,9);
  const ceased=/date\s+ceased\s*:\s*([^\r\n]*)/i.exec(status);
  if(ceased&&!none(ceased[1]))continue;
  const percent=field(r,6);
  const pct=/^\d+(?:\.\d+)?%?$/.test(percent)?' ('+percent.replace(/%$/,'')+'%)':'';
  names.push(name+pct);
 }
 const seen=new Set();
 return names.filter(n=>{
  const k=companyKey(n.replace(/\s+\([\d.]+%\)$/,''));
  if(seen.has(k))return false;
  seen.add(k);return true;
 });
}
export function extractRegisterParticulars(sheets){
 const entries=Object.entries(sheets||{});
 const directorSheet=entries.find(([name])=>/^register of directors(?:\s|$)/i.test(name));
 const memberSheets=entries.filter(([name])=>/^register of members(?:\s|$)/i.test(name));
 const boSheet=entries.find(([name])=>/^register of (?:bo|beneficial owners)(?:\s|$)/i.test(name));
 if(!directorSheet||!memberSheets.length||!boSheet)
  throw Error('Register Book must contain Directors, Members and BO worksheets.');
 const directors=directorsFrom(directorSheet[1]);
 const members=unique(memberSheets.flatMap(([,rows])=>membersFrom(rows)));
 const beneficialOwners=beneficialOwnersFrom(boSheet[1]);
 return {directors,members,beneficialOwners};
}
export function mergeRegisterParticulars(model,records,{replaceMissing=false}={}){
 validateMasterListing(model);
 const copy={...model,columns:model.columns.map(c=>({...c})),rows:model.rows.map(r=>({...r,values:r.values.slice()}))};
 const colIndex=REGISTER_PARTICULARS_COLUMNS.map(label=>{
  let index=copy.columns.findIndex(c=>String(c.label).trim().toLowerCase()===label.toLowerCase());
  if(index<0){
   index=copy.columns.length;
   copy.columns.push({id:'c'+index,label});
   for(const row of copy.rows)row.values.push('N/A');
  }
  return index;
 });
 const sources=new Map();
 for(const rec of records){
  const key=companyKey(rec.company);
  if(!key||sources.has(key))continue;
  sources.set(key,rec);
 }
 let matchedRows=0;
 const missing=[];
 for(const row of copy.rows){
  const company=companyData(copy,row)?.name||'';
  const rec=sources.get(companyKey(company));
  if(!rec){
   if(company)missing.push(company);
   if(replaceMissing)for(const col of colIndex)row.values[col]='N/A — Register Book not supplied';
   continue;
  }
  const combined='Directors: '+(rec.directors?.join('; ')||'Not stated')+'\nMembers: '+(rec.members?.join('; ')||'Not stated');
  const owners=rec.beneficialOwners?.join('; ')||'Not stated';
  if(combined.length>maxField||owners.length>maxField)
   throw Error('Register Book particulars exceed the Master Listing cell length limit for '+company);
  row.values[colIndex[0]]=combined;
  row.values[colIndex[1]]=owners;
  matchedRows++;
 }
 validateMasterListing(copy);
 return {model:copy,matchedRows,missing};
}
/** Keep private register fields when another Master Listing Excel file is imported later. */
export function preserveRegisterParticulars(oldModel,nextModel){
 if(!oldModel)return nextModel;
 validateMasterListing(oldModel);validateMasterListing(nextModel);
 const oldIndex=REGISTER_PARTICULARS_COLUMNS.map(label=>oldModel.columns.findIndex(c=>c.label.trim().toLowerCase()===label.toLowerCase()));
 if(oldIndex.every(i=>i<0))return nextModel;
 const copy={...nextModel,columns:nextModel.columns.map(c=>({...c})),rows:nextModel.rows.map(r=>({...r,values:r.values.slice()}))};
 const indexes=REGISTER_PARTICULARS_COLUMNS.map((label,i)=>{
  if(oldIndex[i]<0)return -1;
  let col=copy.columns.findIndex(c=>c.label.trim().toLowerCase()===label.toLowerCase());
  if(col<0){
   col=copy.columns.length;
   copy.columns.push({id:'c'+col,label});
   for(const row of copy.rows)row.values.push('N/A');
  }
  return col;
 });
 const original=new Map();
 for(const row of oldModel.rows){
  const name=companyData(oldModel,row)?.name||'';
  const key=companyKey(name);
  if(key&&!original.has(key))original.set(key,row);
 }
 for(const row of copy.rows){
  const orig=original.get(companyKey(companyData(copy,row)?.name||''));
  if(!orig)continue;
  indexes.forEach((col,i)=>{
   if(col<0)return;
   const old=orig.values[oldIndex[i]]||'';
   if(!old)return;
   const current=row.values[col];
   if(!current||current==='N/A')row.values[col]=old;
  });
 }
 return validateMasterListing(copy);
}
export async function previewRegisterParticularsZip(file,model,{onProgress=()=>{}}={}){
 if(!model)throw Error('Import your Master Listing before syncing Register Books.');
 if(!file||!/\.zip$/i.test(file.name)||file.size===0||file.size>MAX_ZIP)
  throw Error('Choose a non-empty Register Book ZIP archive smaller than 80 MB.');
 onProgress('Reading Register Book archive locally…');
 const entries=unzipSync(new Uint8Array(await file.arrayBuffer()));
 const books=Object.entries(entries).filter(([p])=>/\.xlsx$/i.test(p)&&!/(?:^|\/)__MACOSX\//i.test(p));
 if(!books.length||books.length>500)throw Error('ZIP must contain 1 to 500 Excel Register Books.');
 if(books.reduce((n,[,bytes])=>n+bytes.byteLength,0)>MAX_UNPACKED)
  throw Error('Unpacked Register Books exceed the safe 120 MB limit.');
 const permitted=new Set(model.rows.map(r=>companyKey(companyData(model,r)?.name)).filter(Boolean));
 const records=[],unmatchedFiles=[],errors=[];
 for(let i=0;i<books.length;i++){
  const [path,bytes]=books[i];
  const basename=path.split(/[\\/]/).at(-1)||'';
  const company=basename.replace(/\.xlsx$/i,'').replace(/^register\s*book[_ -]*/i,'').trim();
  if(!permitted.has(companyKey(company))){unmatchedFiles.push(basename);continue;}
  if(!bytes.byteLength||bytes.byteLength>MAX_BOOK){errors.push(basename+': invalid workbook size');continue;}
  try{
   const bookFile={name:basename,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
   const book=await openMasterListingWorkbook(bookFile);
   const required=book.sheetNames.filter(n=>/^master$|^register of directors(?:\s|$)|^register of members(?:\s|$)|^register of (?:bo|beneficial owners)(?:\s|$)/i.test(n));
   const sheets=Object.fromEntries(required.map(n=>[n,book.readSheet(n)]));
   const master=sheets.Master||[];
   const stated=master.find(r=>/^company name\s*:/i.test(field(r,0)));
   if(stated&&!same(field(stated,1),company))throw Error('Workbook company name differs from ZIP filename');
   records.push({company,...extractRegisterParticulars(sheets)});
  }catch(e){errors.push(basename+': '+(e.message||String(e)));}
  if(i%5===0||i===books.length-1)onProgress('Read '+(i+1)+' of '+books.length+' Register Books…');
 }
 const proposal=mergeRegisterParticulars(model,records);
 return {model:proposal.model,matchedRows:proposal.matchedRows,
  registerBooks:books.length,parsedBooks:records.length,missingCompanies:proposal.missing,
  unmatchedFiles,errors};
}
