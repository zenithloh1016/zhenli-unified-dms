import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {annualReturnCloudAction} from '../src/annual-return-cloud.js';

const repoSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const editorSource=readFileSync(new URL('../annual-return/src/main.js',import.meta.url),'utf8');
const childSource=readFileSync(new URL('../annual-return/src/cloud-draft-client.js',import.meta.url),'utf8');
const uiSource=readFileSync(new URL('../annual-return/index.html',import.meta.url),'utf8');

function mockDb(){
 let row=null;
 const db={from(name){
  assert.equal(name,'annual_return_drafts');
  const qs={filters:[],op:'read',value:null,
   select(){return this;},
   eq(key,value){this.filters.push([key,value]);return this;},
   maybeSingle(){
    const matches=row&&this.filters.every(([k,v])=>String(row[k])===String(v));
    if(this.op==='insert'){
     if(row)return Promise.resolve({data:null,error:{code:'23505',message:'duplicate'}});
     row=this.value;return Promise.resolve({data:row,error:null});
    }
    if(this.op==='update'){
     if(!matches)return Promise.resolve({data:null,error:null});
     row={...row,...this.value};return Promise.resolve({data:row,error:null});
    }
    return Promise.resolve({data:matches?row:null,error:null});
   },
   insert(value){this.op='insert';this.value=value;return this;},
   update(value){this.op='update';this.value=value;return this;},
   delete(){this.op='delete';return this;},
   then(resolve,reject){
    if(this.op==='delete'){
     if(row&&this.filters.every(([k,v])=>String(row[k])===String(v)))row=null;
     return Promise.resolve({error:null}).then(resolve,reject);
    }
    return this.maybeSingle().then(resolve,reject);
   }
  };return qs;
 }};
 return {db,get:()=>row};
}
const user={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'};
const company={id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',user_id:user.id,name:'RSSH SERVICES SDN BHD'};
const doc={company:{name:company.name},particulars:[{type:'field',en:'Name',value:'Example'}]};
test('first cloud save and load use signed-in user and company',async()=>{
 const store=mockDb();
 const created=await annualReturnCloudAction(store.db,{user,company,operation:'save',document:doc,revision:0});
 assert.equal(created.record.revision,1);
 const fetched=await annualReturnCloudAction(store.db,{user,company,operation:'load'});
 assert.equal(fetched.record.revision,1);
 assert.deepEqual(fetched.record.document,doc);
});
test('second device cannot overwrite a newer revision',async()=>{
 const store=mockDb();
 await annualReturnCloudAction(store.db,{user,company,operation:'save',document:doc,revision:0});
 const change={...doc,particulars:[{type:'field',en:'Name',value:'Latest'}]};
 const result=await annualReturnCloudAction(store.db,{user,company,operation:'save',document:change,revision:1});
 assert.equal(result.record.revision,2);
 const old=await annualReturnCloudAction(store.db,{user,company,operation:'save',document:doc,revision:1});
 assert.equal(old.conflict,true);
 assert.equal(old.record.document.particulars[0].value,'Latest');
});
test('DMS rejects other account company and invalid draft payloads',async()=>{
 const store=mockDb();
 await assert.rejects(()=>annualReturnCloudAction(store.db,{user:{id:'different'},company,operation:'load'}),/signed-in/);
 await assert.rejects(()=>annualReturnCloudAction(store.db,{user,company,operation:'save',document:{},revision:0}),/invalid/);
 await assert.rejects(()=>annualReturnCloudAction(store.db,{user,company,operation:'save',document:doc,revision:-1}),/revision/);
});
test('cloud draft deletion removes only the selected company row',async()=>{
 const store=mockDb();
 await annualReturnCloudAction(store.db,{user,company,operation:'save',document:doc,revision:0});
 await annualReturnCloudAction(store.db,{user,company,operation:'delete'});
 assert.equal((await annualReturnCloudAction(store.db,{user,company,operation:'load'})).record,null);
});
test('website Windows APK use same parent auth relay and one editor cloud client',()=>{
 assert.match(repoSource,/import \{annualReturnCloudAction\} from '\.\/annual-return-cloud\.js'/);
 assert.match(repoSource,/ZHENLI_DMS_AR_DRAFT_REQUEST/);
 assert.match(repoSource,/ZHENLI_DMS_AR_DRAFT_RESPONSE/);
 assert.match(editorSource,/import \{createCloudDraftClient\} from '\.\/cloud-draft-client\.js'/);
 assert.match(editorSource,/cloudDraft\.markEdited\(\)/);
 assert.match(editorSource,/cloudDraft\.open\(/);
 assert.match(editorSource,/cloudDraft\.receive\(event\.data\)/);
 assert.match(editorSource,/cloudDraft\.syncNow\(\)/);
 assert.match(childSource,/cloud draft/i);
 assert.match(childSource,/updatedAt:cloud\.updatedAt/);
 assert.match(childSource,/if\(response\.conflict\)/);
 assert.match(uiSource,/id="cloud-sync-now"/);
 assert.match(uiSource,/id="cloud-sync-status"/);
});
