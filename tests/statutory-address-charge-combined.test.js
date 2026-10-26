import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildIndependentRegister,buildGroupedRegister,buildCombinedRegisters
} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {buildStatutoryRegistersPdf} from '../src/statutory-register-pdf.js';
import {ensureChargeRegister,visibleRegisterIndices} from '../src/statutory-register-review.js';
import {createRegisterBookTab} from '../src/register-book-tab.js';
import {makeRegisterBook} from '../src/statutory-register-data.js';

const company={
 id:'co1',name:'DEMO SDN BHD',registration_no:'202601234567'
};
function book(){
 return makeRegisterBook(company,{
  path:'Register Book_DEMO SDN BHD.xlsx',
  sheets:[
   {name:'Master',rows:[
    ['Company Name:','DEMO SDN BHD'],
    ['Company No.:','202601234567'],
    ['Registered Office:','NO. 17, JALAN YONG SHOOK LIN,'],
    ['', 'SEKSYEN 7,'],
    ['', '46050 PETALING JAYA,'],
    ['', 'SELANGOR'],
    ['Company Secretary:','SECRETARY A'],
   ]},
   {name:'Register of Members 001',rows:[['Name:','MEMBER A'],['Total Shares Held:','120']]},
   {name:'Register of Members 002',rows:[['Name:','MEMBER B'],['Total Shares Held:','330']]},
   {name:'Register of Managers',rows:[['Name'],['MANAGER X']]},
   {name:'Register of Directors',rows:[['Director Name','NRIC No.','Date of Appointment'],['DIRECTOR A','TEST','01/01/2026']]}
  ]
 });
}
function fixture(savedBook=null){
 const stored=savedBook||book(),blobs=new Map();
 const storage={
  list:async()=>({data:[],error:null}),
  download:async key=>blobs.has(key)?{data:blobs.get(key),error:null}:
   key.endsWith('/co1.json')?{data:new Blob([JSON.stringify(stored)]),error:null}:
    {data:null,error:{message:'Object not found',statusCode:404}},
  upload:async(key,blob)=>{blobs.set(key,blob);return {error:null};}
 };
 const db={storage:{from:()=>storage},from(){
  const q={select(){return q;},eq(){return q;},is(){return q;},ilike(){return q;},order(){return q;},
   limit:async()=>({data:[],error:null})};return q;
 }};
 return {tab:createRegisterBookTab({db,getUser:()=>({id:'u1'}),getCompanies:()=>[company]}),blobs};
}
test('Company Details display precisely one multiline Registered Address, not duplicated continued rows',()=>{
 const b=book();
 const before=JSON.stringify(b.sheets[0].rows);
 const fields=buildIndependentRegister(b,0).blocks.filter(x=>x.type==='field');
 assert.equal(fields.length,4);
 assert.deepEqual(fields.map(f=>f.label),['Company Name','Company No.','Registered Address','Company Secretary']);
 const address=fields[2];
 assert.equal(address.value,'NO. 17, JALAN YONG SHOOK LIN,\nSEKSYEN 7,\n46050 PETALING JAYA,\nSELANGOR');
 assert.equal(address.continuation.length,3);
 assert.equal(JSON.stringify(b.sheets[0].rows),before);
 const html=renderStatutoryRegisterDocument(b,0);
 assert.match(html,/data-merge-address="true"/);
 assert.match(html,/data-action="sr-edit-field"/);
 assert(!html.includes('Registered Office · continued'));
 assert(html.includes('Company Secretary'));
 assert(html.includes('Company Name'));
});
test('Company Details inline address edit consolidates old continuation cells',async()=>{
 const {tab}=fixture();
 await tab.openCompany('co1');
 globalThis.document={getElementById:()=>null};
 assert.equal(tab.updateCell({dataset:{s:'0',r:'2',c:'1',mergeAddress:'true'},
  value:'NO. 12, NEW ADDRESS\nIPOH, PERAK'}),true);
 assert.equal(tab.state.book.sheets[0].rows[2][1],'NO. 12, NEW ADDRESS\nIPOH, PERAK');
 assert.deepEqual(tab.state.book.sheets[0].rows.slice(3,6).map(x=>x[1]),['','','']);
 assert.equal(buildIndependentRegister(tab.state.book,0).blocks.find(x=>x.label==='Registered Address').value,'NO. 12, NEW ADDRESS\nIPOH, PERAK');
});
test('Edit Field works in different statutory registers and in PDFs without changing source label cells',async()=>{
 const {tab}=fixture();await tab.openCompany('co1');
 const prior=globalThis.window;
 globalThis.window={prompt:()=> 'Registered Address (New)'};
 try{
  assert.equal(tab.command('sr-edit-field','0:2:1'),true);
  const b=tab.state.book;
  assert.equal(b.fieldLabels['0:2:1'],'Registered Address (New)');
  assert.equal(b.sheets[0].rows[2][0],'Registered Office:');
  assert.match(tab.render(),/Registered Address \(New\)/);
  globalThis.window.prompt=()=> 'Member Name';
  assert.equal(tab.command('sr-edit-field','1:0:1'),true);
  tab.command('sr-sheet','1');
  assert.match(tab.render(),/Member Name/);
 }finally{globalThis.window=prior;}
});
test('one unified Members tab groups multiple folios and preserves individual edit mapping',async()=>{
 const b=book();
 assert.deepEqual(visibleRegisterIndices(b),[0,4,1]);
 const members=buildGroupedRegister(b,1);
 assert.equal(members.title,'Register of Members');
 assert(members.blocks.some(x=>x.type==='field'&&x.value==='MEMBER A'&&x.sheetIndex===1));
 assert(members.blocks.some(x=>x.type==='field'&&x.value==='MEMBER B'&&x.sheetIndex===2));
 const {tab}=fixture();await tab.openCompany('co1');
 const html=tab.render();
 assert.equal((html.match(/data-action="sr-sheet"/g)||[]).length,8); // Original tabs plus standard missing registers
 tab.command('sr-sheet','1');
 const memberHtml=tab.render();
 assert(memberHtml.includes('MEMBER A')&&memberHtml.includes('MEMBER B'));
 assert.equal((memberHtml.match(/Register of Members<\/button>/g)||[]).length,1);
});
test('every opened company gets a Register of Charges without invented charge records',async()=>{
 const {tab}=fixture();await tab.openCompany('co1');
 const b=tab.state.book;
 assert.equal(b.sheets.filter(x=>/^register of charges$/i.test(x.name)).length,1);
 const i=b.sheets.findIndex(x=>/^register of charges$/i.test(x.name));
 const sheet=buildIndependentRegister(b,i);
 assert.equal(sheet.blocks.length,1);
 assert.equal(sheet.blocks[0].type,'note');
 assert.match(sheet.blocks[0].text,/N\/A/);
 assert(tab.render().includes('Register of Charges'));
 const once=ensureChargeRegister(b);
 assert.equal(once,false);
 const html=renderStatutoryRegisterDocument(b,i);
 assert.match(html,/N\/A/);
});
test('Combined PDF includes each distinct register and excludes Managers, using the same edited field labels',async()=>{
 const b=book();
 ensureChargeRegister(b);
 b.fieldLabels={'0:2:1':'Registered Address (New)'};
 const parts=buildCombinedRegisters(b);
 assert.deepEqual(parts.map(x=>x.title),['Company Details','Register of Directors','Register of Members','Register of Charges']);
 assert(parts.find(x=>x.title==='Register of Members').blocks.some(x=>x.value==='MEMBER B'));
 assert(!parts.some(p=>/Managers/.test(p.title)));
 const printed=[];
 const ctx={scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
   fillText(str){printed.push(String(str));},measureText(str){return {width:String(str).length*6}},
   set font(v){this._font=v},get font(){return this._font}};
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({width:0,height:0,getContext(){return ctx},
    toBlob(cb){cb(new Blob([Uint8Array.of(0xff,0xd8,0xff,0xd9)],{type:'image/jpeg'}));}})};
 try{
  const pdf=await buildStatutoryRegistersPdf(b,{combined:true});
  const pdfText=await pdf.text();
  assert(pdfText.startsWith('%PDF-1.4'));
  assert(printed.includes('Register of Members'));
  assert(printed.includes('Register of Directors'));
  assert(printed.some(x=>x.includes('REGISTER OF CHARGES')));
  assert(printed.includes('Registered Address (New)'));
  assert(printed.includes('MEMBER B'));
  assert(!printed.includes('MANAGER X'));
  assert(printed.includes('Company Secretary'));
 }finally{globalThis.document=previous;}
});


