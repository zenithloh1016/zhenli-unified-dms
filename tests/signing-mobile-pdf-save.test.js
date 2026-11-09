import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/signing-supabase.js',import.meta.url),'utf8')
 .replace("import {createPdfSignaturePreview} from './signature-preview.js';",
  'const createPdfSignaturePreview=()=>({html:()=>"",mount:()=>{},reset:()=>{},drawBoxes:()=>{}});');
const {createSupabaseSigning}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const documentId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const pdfBytes=new TextEncoder().encode('%PDF-1.4\nmock private PDF bytes');

function makeSigning(savePdf){
 globalThis.document={getElementById:()=>null,querySelector:()=>null};
 const db={functions:{invoke:async(_, {body})=>{
  if(body.action==='admin-list')return {data:{requests:[],total:0}};
  if(body.action==='admin-mail-status')return {data:{connected:false}};
  if(body.action==='admin-detail')return {data:{request:{
   id:requestId,status:'completed',company:'TEST COMPANY',subject:'Signed resolution',
   expiresAt:'2026-11-30T00:00:00Z',note:'',boxes:[],signers:[],
   documents:[{id:documentId,name:'Signed Resolution.pdf',ready:true,pages:1}]
  }}};
  if(body.action==='admin-document')return {data:new Blob([pdfBytes],{type:'application/octet-stream'})};
  throw Error('Unexpected signing action '+body.action);
 }}};
 return createSupabaseSigning({db,getCompanies:()=>[],update:()=>{},savePdf});
}

test('Android APK bundles the native Save As picker and wires signing PDFs to it',()=>{
 assert.match(main,/await savePdfToAndroidFiles\(blob,filename\)/);
 assert.match(main,/savePdf:saveSigningPdf/);
 assert.match(main,/SAVE_CANCELLED/);
 assert.match(workflow,/node scripts\/install-native-pdf-saver\.mjs \./);
});

test('signed PDF is passed privately to platform saver with original filename',async()=>{
 const received=[];
 const ui=makeSigning(async(blob,name)=>{
  received.push({name,blob});
  return {saved:true};
 });
 ui.mount();await tick();
 ui.onClick('ns-open',requestId);await tick();
 ui.onClick('ns-pdf',documentId);await tick();await tick();
 assert.equal(received.length,1);
 assert.equal(received[0].name,'Signed Resolution.pdf');
 assert.equal(received[0].blob.type,'application/pdf');
 assert.equal(await received[0].blob.text(),new TextDecoder().decode(pdfBytes));
 assert.match(ui.render(),/Completed signed PDF saved to your chosen Android folder/);
});

test('user cancelling Android picker does not show a false download success',async()=>{
 const ui=makeSigning(async()=>({cancelled:true}));
 ui.mount();await tick();
 ui.onClick('ns-open',requestId);await tick();
 ui.onClick('ns-pdf',documentId);await tick();await tick();
 assert.match(ui.render(),/Save cancelled\. The PDF remains available/);
 assert.doesNotMatch(ui.render(),/Completed signed PDF saved/);
});
