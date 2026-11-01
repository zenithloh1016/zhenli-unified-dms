import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank} from '../src/core.js';
import {createCloudDraftClient} from '../src/cloud-draft-client.js';
import {saveAnnualReturnDraft,listAnnualReturnDrafts,readAnnualReturnDraft} from '../src/drafts.js';

const COMPANY_ID='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SCOPE='dms:11111111-2222-4333-8444-555555555555';
const NAME='TEST ANNUAL RETURN SDN. BHD.';
function documentWith(value){
 const doc=cloneBlank();
 doc.company.name=NAME;
 doc.company.no='202001000001';
 for(const row of doc.particulars){
  if(row.type!=='field')continue;
  if(row.en==='Company Name')row.value=NAME;
  if(row.en==='Company Registration No.')row.value=doc.company.no;
  if(row.en==='Annual Return Year')row.value=value;
 }
 return doc;
}
function storage(){
 const records=new Map();
 return {get length(){return records.size;},key:i=>[...records.keys()][i]??null,
  getItem:key=>records.get(key)??null,
  setItem:(key,value)=>records.set(key,String(value)),
  removeItem:key=>records.delete(key)};
}
function fixture({remote,local,remoteAt='2026-10-31T08:00:00Z',localAt='2026-10-31T07:00:00Z'}){
 globalThis.localStorage=storage();
 if(local)saveAnnualReturnDraft(localStorage,SCOPE,COMPANY_ID,local,{updatedAt:localAt});
 let view=local??documentWith(''),readCount=0,saveCount=0,applyCount=0,client;
 let revision=10,cloud=remote;
 const messages=[];
 globalThis.window={location:{origin:'https://localhost'},parent:{postMessage(request){
  queueMicrotask(()=>{
   if(request.operation==='load'){
    readCount++;
    client.receive({type:'ZHENLI_DMS_AR_DRAFT_RESPONSE',id:request.id,
     companyId:COMPANY_ID,ok:true,
     record:cloud?{document:cloud,revision,updatedAt:remoteAt}:null});
   }else if(request.operation==='save'){
    saveCount++;
    assert.equal(request.revision,revision);
    cloud=request.document;revision++;
    client.receive({type:'ZHENLI_DMS_AR_DRAFT_RESPONSE',id:request.id,
     companyId:COMPANY_ID,ok:true,
     record:{revision,updatedAt:new Date().toISOString()}});
   }
  });
 }}};
 globalThis.confirm=()=>true;
 client=createCloudDraftClient({getCompanyId:()=>COMPANY_ID,getScope:()=>SCOPE,
  getDocument:()=>view,applyDocument:doc=>{view=doc;applyCount++;},
  onStatus:message=>messages.push(message)});
 return {client,view:()=>view,reads:()=>readCount,saves:()=>saveCount,
  applies:()=>applyCount,messages};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('Manual Sync Draft Now refreshes the server copy instead of re-uploading unchanged data',async()=>{
 const f=fixture({remote:documentWith('2026'),local:documentWith('2026')});
 await f.client.open();
 assert.equal(f.reads(),1);
 f.client.syncNow();
 await settle();
 assert.equal(f.reads(),2);
 assert.equal(f.saves(),0);
});

test('An older local draft is backed up when newer cloud content is loaded',async()=>{
 const f=fixture({remote:documentWith('2026'),local:documentWith('2025')});
 await f.client.open();
 assert.equal(f.view().particulars.find(x=>x.en==='Annual Return Year')?.value,'2026');
 assert.equal(f.saves(),0);
 const backups=listAnnualReturnDrafts(localStorage,SCOPE).filter(x=>x.companyId.startsWith('backup-'));
 assert.equal(backups.length,1);
 assert.equal(readAnnualReturnDraft(localStorage,SCOPE,COMPANY_ID).data.particulars.find(x=>x.en==='Annual Return Year')?.value,'2026');
});

test('Newer unsynced local draft is never silently uploaded over the existing cloud copy',async()=>{
 const f=fixture({remote:documentWith('2025'),local:documentWith('2026'),
  localAt:'2026-11-01T09:00:00Z',remoteAt:'2026-10-31T09:00:00Z'});
 await f.client.open();
 assert.equal(f.saves(),0);
 assert.equal(f.applies(),0);
 assert.match(f.messages.at(-1),/Press Sync Draft Now/);
});