test('Remove Field is confirmed, hidden from PDF, saved privately, and reversible',async()=>{
 const {tab,blobs}=fixture();
 await tab.openCompany('co1');
 const prior=globalThis.window;globalThis.window={confirm:()=>false};
 try{
  tab.command('sr-remove-field','0:6:1');
  assert.equal(tab.state.dirty,true);
  globalThis.window.confirm=()=>true;
  tab.command('sr-remove-field','0:6:1');
  assert.equal(tab.state.book.removedFields['0:6:1'],true);
  assert.equal(tab.state.dirty,true);
  assert(!buildIndependentRegister(tab.state.book,0).blocks.some(x=>x.label==='Company Secretary'));
  assert(!buildCombinedRegisters(tab.state.book).flatMap(x=>x.blocks).some(x=>x.label==='Company Secretary'));
  globalThis.document={getElementById:()=>null};
  await tab.save();
  assert(blobs.has('u1/statutory-registers/co1.json'));
  assert(tab.render().includes('Restore Removed Items'));
  tab.command('sr-restore-removed');
  assert(buildIndependentRegister(tab.state.book,0).blocks.some(x=>x.label==='Company Secretary'));
  assert.equal(tab.state.dirty,true);
 }finally{globalThis.window=prior;}
});
test('Delete Entry requires confirmation, preserves source values, saves, and can be restored',async()=>{
 const {tab,blobs}=fixture();
 await tab.openCompany('co1');
 const original=structuredClone(tab.state.book.sheets[4].rows[1]);
 tab.command('sr-sheet','4');
 assert(tab.render().includes('Delete Entry'));
 const prior=globalThis.window;globalThis.window={confirm:()=>false};
 try{
  tab.command('sr-delete-entry','4:1');
  assert.equal(tab.state.dirty,true);
  globalThis.window.confirm=()=>true;
  tab.command('sr-delete-entry','4:1');
  assert.equal(tab.state.book.removedEntries['4:1'],true);
  assert.deepEqual(tab.state.book.sheets[4].rows[1],original);
  assert(!tab.render().includes('DIRECTOR A'));
  assert(!buildCombinedRegisters(tab.state.book).flatMap(x=>x.blocks).some(x=>x.title==='DIRECTOR A'));
  globalThis.document={getElementById:()=>null};
  await tab.save();
  assert(blobs.has('u1/statutory-registers/co1.json'));
  tab.closeCompany();
  await tab.openCompany('co1');
  tab.command('sr-sheet','4');
  assert(!tab.render().includes('DIRECTOR A'));
  tab.command('sr-restore-removed');
  assert(tab.render().includes('DIRECTOR A'));
 }finally{globalThis.window=prior;}
});
test('Remove Field works on member folios without affecting another member',async()=>{
 const {tab}=fixture();
 await tab.openCompany('co1');
 tab.command('sr-sheet','1');
 assert(tab.render().includes('Remove Field'));
 assert(tab.render().includes('Delete Entry'));
 assert(tab.render().includes('data-action="sr-remove-field" data-id="1:1:1"'));
 const original=structuredClone(tab.state.book.sheets[1].rows[1]);
 const prior=globalThis.window;globalThis.window={confirm:()=>true};
 try{
  tab.command('sr-remove-field','1:1:1');
  assert.deepEqual(tab.state.book.sheets[1].rows[1],original);
  const after=buildGroupedRegister(tab.state.book,1);
  assert(!after.blocks.some(b=>b.type==='field'&&b.sheetIndex===1&&b.row===1&&b.col===1));
  assert(after.blocks.some(b=>b.type==='field'&&b.sheetIndex===2&&b.value==='330'));
  assert(tab.render().includes('MEMBER A')&&tab.render().includes('MEMBER B'));
 }finally{globalThis.window=prior;}
});
