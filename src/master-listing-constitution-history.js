/**
 * Restore only verified Constitution evidence from older private Master Listing
 * snapshots. Never roll back the complete listing: current statutory dates,
 * members, directors, rows and edits must stay untouched.
 */
import {
 validateMasterListing,isListingConstitutionColumn,
 displayedListingValue,isAffirmativeConstitutionValue,companyData
} from './master-listing-data.js';

function companyIdentity(model,row){
 const info=companyData(model,row);
 if(!info)return null;
 const num=String(info.registration||'').match(/\d{12}/)?.[0]||'';
 const name=String(info.name||'').toUpperCase()
  .replace(/[.\s]+/g,' ').trim();
 return name||num?{num,name}:null;
}
function historicalRows(model){
 const cols=model.columns.flatMap((c,i)=>
  isListingConstitutionColumn(c.label)?[i]:[]);
 const byReg=new Map(),byName=new Map();
 if(!cols.length)return {byReg,byName};
 for(const row of model.rows){
  const id=companyIdentity(model,row);
  if(!id)continue;
  const fields=cols.map(i=>({value:row.values[i],status:displayedListingValue(model,i,row.values[i])}));
  const record={id,fields};
  if(id.num){
   const existing=byReg.get(id.num);
   if(existing)byReg.set(id.num,null); // duplicates are unsafe
   else if(!byReg.has(id.num))byReg.set(id.num,record);
  }
  if(id.name){
   const existing=byName.get(id.name);
   if(existing)byName.set(id.name,null);
   else if(!byName.has(id.name))byName.set(id.name,record);
  }
 }
 return {byReg,byName};
}
function historicalMatch(index,id){
 if(id.num&&index.byReg.has(id.num))return index.byReg.get(id.num);
 const match=index.byName.get(id.name);
 // With two nonempty, conflicting registration numbers, refuse name match.
 if(match?.id.num&&id.num&&match.id.num!==id.num)return null;
 return match||null;
}
function isConfirmedHistoricalConstitution(value){
 const raw=String(value||'').trim();
 if(isAffirmativeConstitutionValue(raw))return true;
 // Explicit adoption with a recorded date/decision is affirmative too.
 return /^adopted\s+(?:on\s+)?(?:\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}|by\s+(?:special\s+)?resolution\b)/i.test(raw);
}

/**
 * snapshots should be newest first. For each company, first decisive status
 * (Yes or No) takes precedence. "b", blank and N/A do not create evidence.
 * Existing current explicit No / Yes / statutory notes are never changed.
 */
export function restoreHistoricalConstitutionStatuses(current,snapshots){
 validateMasterListing(current);
 const targets=current.columns.flatMap((c,i)=>
  isListingConstitutionColumn(c.label)?[i]:[]);
 if(!targets.length||!snapshots?.length)return {model:current,count:0,recovered:[],blocked:0};
 const archiveIndexes=snapshots.map(s=>historicalRows(validateMasterListing(s.model||s)));
 const seenCurrent=new Set(),uniqueRows=new Set();
 for(const row of current.rows){
  const id=companyIdentity(current,row);
  const key=id?.num?'r:'+id.num:id?.name?'n:'+id.name:null;
  if(!key)continue;
  if(seenCurrent.has(key))uniqueRows.delete(key);
  else{seenCurrent.add(key);uniqueRows.add(key);}
 }
 let rows=null,count=0,blocked=0;
 const recovered=[];
 for(let ri=0;ri<current.rows.length;ri++){
  const row=current.rows[ri],id=companyIdentity(current,row);
  const key=id?.num?'r:'+id.num:id?.name?'n:'+id.name:null;
  if(!key||!uniqueRows.has(key))continue;
  for(const ci of targets){
   const now=displayedListingValue(current,ci,row.values[ci]);
   if(now!=='N/A')continue;
   let decision=null;
   for(let hi=0;hi<archiveIndexes.length;hi++){
    const hit=historicalMatch(archiveIndexes[hi],id);
    if(!hit)continue;
    const recorded=hit.fields.map(f=>{
     if(f.status==='No')return 'No';
     if(isConfirmedHistoricalConstitution(f.value))return 'Yes';
     return null;
    }).filter(Boolean);
    if(!recorded.length)continue;
    // Mixed yes/no in same historical record is ambiguous.
    decision=recorded.every(v=>v===recorded[0])?recorded[0]:'conflict';
    break;
   }
   if(decision==='No'||decision==='conflict'){blocked++;continue;}
   if(decision!=='Yes')continue;
   if(!rows)rows=current.rows.slice();
   if(rows[ri]===row)rows[ri]={...row,values:row.values.slice()};
   rows[ri].values[ci]='Yes';count++;
   recovered.push({company:id.name,registration:id.num,index:ri,source:'history'});
  }
 }
 const updated=rows?{...current,rows}:current;
 if(rows)validateMasterListing(updated);
 return {model:updated,count,recovered,blocked};
}
