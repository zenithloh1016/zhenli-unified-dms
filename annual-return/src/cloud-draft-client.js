/** Cross-platform Annual Return drafts.
 * The signed-in DMS parent relays requests through its Supabase auth and RLS;
 * the iframe never stores authentication credentials or secrets.
 */
import {normalizeDocument} from './core.js';
import {readAnnualReturnDraft,saveAnnualReturnDraft} from './drafts.js';

export function createCloudDraftClient({getCompanyId,getScope,getDocument,applyDocument,onStatus}){
 const requests=new Map();
 let session=0,activeId=null,revision=0,ready=false,saving=false,dirty=false,conflict=false,timer=null;
 const isEmbedded=()=>window.parent!==window;
 const message=(text,error=false)=>onStatus?.(text,error);
 function call(operation,companyId,extras={}){
  if(!isEmbedded())return Promise.reject(Error('Cloud drafts require a signed-in UNICOSEC DMS session.'));
  const id='ar_cloud_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  return new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{requests.delete(id);reject(Error('Cloud operation timed out. Your local draft remains available.'));},30000);
   requests.set(id,{resolve,reject,timeout,companyId});
   window.parent.postMessage({type:'ZHENLI_DMS_AR_DRAFT_REQUEST',id,operation,companyId,...extras},window.location.origin);
  });
 }
 function receive(data){
  if(data?.type!=='ZHENLI_DMS_AR_DRAFT_RESPONSE')return false;
  const entry=requests.get(data.id);
  if(!entry||data.companyId!==entry.companyId)return true;
  clearTimeout(entry.timeout);requests.delete(data.id);
  if(data.ok)entry.resolve(data);
  else entry.reject(Error(String(data.error||'Cloud draft operation failed.')));
  return true;
 }
 function markEdited(){
  const id=getCompanyId();
  if(!isEmbedded()||!id||id!==activeId)return;
  dirty=true;
  if(ready&&!conflict)queueSave();
 }
 function queueSave(){
  if(timer)clearTimeout(timer);
  timer=setTimeout(()=>{timer=null;void save();},850);
 }
 async function save(){
  const id=getCompanyId();
  if(!ready||conflict||saving||!dirty||id!==activeId)return;
  const snapshot=structuredClone(getDocument()),previous=revision,token=session;
  dirty=false;saving=true;
  message('Syncing Annual Return draft to your private UNICOSEC account…');
  try{
   const response=await call('save',id,{revision:previous,document:snapshot});
   if(token!==session||getCompanyId()!==id)return;
   if(response.conflict){
    conflict=true;ready=false;dirty=true;
    message('A newer cloud draft exists. Your local draft is safe; use Sync Draft Now to choose the cloud copy.',true);
    return;
   }
   revision=Number(response.record?.revision)||previous+1;
   message('Cloud synced · Available on website, Windows and Android · '+new Date(response.record?.updatedAt||Date.now()).toLocaleString());
  }catch(error){
   if(token!==session)return;
   dirty=true;
   message('Saved locally; cloud sync failed: '+error.message+' Press Sync Draft Now to retry.',true);
  }finally{
   if(token===session){saving=false;if(ready&&dirty&&!conflict)queueSave();}
  }
 }
 async function open({force=false,preferRemote=false}={}){
  const id=getCompanyId(),scope=getScope();
  if(!isEmbedded()||!id||!/^dms:[a-z0-9-]{16,90}$/i.test(scope||''))return;
  if(!force&&activeId===id&&(ready||saving))return;
  if(timer){clearTimeout(timer);timer=null;}
  const token=++session;
  activeId=id;ready=false;revision=0;dirty=false;conflict=false;saving=false;
  message('Loading your Annual Return draft from the private cloud…');
  try{
   const response=await call('load',id);
   if(token!==session||id!==getCompanyId())return;
   const cloud=response.record;
   let local=null;
   try{local=readAnnualReturnDraft(localStorage,scope,id);}catch{}
   revision=Number(cloud?.revision)||0;
   if(cloud?.document){
    const document=normalizeDocument(cloud.document);
    if(String(document.company?.name||'').trim().replace(/\s+/g,' ').toUpperCase()!==
       String(getDocument()?.company?.name||'').trim().replace(/\s+/g,' ').toUpperCase())
     throw Error('Cloud draft belongs to a different company.');
    const localAt=Date.parse(local?.updatedAt||'')||0;
    const cloudAt=Date.parse(cloud.updatedAt||'')||0;
    if(preferRemote||!local||cloudAt>=localAt){
     applyDocument(document);
     // Cache locally without incorrectly triggering a new cloud revision.
     saveAnnualReturnDraft(localStorage,scope,id,document);
     message('Loaded cloud draft revision '+revision+' · Same draft available on web, Windows and Android.');
    }else{
     dirty=true;
     message('A newer draft exists on this device; securely uploading it to your UNICOSEC account…');
    }
   }else if(local){
    dirty=true;
    message('Uploading your existing local draft to make it available on other devices…');
   }else{
    message('Cloud ready. Edits will sync to web, Windows and Android.');
   }
   ready=true;
   if(dirty)queueSave();
  }catch(error){
   if(token!==session)return;
   ready=false;
   message('Local draft is safe, but the cloud draft could not be loaded: '+error.message,true);
  }
 }
 function syncNow(){
  if(!getCompanyId()||!isEmbedded()){
   message('Select a company through the signed-in UNICOSEC DMS to sync this draft.',true);return;
  }
  if(conflict){
   if(!confirm('Another device has a newer cloud draft. Load that version into the editor? The current local copy remains saved on this device.'))return;
   void open({force:true,preferRemote:true});return;
  }
  if(ready){
   dirty=true;
   if(timer)clearTimeout(timer);
   timer=null;void save();
  }else void open({force:true});
 }
 async function remove(companyId){
  if(!isEmbedded()||!companyId||companyId!==getCompanyId())return;
  const token=++session;
  ready=false;dirty=false;conflict=false;
  if(timer)clearTimeout(timer);
  try{
   await call('delete',companyId);
   if(token!==session)return;
   revision=0;
   message('Cloud draft removed. The open form has not been changed.');
  }catch(error){message('Local draft deleted; cloud removal failed: '+error.message,true);}
 }
 function reset(){
  session++;activeId=null;revision=0;ready=false;dirty=false;conflict=false;saving=false;
  if(timer){clearTimeout(timer);timer=null;}
 }
 return {receive,open,markEdited,syncNow,remove,reset};
}
