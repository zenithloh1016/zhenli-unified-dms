import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../src/signing-supabase.js',import.meta.url),'utf8')
 .replace("import {createPdfSignaturePreview} from './signature-preview.js';",
  'const createPdfSignaturePreview=()=>({html:()=>"",mount:()=>{},reset:()=>{},drawBoxes:()=>{}});');
const backend=readFileSync(
 new URL('../supabase/functions/dms-sequential-signing/index.ts',import.meta.url),'utf8');
const {createSupabaseSigning}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('list API derives signed and final PDF numbers on the server without exposing signer records',()=>{
 assert.match(backend,/select\(\s*"id,company,subject,status,created_at,expires_at,signers,documents"\)/);
 assert.match(backend,/signedCount:signers\.filter\(s=>!!s\.signedAt\)\.length/);
 assert.match(backend,/signerCount:signers\.length/);
 assert.match(backend,/docCount:docs\.length/);
 assert.match(backend,/signedPdfCount:docs\.filter\(d=>!!d\.finalPath\)\.length/);
 const list=backend.slice(backend.indexOf('if(action==="list"){'),
  backend.indexOf('if(action==="delete-all"){'));
 assert(!list.includes('return {requests:rows'));
 assert.match(list,/return \{requests,total:count\|\|0\}/);
});

test('Signing requests show actual 2/2 and signed PDFs, without placeholder dashes',async()=>{
 globalThis.document={getElementById:()=>null,querySelector:()=>null};
 const requests=[
  {id:a,company:'COMPLETED COMPANY',subject:'Resolution',status:'completed',
   created_at:'2026-10-26T02:00:00Z',
   signerCount:2,signedCount:2,docCount:2,signedPdfCount:2},
  {id:b,company:'PENDING COMPANY',subject:'Annual Return',status:'pending',
   created_at:'2026-10-26T01:00:00Z',
   signerCount:2,signedCount:1,docCount:1,signedPdfCount:0}
 ];
 const db={functions:{invoke:async(_, {body})=>{
  if(body.action==='admin-list')return {data:{requests,total:2}};
  if(body.action==='admin-mail-status')return {data:{connected:false}};
  if(body.action==='admin-detail')return {data:{request:{
   id:a,company:'COMPLETED COMPANY',subject:'Resolution',status:'completed',
   expiresAt:'2026-11-01T00:00:00Z',
   documents:[{id:'pdf1',name:'signed-document.pdf',pages:2,ready:true}],
   signers:[{id:'s1',name:'First',email:'test@example.test',signedAt:'2026-10-26T00:00:00Z',position:1}],
   boxes:[],note:''
  }}};
  throw Error('Unexpected action '+body.action);
 }}};
 const ui=createSupabaseSigning({db,getCompanies:()=>[],update:()=>{}});
 ui.mount();await tick();
 const html=ui.render();
 assert.match(html,/>2\/2<\/td>/);
 assert.match(html,/>1\/2<\/td>/);
 assert.match(html,/2 signed PDFs ready/);
 assert.match(html,/1 PDF<small>Awaiting completion<\/small>/);
 assert(!html.includes('—/—'));
 assert(!html.includes('>—</td>'));
 ui.onClick('ns-open',a);await tick();
 const details=ui.render();
 assert.match(details,/Signed PDF ready/);
 assert.match(details,/Download signed PDF/);
 assert(!details.includes('Download original PDF'));
});

test('signed PDF status requires a finalized storage path, not just a completed request status',async()=>{
 globalThis.document={getElementById:()=>null,querySelector:()=>null};
 const id=a;
 const db={functions:{invoke:async(_, {body})=>{
  if(body.action==='admin-list')return {data:{requests:[{
   id,company:'INCOMPLETE FINALIZATION',subject:'Test',status:'completed',
   created_at:'2026-10-26T02:00:00Z',signedCount:2,signerCount:2,
   docCount:1,signedPdfCount:0
  }],total:1}};
  if(body.action==='admin-mail-status')return {data:{connected:false}};
  if(body.action==='admin-detail')return {data:{request:{
   id,company:'INCOMPLETE FINALIZATION',subject:'Test',status:'completed',
   expiresAt:'2026-10-29T00:00:00Z',
   documents:[{id:'doc1',name:'original.pdf',pages:1,ready:false}],
   signers:[{id:'a',name:'A',email:'test@example.test',signedAt:'2026-10-26T02:00:00Z',position:1}],
   boxes:[],note:''
  }}};
  throw Error('Unexpected API action '+body.action);
 }}};
 const ui=createSupabaseSigning({db,getCompanies:()=>[],update:()=>{}});
 ui.mount();await tick();
 assert.match(ui.render(),/Signed PDFs not yet ready/);
 ui.onClick('ns-open',id);await tick();
 assert.match(ui.render(),/Download original PDF/);
 assert(!ui.render().includes('Download signed PDF'));
});
