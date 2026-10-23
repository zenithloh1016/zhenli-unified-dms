import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Regression: existing activated requests can be edited only before anyone signs,
// the requested default sender is visible, and the UI warns about link revocation.
const source=readFileSync(new URL('../src/signing-supabase.js',import.meta.url),'utf8')
  .replace("import {createPdfSignaturePreview} from './signature-preview.js';",
    "const createPdfSignaturePreview=globalThis.__editTestPreview;");
globalThis.__editTestPreview=()=>({
  html:()=>'<div id="zs-pdf-preview"></div>',
  mount:()=>{},reset:()=>{},drawBoxes:()=>{}
});
globalThis.document={getElementById:()=>null,querySelector:()=>null};
globalThis.confirm=()=>true;
const {createSupabaseSigning}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('Edit unsigned activated Supabase request, using exact default sender',async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const signer='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let request={id,company:'TEST SDN BHD',subject:'Annual Return',note:'Original note',
    status:'pending',senderEmail:'zhenlisecretary@gmail.com',
    expiresAt:'2026-11-10T00:00:00Z',boxes:[],documents:[],
    signers:[{id:signer,name:'Test Person',email:'test@example.test',position:1,signedAt:null}]};
  const calls=[];
  const db={functions:{invoke:async(_, {body})=>{
    calls.push(body);
    if(body.action==='admin-list')return {data:{requests:[]}};
    if(body.action==='admin-detail')return {data:{request}};
    if(body.action==='admin-edit'){
      request={...request,company:body.company,subject:body.subject,
        note:body.note,status:'draft',signers:body.signers.map((s,i)=>({...s,position:i+1,signedAt:null}))};
      return {data:{request,linksRevoked:true}};
    }
    throw Error('Unknown action '+body.action);
  }}};
  const ui=createSupabaseSigning({db,getCompanies:()=>[{name:'TEST SDN BHD'}],update:()=>{}});
  ui.mount();await tick();
  ui.onClick('ns-open',id);await tick();
  assert.match(ui.render(),/Edit signing details/);
  assert.match(ui.render(),/zhenlisecretary@gmail.com/);
  ui.onClick('ns-edit',id);
  const html=ui.render();
  assert.match(html,/id="ns-edit"/);
  assert.match(html,/Save signing details/);
  assert.match(html,/return it to Draft/);
  assert.match(html,/zhenlisecretary@gmail.com/);
  const originalFormData=globalThis.FormData;
  globalThis.FormData=class {
    get(key){return ({company:'TEST SDN BHD',subject:'Updated Subject',
      note:'Updated instructions',days:''})[key]??null;}
  };
  const element={dataset:{signerId:signer},querySelector:(sel)=>
    ({'[name="ns-name"]':{value:'Test Person'},'[name="ns-email"]':{value:'test@example.test'}})[sel]};
  const form={id:'ns-edit',querySelector:()=>({querySelectorAll:()=>[element]})};
  try {assert.equal(ui.submit(form),true);await tick();}finally{globalThis.FormData=originalFormData;}
  const edit=calls.find(x=>x.action==='admin-edit');
  assert.ok(edit);
  assert.equal(edit.signers[0].id,signer);
  assert.equal(edit.subject,'Updated Subject');
  assert.equal(edit.days,null);
  assert.match(ui.render(),/All old links are invalid/);
});
