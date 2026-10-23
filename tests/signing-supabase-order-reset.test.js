import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../src/signing-supabase.js',import.meta.url),'utf8')
  .replace("import {createPdfSignaturePreview} from './signature-preview.js';",
    "const createPdfSignaturePreview=globalThis.__orderResetPreview;");
globalThis.__orderResetPreview=()=>({
  html:()=>'<div>pdf preview</div>',mount:()=>{},reset:()=>{},drawBoxes:()=>{}
});
globalThis.confirm=()=>true;
const {createSupabaseSigning}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('DMS UI reorders only unsigned signers and resets to a separate preserved draft',async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const cloneId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const signer=(id,position,signedAt=null)=>({id,position,signedAt,email:id+'@example.test',name:'Signer '+id});
  const original={id,status:'pending',company:'TEST SDN BHD',subject:'Directors resolution',
    note:'Please sign',expiresAt:'2026-11-06T00:00:00Z',
    signers:[signer('s1',1,'2026-10-20T00:00:00Z'),signer('s2',2),signer('s3',3)],
    documents:[{id:'pdf-id',name:'Test.pdf',pages:1}],boxes:[]};
  const clone={...original,id:cloneId,status:'draft',
    signers:original.signers.map((s,i)=>({...s,id:'new-'+s.id,position:i+1,signedAt:null}))};
  const calls=[];let current=original;
  const db={functions:{invoke:async(_, {body})=>{
    calls.push(body);
    if(body.action==='admin-list')return {data:{requests:[]}};
    if(body.action==='admin-mail-status')return {data:{connected:false}};
    if(body.action==='admin-detail')return {data:{request:body.requestId===cloneId?clone:current}};
    if(body.action==='admin-order'){
      current={...current,signers:body.signerIds.map((sid,i)=>({...current.signers.find(s=>s.id===sid),position:i+1}))};
      return {data:{request:current,changed:true}};
    }
    if(body.action==='admin-reset')return {data:{request:clone,originalId:id,sourceStatus:'revoked'}};
    throw Error('Unexpected action '+body.action);
  }}};
  const label=()=>({textContent:''});
  const rows=['s1','s2','s3'].map(x=>({
    dataset:{nsOrderId:x},querySelector:()=>label()
  }));
  const root={children:rows,insertBefore(item,target){
    const from=this.children.indexOf(item);this.children.splice(from,1);
    this.children.splice(this.children.indexOf(target),0,item);
  },appendChild(item){
    const from=this.children.indexOf(item);if(from>=0)this.children.splice(from,1);
    this.children.push(item);
  }};
  for(const row of rows){
    Object.defineProperty(row,'previousElementSibling',{get(){
      return root.children[root.children.indexOf(this)-1]||null;}});
    Object.defineProperty(row,'nextElementSibling',{get(){
      return root.children[root.children.indexOf(this)+1]||null;}});
  }
  globalThis.document={
    getElementById:which=>which==='ns-order-signers'?root:null,
    querySelector:()=>null
  };
  const ui=createSupabaseSigning({db,getCompanies:()=>[],update:()=>{}});
  ui.mount();await tick();
  ui.onClick('ns-open',id);await tick();
  const detail=ui.render();
  assert.match(detail,/Edit signing order/);
  assert.match(detail,/Reset signing request/);
  ui.onClick('ns-order',id);
  assert.match(ui.render(),/Already signed — order locked/);
  ui.onClick('ns-order-up','',{target:{closest:()=>rows[1]}});
  assert.deepEqual(root.children.map(x=>x.dataset.nsOrderId),['s1','s2','s3'],
    'signed signer may not be displaced');
  ui.onClick('ns-order-down','',{target:{closest:()=>rows[1]}});
  assert.deepEqual(root.children.map(x=>x.dataset.nsOrderId),['s1','s3','s2']);
  assert.match(ui.render(),/Signing position/,'direct position dropdown is present');
  ui.changed({name:'orderPosition',value:'2',closest:()=>rows[1]});
  assert.deepEqual(root.children.map(x=>x.dataset.nsOrderId),['s1','s2','s3'],
    'selecting numeric position directly repositions the signer');
  ui.changed({name:'orderPosition',value:'3',closest:()=>rows[1]});
  assert.deepEqual(root.children.map(x=>x.dataset.nsOrderId),['s1','s3','s2']);
  ui.onClick('ns-save-order');await tick();
  const order=calls.find(x=>x.action==='admin-order');
  assert.deepEqual(order.signerIds,['s1','s3','s2']);
  assert.match(ui.render(),/Signing order saved/);
  ui.onClick('ns-reset',id);await tick();
  const reset=calls.find(x=>x.action==='admin-reset');
  assert.equal(reset.requestId,id);
  assert.match(ui.render(),/New draft created from the original/);
  assert.match(ui.render(),/draft/);
  assert.equal(original.signers[0].signedAt,'2026-10-20T00:00:00Z');
});

test('Delete all requires explicit confirmation and removes only active list entries',async()=>{
  const originalPrompt=globalThis.prompt,originalConfirm=globalThis.confirm;
  const calls=[];let removed=false;
  globalThis.confirm=()=>true;globalThis.prompt=()=> 'DELETE ALL';
  const request={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',company:'TEST SDN BHD',subject:'DRW',
    status:'pending',created_at:'2026-10-23T00:00:00Z'};
  const db={functions:{invoke:async(_, {body})=>{
    calls.push(body);
    if(body.action==='admin-list')
      return {data:removed?{requests:[],total:0}:{requests:[request],total:1}};
    if(body.action==='admin-mail-status')return {data:{connected:false}};
    if(body.action==='admin-delete-all'){
      assert.equal(body.confirmation,'DELETE ALL');
      assert.equal(body.expectedCount,1);
      removed=true;return {data:{deleted:1,evidencePreserved:true}};
    }
    throw Error('Unexpected action '+body.action);
  }}};
  const ui=createSupabaseSigning({db,getCompanies:()=>[],update:()=>{}});
  try{
    ui.mount();await tick();
    assert.match(ui.render(),/Delete all signing requests/);
    ui.onClick('ns-delete-all');await tick();
    assert.equal(calls.filter(x=>x.action==='admin-delete-all').length,1);
    assert.match(ui.render(),/audit evidence retained/);
    assert.doesNotMatch(ui.render(),/data-action="ns-delete-all"/);
  }finally{globalThis.prompt=originalPrompt;globalThis.confirm=originalConfirm;}
});
