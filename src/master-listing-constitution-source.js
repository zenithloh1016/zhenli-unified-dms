import {
 validateMasterListing,isListingConstitutionColumn,companyData
} from './master-listing-data.js';

const REG=/\d{12}/;

/**
 * Apply a company-specific import from the owner-private Supabase source,
 * matching by exact SSM registration number. The map is never in web source.
 * Source version is recorded after a successful backup-first save to ensure
 * ordinary later edits are not overwritten by the same source upload.
 */
export function applyUploadedConstitutionStatuses(model,statuses,sourceVersion){
 validateMasterListing(model);
 if(!sourceVersion || typeof sourceVersion!=='string'||
    !statuses || typeof statuses!=='object' || Array.isArray(statuses))
  throw Error('Invalid Constitution source information.');
 if(model.constitutionSourceVersion===sourceVersion)
  return {model,updated:0,matched:0,unmatched:0,alreadyApplied:true};
 const cols=model.columns.flatMap((col,index)=>
  isListingConstitutionColumn(col.label)?[index]:[]);
 if(!cols.length)throw Error('Constitution column not found in saved Master Listing.');
 let rows=null,updated=0,matched=0;
 const seen=new Set();
 const getRegistration=(company)=>{
  const raw=String(company?.registration||'');
  const m=raw.match(REG);
  return m?m[0]:null;
 };
 for(let ri=0;ri<model.rows.length;ri++){
  const old=model.rows[ri];
  const reg=getRegistration(companyData(model,old));
  if(!reg||!Object.prototype.hasOwnProperty.call(statuses,reg))continue;
  const status=statuses[reg];
  if(!['Yes','N/A'].includes(status))
   throw Error('Invalid Constitution status in private source.');
  matched++;seen.add(reg);
  for(const ci of cols){
   if(String(old.values[ci]??'')===status)continue;
   if(!rows)rows=model.rows.slice();
   if(rows[ri]===old)rows[ri]={...old,values:old.values.slice()};
   rows[ri].values[ci]=status;updated++;
  }
 }
 const all=Object.keys(statuses);
 const revised={
  ...model,
  ...(rows?{rows}:{}),
  constitutionSourceVersion:sourceVersion,
  constitutionSourceMatchedAt:new Date().toISOString()
 };
 validateMasterListing(revised);
 return {model:revised,updated,matched,unmatched:all.length-seen.size,
  alreadyApplied:false};
}
