/**
 * Read auditor particulars only from the matched company's private Master Listing.
 * No inferred appointment, invented firm number, or cross-company fallback.
 */
import {validateMasterListing,companyData} from './master-listing-data.js';

const tidy=v=>String(v??'').trim();
const meaningful=v=>tidy(v)&&!/^(?:-|–|—|n\/a|na|nil|none|not appointed|not applicable)$/i.test(tidy(v));
const nameKey=v=>tidy(v).toUpperCase().replace(/\s+/g,' ').replace(/\./g,'');
const registered=v=>tidy(v).match(/\d{12}/)?.[0]||'';
const header=v=>tidy(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function auditorFromMasterListing(source,company){
 const model=validateMasterListing(source);
 if(!company||!meaningful(company.name))return null;
 const companyName=nameKey(company.name),reg=registered(company.registrationNo??company.registration_no);
 const matches=model.rows.filter(row=>{
  const info=companyData(model,row),rowReg=registered(info.registration);
  // A conflicting 12-digit registration always rejects a same-named row.
  if(reg&&rowReg)return reg===rowReg;
  return nameKey(info.name)===companyName;
 });
 if(matches.length!==1)return null;
 const row=matches[0],fields={name:'',registrationNo:'',address:''};
 for(let i=0;i<model.columns.length;i++){
  const label=header(model.columns[i].label),value=tidy(row.values[i]);
  if(!meaningful(value)||!/\b(?:auditor|auditors|audit|juruaudit)\b/.test(label))continue;
  if(/\b(?:address|alamat)\b/.test(label)){fields.address ||=value;continue;}
  if(/\b(?:registration|registered|firm no|firm number|af no|af number)\b/.test(label)&&
    /\b(?:no|number|registration|registered)\b/.test(label)){
    fields.registrationNo ||=value;continue;
  }
  if(/\b(?:fee|fees|date|appointed|appointment|status|remarks|change|resignation|financial|year|contact|email|telephone|phone|tin|tax)\b/.test(label))continue;
  if(/\b(?:name|firm|company|auditors|auditor|juruaudit)\b/.test(label))fields.name ||= value;
 }
 // Malaysian audit firm registrations are often appended to the auditor name.
 if(fields.name){
  const suffix=/\s*\(\s*((?:AF|NF)\s*[-/]?\s*\d{2,8})\s*\)\s*$/i.exec(fields.name);
  if(suffix){
   if(!fields.registrationNo)fields.registrationNo=suffix[1].replace(/\s+/g,'').toUpperCase();
   fields.name=fields.name.slice(0,suffix.index).trim();
  }
 }
 return Object.values(fields).some(meaningful)?fields:null;
}
