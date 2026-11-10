/**
 * Recover a missing legal former-name entry from this company's privately
 * archived Register Book Excel. Do not infer names from file titles, worksheet
 * titles or a stale current-company heading.
 *
 * This helper only reads original .xlsx files. It never uploads, overwrites or
 * modifies them, and avoids guessing if independent original sources conflict.
 */
import {openMasterListingWorkbook} from './master-listing-reader.js';
import {recordedFormerCompanyName} from './statutory-register-company-context.js';

const cleanName=value=>String(value||'').normalize('NFKC').trim()
 .replace(/^F\s*\.?\s*K\s*\.?\s*A\s*\.?\s*[:=–—-]?\s*/i,'').trim();
const MAX_BYTES=20*1024*1024;
const MAX_FILES=8;

export async function recoverFormerNameFromOriginalExcels(
 originals,{storage,openWorkbook=openMasterListingWorkbook,onError=()=>{}}={}
){
 if(!storage?.download||typeof openWorkbook!=='function')return {name:'',scanned:0};
 const candidates=(originals||[]).filter(doc=>
   typeof doc?.storage_path==='string'&&
   /\.xlsx$/i.test(String(doc.name||''))&&
   (!Number.isFinite(Number(doc.size_bytes))||Number(doc.size_bytes)<=MAX_BYTES)
 ).slice(0,MAX_FILES);
 const names=new Map();
 let scanned=0,failed=0;
 for(const doc of candidates){
  try{
   const {data,error}=await storage.download(doc.storage_path);
   if(error)throw Error(error.message||'Excel original is unavailable');
   if(!data||data.size>MAX_BYTES)throw Error('Original Excel is too large');
   const xlsx=await openWorkbook(data);
   const sheets=(xlsx.sheetNames||[]).slice();
   const profile=sheets.filter(name=>
    /^(?:master|company details|company particulars|company'?s? particulars|company information|company profile|corporate information|cover(?: sheet| page)?)(?:\b|\s*\()/i.test(String(name).trim()));
   // Read the main Company Details first, then other bounded worksheets:
   // the name reader ignores directors/members registers and demands a
   // documented company-identity context on miscellaneous worksheets.
   const candidates=[...profile,...sheets.filter(name=>!profile.includes(name))].slice(0,16);
   const source=[];
   for(const name of candidates){
    const rows=xlsx.readSheet(name,{sparse:true});
    source.push({name,rows});
   }
   const name=cleanName(recordedFormerCompanyName({sheets:source}));
   scanned++;
   if(name){
    const key=name.normalize('NFKC').toUpperCase().replace(/\s+/g,' ');
    if(!names.has(key))names.set(key,name);
   }
  }catch(error){failed++;onError(error,doc);}
 }
 // A single reliable former name may be applied; conflicting originals must
 // be reviewed rather than silently taking a random version.
 return {name:names.size===1?[...names.values()][0]:'',
  scanned,failed,conflict:names.size>1};
}
