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
  let failed=false;
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
   failed=true;dirty=true;
   message('Saved locally; cloud sync failed: '+error.message+' Press Sync Draft Now to retry.',true);
  }finally{
   if(token===session){saving=false;if(ready&&dirty&&!conflict&&!failed)queueSave();}
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
    // Never discard changes made while a slow cloud load was in flight.
    if(dirty){
     conflict=true;ready=false;
     message('Edits were made while fetching the cloud draft. Your device copy is safe. Press Sync Draft Now to choose which copy to keep.',true);
     return;
    }
    const localAt=Date.parse(local?.updatedAt||'')||0;
    const cloudAt=Date.parse(cloud.updatedAt||'')||0;
    const differs=!!local&&JSON.stringify(local.data)!==JSON.stringify(document);
    if(differs&&localAt>cloudAt&&!preferRemote){
     conflict=true;ready=false;dirty=true;
     message('This device has a different local draft with a newer save time. Nothing was overwritten. Press Sync Draft Now to choose the cloud or device copy.',true);
     return;
    }
    if(differs){
     // Preserve the previous device draft as a separate, recoverable copy before
     // replacing it with the cloud version in the editor and device cache.
     try{
      saveAnnualReturnDraft(localStorage,scope,'backup-'+id+'-'+Date.now().toString(36),local.data,{updatedAt:local.updatedAt});
     }catch(error){
      conflict=true;ready=false;dirty=true;
      message('Cannot safely load cloud draft because local backup failed: '+error.message,true);
      return;
     }
    }
    applyDocument(document);
    saveAnnualReturnDraft(localStorage,scope,id,document,{updatedAt:cloud.updatedAt});
    message('Loaded cloud draft revision '+revision+' · Available on web, Windows and Android.'+
     (differs?' Previous device copy retained in local draft backups.':''));
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
 async function uploadLocalAfterReview(){
  const id=getCompanyId(),token=session;
  message('Checking the current cloud revision before uploading the device draft…');
  try{
   const latest=await call('load',id);
   if(token!==session||id!==getCompanyId())return;
   const currentRevision=Number(latest.record?.revision)||0;
   if(currentRevision!==revision){
    revision=currentRevision;
    message('The cloud changed again on another device. Press Sync Draft Now to review again before uploading.',true);
    return;
   }
   ready=true;conflict=false;dirty=true;
   await save(); // Server-side revision check still prevents concurrent overwrite.
  }catch(error){
   if(token===session)message('Could not verify the cloud revision: '+error.message,true);
  }
 }
 function syncNow(){
  if(!getCompanyId()||!isEmbedded()){
   message('Select a company through the signed-in UNICOSEC DMS to sync this draft.',true);return;
  }
  if(conflict){
   if(confirm('The Annual Return cloud and device copies differ. Press OK to LOAD the CLOUD copy (your device copy will be backed up). Press Cancel to consider uploading this device copy instead.')){
    void open({force:true,preferRemote:true});return;
   }
   if(confirm('UPLOAD this device draft to Supabase instead? This replaces the current cloud copy for other devices. Press Cancel to keep both copies unchanged.'))
    void uploadLocalAfterReview();
   return;
  }
  if(ready){
   if(dirty){
    if(timer)clearTimeout(timer);
    timer=null;void save();
   }else{
    // A manual sync with no pending local changes must FETCH the latest remote
    // revision, not spuriously upload a stale device copy.
    void open({force:true});
   }
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
 return {receive,open,markEdited,syncNow,remove,reset,isReady:()=>ready&&!conflict};
}
