/**
 * Reconcile historical company-name changes without touching any imported
 * statutory fields. Documents companies are authoritative when a UNIQUE
 * registration number identifies the same company in Master Listing.
 */
import {companyData,validateMasterListing,sortMasterListingCompanies} from './master-listing-data.js';

const nameKey=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
export function registrationIdentity(value){
  const raw=nameKey(value);
  if(!raw||raw==='N/A')return '';
  // The Excel sheet commonly has the twelve-digit SSM number only, while
  // Documents includes the old identifier in parentheses.
  const found=raw.match(/\d{12}/);
  if(found)return found[0];
  const compact=raw.replace(/[^A-Z0-9]/g,'');
  return compact.length>=6?compact:'';
}

export function reconcileListingCompanyNames(model,documentsCompanies){
  validateMasterListing(model);
  if(!Array.isArray(documentsCompanies))
    throw Error('Documents companies are required for name synchronisation.');
  const docsByReg=new Map(),listingByReg=new Map();
  for(const co of documentsCompanies){
    const key=registrationIdentity(co?.registration_no);
    if(!key)continue;
    if(!docsByReg.has(key))docsByReg.set(key,[]);
    docsByReg.get(key).push(co);
  }
  for(const row of model.rows){
    const key=registrationIdentity(companyData(model,row).registration);
    if(!key)continue;
    if(!listingByReg.has(key))listingByReg.set(key,[]);
    listingByReg.get(key).push(row);
  }
  const names=new Map();
  for(const row of model.rows){
    const name=nameKey(companyData(model,row).name);
    if(!names.has(name))names.set(name,[]);
    names.get(name).push(row);
  }
  let conflicts=0,matched=0;
  const renamed=[];
  const rows=model.rows.map(row=>{
    const info=companyData(model,row);
    const key=registrationIdentity(info.registration);
    if(!key)return row;
    const docs=docsByReg.get(key)||[];
    if(!docs.length)return row;
    if(docs.length!==1||listingByReg.get(key)?.length!==1){
      conflicts++;return row;
    }
    const co=docs[0];
    const currentName=String(row.values[model.nameColumn]);
    const nextName=String(co.name||'').trim();
    if(nextName.length<3||nextName.length>250){conflicts++;return row;}
    matched++;
    if(currentName===nextName)return row;
    const collisions=(names.get(nameKey(nextName))||[]).filter(x=>x.id!==row.id);
    if(collisions.length){conflicts++;return row;}
    renamed.push({rowId:row.id,from:currentName,to:nextName,registration:key});
    const values=row.values.slice();
    values[model.nameColumn]=nextName;
    return {...row,values};
  });
  if(!renamed.length)return {model,renamed,matched,conflicts};
  const sorted=sortMasterListingCompanies({...model,rows}).model;
  return {model:sorted,renamed,matched,conflicts};
}
