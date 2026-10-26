/**
 * Constitution evidence in DMS Documents. Root "Constitution" folders exist
 * for most companies even when empty, so only an ACTUAL uploaded document is
 * affirmative evidence. Never infer No from a missing upload.
 */
import {
 findCompanyMatch,isListingConstitutionColumn,displayedListingValue,
 validateMasterListing
} from './master-listing-data.js';
import {isExistingConstitutionFolder} from './constitution-folders.js';

export function isConstitutionDocumentFilename(name){
 const filename=String(name||'').trim();
 if(!filename || /(?:draft|sample|template|specimen|unsigned|blank|checklist)/i.test(filename))
  return false;
 return /\bconstitution\b|\bmemorandum\b|\barticles\s+of\s+association\b/i.test(filename);
}
export function companiesWithConstitutionDocuments(folders,documents){
 const byId=new Map((folders||[]).filter(f=>f?.id).map(f=>[f.id,f]));
 const existing=new Set();
 function insideConstitution(folderId,companyId){
  const seen=new Set();
  let id=folderId;
  while(id && !seen.has(id)){
   seen.add(id);
   const f=byId.get(id);
   if(!f || f.company_id!==companyId)return false;
   if(isExistingConstitutionFolder(f))return true;
   id=f.parent_id;
  }
  return false;
 }
 for(const doc of documents||[]){
  if(!doc?.company_id||!doc.name)continue;
  // A draft or template is not evidence of an adopted Constitution, even
  // when it was uploaded to the dedicated Constitution folder.
  if(/\b(?:draft|sample|template|specimen|unsigned|blank|checklist)\b/i.test(doc.name))continue;
  if(insideConstitution(doc.folder_id,doc.company_id)||
     isConstitutionDocumentFilename(doc.name))
   existing.add(doc.company_id);
 }
 return existing;
}
export function applyConstitutionDocumentEvidence(model,companies,folders,documents){
 validateMasterListing(model);
 const cols=model.columns.flatMap((c,i)=>isListingConstitutionColumn(c.label)?[i]:[]);
 if(!cols.length)return {model,count:0,matchedCompanies:0,conflicts:0};
 const known=companiesWithConstitutionDocuments(folders,documents);
 if(!known.size)return {model,count:0,matchedCompanies:0,conflicts:0};
 let rows=null,count=0,matchedCompanies=0,conflicts=0;
 const used=new Set();
 for(let ri=0;ri<model.rows.length;ri++){
  const row=model.rows[ri],company=findCompanyMatch(model,row,companies);
  if(!company||!known.has(company.id)||used.has(company.id))continue;
  used.add(company.id);matchedCompanies++;
  for(const ci of cols){
   const status=displayedListingValue(model,ci,row.values[ci]);
   if(status==='Yes')continue;
   // "No" is an explicit assertion and must be verified manually if the
   // folder contains an apparently conflicting document.
   if(status==='No'){conflicts++;continue;}
   if(status!=='N/A')continue; // preserve detailed statutory notes
   if(!rows)rows=model.rows.slice();
   if(rows[ri]===row)rows[ri]={...row,values:row.values.slice()};
   rows[ri].values[ci]='Yes';count++;
  }
 }
 const revised=rows?{...model,rows}:model;
 if(rows)validateMasterListing(revised);
 return {model:revised,count,matchedCompanies,conflicts};
}
