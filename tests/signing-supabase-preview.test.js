import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Lightweight no-network regression for the Supabase adapter to the exact
// existing EdgeOne PDF.js preview. Use synthetic data only.
const source=readFileSync(new URL('../src/signing-supabase.js',import.meta.url),'utf8')
  .replace("import {createPdfSignaturePreview} from './signature-preview.js';",
    'const createPdfSignaturePreview=globalThis.__testPreview;');
let preview, previewCalls=0;
globalThis.__testPreview=(options)=>{
  preview=options;
  return {html:(docs,signers)=>{
    previewCalls++;
    return '<div id="zs-pdf-preview">PDF preview '+docs.length+' / '+signers.length+'</div>';
  },mount:()=>{},reset:()=>{},drawBoxes:()=>{}};
};
globalThis.document={getElementById:()=>null,querySelector:()=>null};
globalThis.confirm=()=>true;
const {createSupabaseSigning}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('Supabase DMS signing uses EdgeOne layout and working private PDF preview',async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const doc='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const signer='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const original={id,company:'TEST CO SDN BHD',subject:'Resolution',
    status:'draft',expiresAt:'2026-11-02T00:00:00Z',createdAt:'2026-10-23T00:00:00Z',
    note:'Sign all pages',boxes:[],
    documents:[{id:doc,name:'test-document.pdf',pages:2}],
    signers:[{id:signer,position:1,name:'Test Signer',email:'signer@example.test'}]
  };
  const calls=[];
  const database={functions:{invoke:async(name,{body})=>{
    assert.equal(name,'dms-sequential-signing');calls.push(body);
    switch(body.action){
      case 'admin-list': return {data:{requests:[{id,company:original.company,subject:'Resolution',status:'draft',created_at:original.createdAt}]}};
      case 'admin-detail': return {data:{request:{...original,boxes:[]}}};
      case 'admin-document': return {data:new Blob(['%PDF-1.7\nsynthetic preview'],{type:'application/octet-stream'})};
      case 'admin-boxes': return {data:{request:original}};
      default: throw Error('Unexpected API action '+body.action);
    }
  }}};
  const ui=createSupabaseSigning({db:database,getCompanies:()=>[{name:'TEST CO SDN BHD'}],update:()=>{}});
  ui.mount();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.render(),/zs-table-wrap/);
  assert.match(ui.render(),/Company \/ subject/);
  ui.onClick('ns-open',id);
  await new Promise(resolve=>setImmediate(resolve));
  const detail=ui.render();
  assert.match(detail,/zs-details-heading/);
  assert.match(detail,/zs-signer/);
  assert.match(detail,/zs-placement-row|Signature positions/);
  assert.match(detail,/zs-pdf-preview/);
  assert.ok(previewCalls>0,'preview is rendered with same existing component');
  const privatePdf=await preview.fetchPdf(doc);
  assert.ok(privatePdf instanceof Blob);
  assert.equal(privatePdf.type,'application/pdf');
  assert.match(await privatePdf.text(),/^%PDF-/);
  ui.onClick('ns-add-box');
  assert.match(ui.render(),/zs-placement-row/);
  assert.equal(preview.getRows().length,1);
  preview.addRow({docId:doc,signerId:signer,page:2,x:15,y:45,width:20,height:6});
  assert.equal(preview.getRows().length,2);
  ui.onClick('ns-save-boxes');
  await new Promise(resolve=>setImmediate(resolve));
  const saved=calls.find(x=>x.action==='admin-boxes');
  assert.ok(saved,'placements are posted to Supabase backend');
  assert.equal(saved.boxes[1].documentId,doc);
  assert.equal(saved.boxes[1].page,2);
  assert.equal(saved.boxes[1].x,15,'coordinates must remain percentages for Supabase');
});
