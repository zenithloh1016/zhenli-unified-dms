/**
 * Conservative, company-scoped Statutory Registers -> existing Annual Return
 * cloud draft sync. Never creates a draft or overwrites independently edited
 * particulars. Source changes are compared with the PREVIOUS saved register,
 * not an assumed "blank" draft, so truly imported values may be refreshed.
 */
import {cloneBlank,normalizeDocument} from '../annual-return/src/core.js';
import {importCombinedRegisterSnapshot} from '../annual-return/src/register-import.js';
import {combinedRegisterSnapshot} from './statutory-ar-bridge.js';
import {annualReturnCloudAction} from './annual-return-cloud.js';

const recordHeading=/^(?:DIRECTOR|MEMBER|BENEFICIAL OWNER|REGISTERED CHARGE) \d+$/i;
const clean=v=>String(v??'').trim();
const scope=(section,heading)=>section+'\u001f'+heading;
const fieldKey=(group,name,index)=>group+'\u001f'+name+'\u001f'+index;

function walk(items){
 const fields=new Map(),headings=new Map(),sections=new Map();
 let section='',heading='',seen=new Map();
 for(let index=0;index<items.length;index++){
  const item=items[index];
  if(item.type==='section'){
   section=clean(item.en);heading='';seen=new Map();
   sections.set(section,index);
  }else if(item.type==='heading'){
   heading=clean(item.en);seen=new Map();
   headings.set(scope(section,heading),index);
  }else if(item.type==='field'){
   const group=scope(section,heading),key=group+'\u001f'+clean(item.en);
   const occurrence=seen.get(key)||0;seen.set(key,occurrence+1);
   fields.set(fieldKey(group,clean(item.en),occurrence),{item,index,group});
  }
 }
 return {fields,headings,sections};
}
function projected(snapshot){
 return snapshot?importCombinedRegisterSnapshot(cloneBlank(),snapshot).document:cloneBlank();
}
function findSectionEnd(items,start){
 let stop=start+1;
 while(stop<items.length&&items[stop].type!=='section')stop++;
 return stop;
}
/** Reconcile actual draft values with source-only values before/after save. */
export function reconcileAnnualReturnWithRegisters(document,previous,current){
 if(!document||!Array.isArray(document.particulars))
  throw Error('A saved Annual Return draft is required.');
 const draft=normalizeDocument(document);
 const oldMap=walk(projected(previous).particulars);
 const newDoc=projected(current),nextMap=walk(newDoc.particulars);
 let draftMap=walk(draft.particulars),filled=0,updated=0,cleared=0,protectedFields=0,protectedRecords=0;

 // Add only genuinely NEW source records. Do not restore a heading that a user
 // deliberately removed from a draft whose older source already contained it.
 for(const [group,newIndex] of nextMap.headings){
  const [section,heading]=group.split('\u001f');
  if(!recordHeading.test(heading)||oldMap.headings.has(group)||
     draftMap.headings.has(group))continue;
  const start=draftMap.sections.get(section);
  if(start===undefined)continue; // Respect user-deleted sections.
  const model=[];
  for(let i=newIndex;i<newDoc.particulars.length;i++){
   const item=newDoc.particulars[i];
   if(i>newIndex&&item.type!=='field')break;
   model.push(structuredClone(item));
  }
  if(!model.some(x=>x.type==='field'&&clean(x.value))||
     draft.particulars.length+model.length>1200)continue;
  draft.particulars.splice(findSectionEnd(draft.particulars,start),0,...model);
  filled+=model.filter(x=>x.type==='field'&&clean(x.value)).length;
  draftMap=walk(draft.particulars);
 }

 const blocked=new Set();
 // A record shifted because a current director/member/BO ceased or another
 // record entered: don't mix manually edited details of the old person with
 // the new person's identifiers. Entire record is protected for review.
 for(const [group] of draftMap.headings){
  const heading=group.split('\u001f')[1];
  if(!recordHeading.test(heading))continue;
  const oldIdentity=[...oldMap.fields.entries()].filter(([k,v])=>
   v.group===group&&/\u001f(?:Full Name|Individual Full Name|Corporate Name|Secretary Name|Registered No\.)\u001f0$/.test(k))
   .map(([,v])=>clean(v.item.value)).find(Boolean)||'';
  const nextIdentity=[...nextMap.fields.entries()].filter(([k,v])=>
   v.group===group&&/\u001f(?:Full Name|Individual Full Name|Corporate Name|Secretary Name|Registered No\.)\u001f0$/.test(k))
   .map(([,v])=>clean(v.item.value)).find(Boolean)||'';
  if(oldIdentity===nextIdentity)continue;
  const manuallyEdited=[...draftMap.fields].some(([key,v])=>
   v.group===group&&clean(v.item.value)!==''&&
   clean(v.item.value)!==clean(oldMap.fields.get(key)?.item.value));
  if(manuallyEdited){blocked.add(group);protectedRecords++;}
 }

 for(const [key,{item,group}] of draftMap.fields){
  if(blocked.has(group))continue;
  const before=clean(oldMap.fields.get(key)?.item.value);
  const after=clean(nextMap.fields.get(key)?.item.value);
  const existing=clean(item.value);
  if(after===before)continue;
  // A user-verified value that differs from the previous register always wins.
  if(existing&&existing!==before){protectedFields++;continue;}
  // Never clear a manually populated field when old statutory data was blank.
  if(!after&&!before)continue;
  if(existing===after)continue;
  item.value=after;
  if(!existing)filled++;
  else if(!after)cleared++;
  else updated++;
 }
 const changed=filled+updated+cleared>0;
 return {document:draft,changed,filled,updated,cleared,protectedFields,protectedRecords};
}

