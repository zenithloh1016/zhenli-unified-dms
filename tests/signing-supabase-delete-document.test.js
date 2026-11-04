import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/signing-supabase.js',import.meta.url),'utf8')
  .replace("import {createPdfSignaturePreview} from './signature-preview.js';",
    'const createPdfSignaturePreview=()=>({html:()=>"",mount:()=>{},reset:()=>{},drawBoxes:()=>{}});');
const {createSupabaseSigning}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const backend=readFileSync(new URL('../supabase/functions/dms-sequential-signing/index.ts',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const docId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function fixture(status='draft'){
  const actions=[];
  let docs=[{id:docId,name:'Resolution.pdf',pages:1,ready:false}];
  const db={functions:{invoke:async(_, {body})=>{
    actions.push(body);
    if(body.action==='admin-list')return {data:{requests:[{
      id:requestId,company:'TEST SDN BHD',subject:'Test',status,
      created_at:'2026-11-04T00:00:00Z',signedCount:0,signerCount:0,
      docCount:docs.length,signedPdfCount:0}],total:1}};
    if(body.action==='admin-mail-status')return {data:{connected:false}};
    if(body.action==='admin-detail')return {data:{request:{
      id:requestId,company:'TEST SDN BHD',subject:'Test',status,
      expiresAt:'2026-11-20T00:00:00Z',signers:[],documents:docs,boxes:[],audit:[]}}};
    if(body.action==='admin-delete-document'){
      docs=[];return {data:{removed:true,storageDeleted:true,boxesRemoved:1}};
    }
    throw Error('Unexpected '+body.action);
  }}};
  const ui=createSupabaseSigning({db,getCompanies:()=>[],update:()=>{}});
  return {ui,actions,docs:()=>docs};
}

test('PDF Delete shown only in unsigned drafts',async()=>{
  globalThis.document={getElementById:()=>null,querySelector:()=>null};
  for(const status of ['draft','completed','pending']){
    const {ui}=fixture(status);ui.mount();await tick();
    ui.onClick('ns-open',requestId);await tick();
    assert.equal(ui.render().includes('data-action="ns-delete-document"'),status==='draft');
  }
});

test('PDF removal asks typed confirmation and calls secure endpoint',async()=>{
  globalThis.document={getElementById:()=>null,querySelector:()=>null,activeElement:null};
  const original=globalThis.FormData;let value='DELETE DOCUMENT';
  globalThis.FormData=class {get(k){return k==='confirm'?value:null;}};
  try{
    const {ui,actions,docs}=fixture();ui.mount();await tick();
    ui.onClick('ns-open',requestId);await tick();
    ui.onClick('ns-delete-document',docId);
    assert.match(ui.render(),/DELETE DOCUMENT/);
    assert.equal(actions.filter(a=>a.action==='admin-delete-document').length,0);
    ui.onSubmit({id:'ns-confirm-delete'});await tick();await tick();
    const attempt=actions.find(a=>a.action==='admin-delete-document');
    assert.deepEqual({requestId:attempt.requestId,documentId:attempt.documentId,confirmation:attempt.confirmation},
      {requestId,documentId:docId,confirmation:'DELETE DOCUMENT'});
    assert.equal(docs().length,0);
    assert.match(ui.render(),/Draft PDF removed/);
  }finally{globalThis.FormData=original;}
});

test('backend validates draft, preserves active records and removes boxes',()=>{
  assert.match(backend,/if\(action==="delete-document"\)/);
  assert.match(backend,/body\.confirmation!=="DELETE DOCUMENT"/);
  assert.match(backend,/r\.status!=="draft"/);
  assert.match(backend,/if\(document\.finalPath\)/);
  assert.match(backend,/boxes:r\.boxes\.filter\(b=>b\.documentId!==document\.id\)/);
  assert.match(backend,/\.eq\("owner_id",user\)\.eq\("status","draft"\)/);
  assert.match(backend,/bucket\(\)\.remove\(\[validPath\]\)/);
});
