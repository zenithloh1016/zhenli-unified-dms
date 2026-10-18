/* Annual Return drafts are device-local, per browser/app and per DMS user.
 * No tokens, NRIC values or company data are ever placed in URLs or GitHub.
 */
export const DRAFT_STORAGE_KEY='zhenli:annual-return:saved-drafts:v1';
const MAX_DRAFTS=200,MAX_SNAPSHOT=2_500_000;
const validScope=s=>typeof s==='string'&&s.length>0&&s.length<=180;
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9:_-]{1,150}$/.test(s);
export function createDraftStore(storage,key=DRAFT_STORAGE_KEY){
 if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw Error('On-device drafts are unavailable.');
 const read=()=>{
  const raw=storage.getItem(key);
  if(!raw)return [];
  let parsed;
  try{parsed=JSON.parse(raw);}catch{throw Error('Stored drafts could not be read. Existing data has not been replaced.');}
  if(!Array.isArray(parsed))throw Error('Stored drafts have an unsupported format. They have not been overwritten.');
  return parsed.filter(x=>x&&validScope(x.scope)&&validId(x.id)&&x.snapshot&&Array.isArray(x.snapshot.particulars));
 };
 return {
  list(scope){
   if(!validScope(scope))return [];
   return read().filter(x=>x.scope===scope).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
    .map(({scope:ignore,snapshot:ignore2,...meta})=>meta);
  },
  load(scope,id){
   if(!validScope(scope)||!validId(id))return null;
   const found=read().find(x=>x.scope===scope&&x.id===id);
   return found?structuredClone(found.snapshot):null;
  },
  save(scope,id,snapshot,companyId=''){
   if(!validScope(scope)||!validId(id))throw Error('Draft workspace is not ready. Please try again.');
   if(!snapshot||!Array.isArray(snapshot.particulars)||snapshot.particulars.length>1200)throw Error('Invalid Annual Return draft.');
   const size=JSON.stringify(snapshot).length;
   if(size>MAX_SNAPSHOT)throw Error('Annual Return draft exceeds on-device storage limit. Remove unnecessary large fields.');
   const item={scope,id,companyId:String(companyId||'').slice(0,130),
    companyName:String(snapshot.company?.name||'Unnamed Annual Return').slice(0,250),
    registrationNo:String(snapshot.company?.no||'').slice(0,120),
    year:String(snapshot.company?.arYear||'').slice(0,12),
    updatedAt:new Date().toISOString(),snapshot};
   const entries=read().filter(x=>!(x.scope===scope&&x.id===id));
   entries.unshift(item);
   if(entries.length>MAX_DRAFTS)throw Error('This device already has 200 Annual Return drafts. Delete an unwanted saved draft before adding another.');
   entries.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
   try{storage.setItem(key,JSON.stringify(entries));}
   catch(err){throw Error('Could not save the draft on this device (storage full or blocked). Check browser storage permissions.');}
   return {id:item.id,updatedAt:item.updatedAt,companyName:item.companyName};
  },
  remove(scope,id){
   if(!validScope(scope)||!validId(id))return false;
   const entries=read(),remaining=entries.filter(x=>!(x.scope===scope&&x.id===id));
   if(remaining.length===entries.length)return false;
   storage.setItem(key,JSON.stringify(remaining));return true;
  }
 };
}