/** Only runs AFTER Statutory Registers are durably saved in private storage. */
export async function syncAnnualReturnAfterRegisterSave(db,{
 user,company,previousBook,updatedBook,bucket='dms-private'
}){
 if(!db||!user?.id||company?.user_id!==user.id||
    !company?.id||updatedBook?.companyId!==company.id)
  throw Error('Invalid company for automatic Annual Return synchronisation.');
 let previous=null;
 if(previousBook){
  previous=combinedRegisterSnapshot(previousBook,{
   companyId:company.id,companyName:company.name,
   registrationNo:company.registration_no||''
  });
 }
 const current=combinedRegisterSnapshot(updatedBook,{
  companyId:company.id,companyName:company.name,
  registrationNo:company.registration_no||''
 });
 for(let attempt=0;attempt<3;attempt++){
  const {record}=await annualReturnCloudAction(db,{user,company,operation:'load'});
  if(!record?.document)return {found:false,changed:false};
  const result=reconcileAnnualReturnWithRegisters(record.document,previous,current);
  if(!result.changed)return {found:true,...result};
  // Existing draft is backed up privately before the cloud revision changes.
  // Even concurrent attempts leave an intact, owner-only previous version.
  const history=user.id+'/annual-return/history/'+company.id+'-'+Date.now()+
   '-'+crypto.randomUUID()+'.json';
  const body=new Blob([JSON.stringify({
   companyId:company.id,revision:record.revision,updatedAt:record.updatedAt,
   document:record.document,source:'statutory-register-auto-sync'
  })],{type:'application/json'});
  const {error:backupError}=await db.storage.from(bucket).upload(history,body,{
   upsert:false,contentType:'application/json',cacheControl:'0'
  });
  if(backupError)throw Error('Automatic Annual Return update paused because its private backup failed: '+backupError.message);
  const outcome=await annualReturnCloudAction(db,{
   user,company,operation:'save',document:result.document,revision:record.revision
  });
  if(!outcome.conflict)return {found:true,...result,revision:outcome.record.revision,history};
 }
 throw Error('Annual Return cloud draft changed concurrently; saved registers remain safe. Reopen the draft to review.');
}
