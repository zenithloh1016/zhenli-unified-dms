import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank} from '../annual-return/src/core.js';
import {importCombinedRegisterSnapshot} from '../annual-return/src/register-import.js';
import {reconcileAnnualReturnWithRegisters,syncAnnualReturnAfterRegisterSave}
 from '../src/annual-return-register-sync.js';

const field=(label,value)=>({type:'field',label,value});
const group=title=>({type:'group',title});
const record=(title,status)=>({type:'record',title,status});
const source=(people)=>({
 version:1,companyId:'company-1',companyName:'TEST SDN BHD',registrationNo:'202600000001',
 sections:[{title:'Register of Beneficial Owners',blocks:people.flatMap(p=>[
  group(p.former?'Former / Ceased':'Current / Active'),
  record(p.name,p.former?'Former':'Current'),
  field('Full Name',p.name),field('Identification No.',p.id),
  field('Residential Address',p.address||'IPOH')
 ])}]
});
const draftFrom=snapshot=>importCombinedRegisterSnapshot(cloneBlank(),snapshot).document;
function bo(document,index,label){
 const items=document.particulars;
 const start=items.findIndex(x=>x.type==='heading'&&x.en==='BENEFICIAL OWNER '+index);
 if(start<0)return undefined;
 let end=start+1;while(end<items.length&&items[end].type==='field')end++;
 return items.slice(start+1,end).find(x=>x.en===label);
}
const id=(doc,n=1)=>bo(doc,n,'NRIC / Passport No.')?.value;
const name=(doc,n=1)=>bo(doc,n,'Full Name')?.value;

test('changes synced statutory identifiers but preserves draft-specific manual overrides',()=>{
 const before=source([{name:'BO ALPHA',id:'OLD-123'}]);
 const after=source([{name:'BO ALPHA',id:'NEW-456'}]);
 const original=draftFrom(before);
 const synced=reconcileAnnualReturnWithRegisters(original,before,after);
 assert.equal(id(synced.document),'NEW-456');
 assert.equal(id(original),'OLD-123','the previous draft must not be mutated');
 assert.equal(synced.updated,1);
 bo(original,1,'NRIC / Passport No.').value='VERIFIED BY CLIENT';
 const overridden=reconcileAnnualReturnWithRegisters(original,before,after);
 assert.equal(id(overridden.document),'VERIFIED BY CLIENT');
 assert.equal(overridden.protectedFields,1);
});

test('fills empty draft fields and adds a genuinely new BO, without recreating removed headings',()=>{
 const before=source([{name:'BO ALPHA',id:'A001'}]);
 const after=source([{name:'BO ALPHA',id:'A001'},{name:'BO BRAVO',id:'PASS-002'}]);
 const existing=draftFrom(before);
 bo(existing,1,'Residential Address').value='';
 const merged=reconcileAnnualReturnWithRegisters(existing,before,after);
 assert.equal(name(merged.document,2),'BO BRAVO');
 assert.equal(id(merged.document,2),'PASS-002');
 assert.equal(id(merged.document,1),'A001');
 assert.equal(merged.document.particulars.filter(x=>x.en==='BENEFICIAL OWNER 2').length,1);
 const removed=draftFrom(after);
 const start=removed.particulars.findIndex(x=>x.type==='heading'&&x.en==='BENEFICIAL OWNER 2');
 let end=start+1;while(end<removed.particulars.length&&removed.particulars[end].type==='field')end++;
 removed.particulars.splice(start,end-start);
 const notRestored=reconcileAnnualReturnWithRegisters(removed,after,after);
 assert.equal(name(notRestored.document,2),undefined);
});

