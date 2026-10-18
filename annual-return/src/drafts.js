/* Annual Return device-local draft storage.
 * No network or external destinations; scoped to DMS signed-in user and company.
 * The user may manually delete a draft. Local drafts are not cloud backups.
 */
import {normalizeDocument} from './core.js';
const PREFIX='zhenli:annual-return:local-draft:v1:';
const MAX_JSON=3_500_000;
const k=(scope,id)=>PREFIX+encodeURIComponent(String(scope||'standalone'))+':'+encodeURIComponent(String(id||'blank'));
export function saveAnnualReturnDraft(storage,scope,id,doc){
  const normalized=normalizeDocument(doc);
  const item={companyId:String(id||'blank'),name:normalized.company.name||'Untitled Annual Return',
    registrationNo:normalized.company.no||'',updatedAt:new Date().toISOString(),data:normalized};
  const body=JSON.stringify(item);
  if(body.length>MAX_JSON)throw Error('This draft is too large for local storage. Remove oversized text entries first.');
  storage.setItem(k(scope,id),body);
  return {key:k(scope,id),...item,data:undefined};
}
export function readAnnualReturnDraft(storage,scope,id){
  const raw=storage.getItem(k(scope,id));
  if(!raw)return null;
  const value=JSON.parse(raw);
  if(!value?.data?.particulars||!Array.isArray(value.data.particulars))throw Error('Saved draft has an invalid format.');
  return {...value,data:normalizeDocument(value.data)};
}
export function listAnnualReturnDrafts(storage,scope){
  const prefix=PREFIX+encodeURIComponent(String(scope||'standalone'))+':';
  const drafts=[];
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);
    if(!key?.startsWith(prefix))continue;
    try{
      const raw=JSON.parse(storage.getItem(key));
      if(!raw||!Array.isArray(raw.data?.particulars))continue;
      drafts.push({key,companyId:raw.companyId,name:raw.name,registrationNo:raw.registrationNo,
        updatedAt:raw.updatedAt||'',count:raw.data.particulars.filter(x=>x.type==='field'&&String(x.value||'').trim()).length});
    }catch{/* Keep other saved drafts accessible if one entry is damaged. */}
  }
  return drafts.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
export function removeAnnualReturnDraft(storage,key,scope){
  const prefix=PREFIX+encodeURIComponent(String(scope||'standalone'))+':';
  if(!String(key).startsWith(prefix))throw Error('Cannot delete a draft outside this user workspace.');
  storage.removeItem(key);
}
export function draftIdOfKey(key,scope){
  const prefix=PREFIX+encodeURIComponent(String(scope||'standalone'))+':';
  if(!String(key).startsWith(prefix))throw Error('Draft belongs to a different workspace.');
  return decodeURIComponent(String(key).slice(prefix.length));
}
