import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/signing-supabase.js',import.meta.url),'utf8')
 .replace("import {createPdfSignaturePreview} from './signature-preview.js';",
  'const createPdfSignaturePreview=()=>({html:()=>"",mount:()=>{},reset:()=>{},drawBoxes:()=>{}});');
const {createSupabaseSigning}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const backend=readFileSync(new URL('../supabase/functions/dms-sequential-signing/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261026_single_signing_request_hide.sql',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const one='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',two='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture(){
 let requests=[
  {id:one,company:'FIRST SDN BHD',subject:'Board Resolution',
   status:'completed',created_at:'2026-10-26T07:00:00Z',signedCount:1,signerCount:1,docCount:1,signedPdfCount:1},
  {id:two,company:'SECOND SDN BHD',subject:'Annual Return',
   status:'pending',created_at:'2026-10-26T08:00:00Z',signedCount:0,signerCount:2,docCount:1,signedPdfCount:0}
 ];
 const actions=[];
 const db={functions:{invoke:async(_name,{body})=>{
  actions.push(body);
  if(body.action==='admin-list')return {data:{requests,total:requests.length}};
  if(body.action==='admin-mail-status')return {data:{connected:false}};
  if(body.action==='admin-delete-one'){
   requests=requests.filter(r=>r.id!==body.requestId);
   return {data:{deleted:true,evidencePreserved:true}};
  }
  if(body.action==='admin-detail'){
   const r=requests.find(r=>r.id===body.requestId);
   return {data:{request:{...r,expiresAt:'2026-11-20T00:00:00Z',
    senderEmail:'zhenlisecretary@gmail.com',documents:[],signers:[],boxes:[],audit:[]}}};
  }
  throw Error('Unexpected action '+body.action);
 }}};
 const ui=createSupabaseSigning({db,getCompanies:()=>[],update:()=>{}});
 return {ui,actions,getRequests:()=>requests};
}
test('individual delete is shown for every active nonfinalizing request',async()=>{
 globalThis.document={getElementById:()=>null,querySelector:()=>null};
 const {ui}=fixture();ui.mount();await tick();
 const html=ui.render();
 assert.match(html,/data-action="ns-delete-one"/);
 assert.equal((html.match(/data-action="ns-delete-one"/g)||[]).length,2);
 assert.match(html,/data-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"/);
 ui.onClick('ns-open',one);await tick();
 assert.match(ui.render(),/Delete this signing request/);
});
test('individual delete uses inline confirmation without Electron prompt',async()=>{
 globalThis.document={getElementById:()=>null,querySelector:()=>null,activeElement:null};
 const oldFormData=globalThis.FormData,oldPrompt=globalThis.prompt;
 let typed='DELETE REQUEST';
 globalThis.prompt=()=>{throw Error('Native prompt must not be used');};
 globalThis.FormData=class {get(key){return key==='confirm'?typed:null;}};
 try{
  const {ui,actions,getRequests}=fixture();ui.mount();await tick();
  ui.onClick('ns-delete-one',one);
  assert.match(ui.render(),/id="ns-confirm-delete"/);
  assert.equal(actions.filter(a=>a.action==='admin-delete-one').length,0);
  ui.onSubmit({id:'ns-confirm-delete'});await tick();await tick();
  const target=actions.find(a=>a.action==='admin-delete-one');
  assert.equal(target.requestId,one);
  assert.equal(target.confirmation,'DELETE REQUEST');
  assert.equal(getRequests().length,1);
  assert.equal(getRequests()[0].id,two);
  assert.match(ui.render(),/SECOND SDN BHD/);
  assert(!ui.render().includes('FIRST SDN BHD'));
  typed='DELETE';
  ui.onClick('ns-delete-one',two);
  ui.onSubmit({id:'ns-confirm-delete'});await tick();
  assert.equal(actions.filter(a=>a.action==='admin-delete-one').length,1);
  assert.match(ui.render(),/Type DELETE REQUEST exactly/);
  ui.onClick('ns-cancel-delete');
  assert.doesNotMatch(ui.render(),/id="ns-confirm-delete"/);
 }finally{globalThis.FormData=oldFormData;globalThis.prompt=oldPrompt;}
});
test('backend validates user, UUID, typed confirmation and calls single hide RPC',()=>{
 assert.match(backend,/if\(action==="delete-one"\)/);
 assert.match(backend,/body\.confirmation!=="DELETE REQUEST"/);
 assert.match(backend,/if\(!isUuid\(body\.requestId\)\)/);
 assert.match(backend,/admin\.rpc\("dms_native_hide_sign_request"/);
 assert.match(backend,/p_owner_id:user,p_request_id:body\.requestId/);
 assert.match(sql,/where owner_id=p_owner_id and id=p_request_id and deleted_at is null\s+for update/);
 assert.match(sql,/status='finalizing'/);
 assert.match(sql,/deleted_at=now\(\)/);
 assert.match(sql,/audit=audit \|\| jsonb_build_array/);
 assert.match(sql,/revoke all on function public\.dms_native_hide_sign_request/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/delete\s+from\s+public\.dms_native_sign_requests/i);
});