test('clears ceased BO fields when unchanged and prevents mixed identities after manual editing',()=>{
 const before=source([{name:'BO ALPHA',id:'A001'},{name:'BO BRAVO',id:'B002'}]);
 const after=source([{name:'BO ALPHA',id:'A001',former:true},{name:'BO BRAVO',id:'B002'}]);
 const existing=draftFrom(before);
 const safe=reconcileAnnualReturnWithRegisters(existing,before,after);
 assert.equal(name(safe.document,1),'BO BRAVO');
 assert.equal(id(safe.document,1),'B002');
 assert.equal(id(safe.document,2),'');
 assert.equal(name(safe.document,2),'');
 const manual=draftFrom(before);
 bo(manual,1,'Residential Address').value='CLIENT VERIFIED ADDRESS';
 const protectedResult=reconcileAnnualReturnWithRegisters(manual,before,after);
 assert.equal(name(protectedResult.document,1),'BO ALPHA');
 assert.equal(id(protectedResult.document,1),'A001');
 assert.equal(bo(protectedResult.document,1,'Residential Address').value,'CLIENT VERIFIED ADDRESS');
 assert.ok(protectedResult.protectedRecords>=1);
});

function mockDb(initial){
 const state={row:initial?{payload:initial,revision:2,updated_at:'2026-11-03T12:00:00Z'}:null,
  uploads:[],writes:0};
 return {state,
  from(table){
   assert.equal(table,'annual_return_drafts');
   const chain={
    candidate:null,select(){return this;},eq(){return this;},
    update(payload){this.candidate=payload;return this;},
    async maybeSingle(){
     if(this.candidate){
      state.row={payload:this.candidate.payload,revision:this.candidate.revision,
       updated_at:this.candidate.updated_at};state.writes++;
      return {data:{revision:state.row.revision,updated_at:state.row.updated_at},error:null};
     }
     return {data:state.row,error:null};
    }
   };
   return chain;
  },
  storage:{from(bucket){
   assert.equal(bucket,'dms-private');
   return {async upload(path,blob,options){
    assert.ok(path.includes('/annual-return/history/company-1-'));
    assert.equal(options.upsert,false);
    state.uploads.push({path,body:JSON.parse(await blob.text())});
    return {error:null};
   }};
  }}
 };
}
const company={id:'company-1',name:'TEST SDN BHD',registration_no:'202600000001',user_id:'user-1'};
const user={id:'user-1'};
const book=people=>({
 version:1,companyId:company.id,companyName:company.name,
 registrationNo:company.registration_no,createdAt:'2026-11-01',updatedAt:'2026-11-03',
 sheets:[{name:'Register of Beneficial Owners',rows:[
  ['Full Name','Identification No.','Residential Address', 'Cessation Date'],
  ...people.map(p=>[p.name,p.id,'IPOH',p.former?'01/11/2026':''])
 ]}]
});

test('no existing Annual Return cloud draft means no new draft and no backup',async()=>{
 const db=mockDb(null);
 const result=await syncAnnualReturnAfterRegisterSave(db,{
  user,company,previousBook:book([]),updatedBook:book([{name:'BO ALPHA',id:'A001'}])
 });
 assert.deepEqual(result,{found:false,changed:false});
 assert.equal(db.state.writes,0);
 assert.equal(db.state.uploads.length,0);
});

test('auto-sync backs up previous cloud revision and writes the new ID exactly once',async()=>{
 const earlier=book([{name:'BO ALPHA',id:'A001'}]);
 const latest=book([{name:'BO ALPHA',id:'A002'}]);
 const draft=draftFrom(source([{name:'BO ALPHA',id:'A001'}]));
 const db=mockDb(draft);
 const result=await syncAnnualReturnAfterRegisterSave(db,{
  user,company,previousBook:earlier,updatedBook:latest
 });
 assert.equal(result.changed,true);
 assert.equal(db.state.writes,1);
 assert.equal(db.state.uploads.length,1);
 assert.equal(db.state.uploads[0].body.document.particulars.find(x=>x.en==='NRIC / Passport No.')?.value,'');
 assert.equal(db.state.uploads[0].body.revision,2);
 assert.equal(db.state.row.revision,3);
 assert.equal(id(db.state.row.payload),'A002');
});
