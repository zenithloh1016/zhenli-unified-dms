import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIndependentRegister} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {buildStatutoryRegistersPdf} from '../src/statutory-register-pdf.js';

const company={
 version:1,companyId:'c1',companyName:'EXAMPLE SDN BHD',registrationNo:'202601234567',
 updatedAt:'2026-10-22T00:00:00Z',sourceFile:'Register Book_EXAMPLE SDN BHD.xlsx',
 sheets:[
  {name:'Master',rows:[[],[],['Company Name:','EXAMPLE SDN BHD'],['Company No.:','202601234567'],['Registered Office:','Ipoh, Perak']]},
  {name:'Register of Directors',rows:[
   [],[],[],
   ['Director Name','NRIC No.','Date of Appointment','Date of Cessation'],
   ['DIRECTOR ALPHA','990123-12-3456','01/01/2026',''],
   ['DIRECTOR BETA','880123-12-3456','01/01/2020','21/10/2026']
  ]},
  {name:'Register of BO',rows:[
   ['Full Name','NRIC No.','Type of Beneficial Ownership','Criteria of BO'],
   ['BENEFICIAL OWNER ALPHA','012345-12-3456','Direct','Criteria A']
  ]},
  {name:'Irregular Register',rows:[['UNUSUAL COMPANY ENTRY','example value'],['SOME MORE','information']]}
 ]
};
test('each statutory register is an independent, editable document',()=>{
 const before=JSON.stringify(company);
 const details=buildIndependentRegister(company,0);
 const directors=buildIndependentRegister(company,1);
 const owners=buildIndependentRegister(company,2);
 assert.equal(details.title,'Company Details');
 assert.equal(directors.title,'Register of Directors');
 assert.equal(owners.title,'Register of Beneficial Owners');
 assert(details.blocks.some(b=>b.type==='field'&&b.value==='Ipoh, Perak'));
 const director=directors.blocks.find(b=>b.type==='field'&&b.value==='DIRECTOR ALPHA');
 assert.deepEqual({sheet:director.sheetIndex,row:director.row,col:director.col},{sheet:1,row:4,col:0});
 assert(directors.blocks.some(b=>b.type==='record'&&b.status==='Former'));
 assert.equal(JSON.stringify(company),before);
});
test('individual register preview and exported PDF include only that register',async()=>{
 const html=renderStatutoryRegisterDocument(company,1);
 assert.match(html,/STATUTORY REGISTER/);
 assert.match(html,/Company Registration No./);
 assert.match(html,/sr-ar-section-header/);
 assert.match(html,/sr-ar-row/);
 assert.match(html,/data-s="1" data-r="4" data-c="0"/);
 assert(html.includes('DIRECTOR ALPHA'));
 assert(!html.includes('BENEFICIAL OWNER ALPHA'));
 assert(!html.includes('Ipoh, Perak'));
 const drawn=[];
 const ctx={
  scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(str){drawn.push(str);},
  measureText(str){return {width:String(str).length*7}},
  set font(s){this._font=s},get font(){return this._font}
 };
 const prior=globalThis.document;
 globalThis.document={createElement(){
  return {width:0,height:0,getContext(){return ctx},
   toBlob(cb){cb(new Blob([Uint8Array.of(0xff,0xd8,0xff,0xd9)],{type:'image/jpeg'}));}};
 }};
 try{
  const pdf=await buildStatutoryRegistersPdf(company,{sheetIndex:1});
  const raw=await pdf.text();
  assert(raw.startsWith('%PDF-1.4'));
  assert(raw.includes('/MediaBox [0 0 595.28 841.89]'));
  assert(drawn.includes('DIRECTOR ALPHA'));
  assert(!drawn.includes('BENEFICIAL OWNER ALPHA'));
  assert(!drawn.includes('Irregular Register'));
  assert(!drawn.includes('Ipoh, Perak'));
 }finally{globalThis.document=prior;}
});
test('unknown register layout becomes labelled records without Excel coordinates',()=>{
 const details=buildIndependentRegister(company,3);
 assert.equal(details.title,'Register of Irregular Register');
 assert(details.blocks.some(b=>b.type==='record'&&b.title==='Entry 1'));
 assert(details.blocks.some(b=>b.type==='field'&&b.value==='example value'));
 assert(details.blocks.every(b=>!b.label||!/\bRow \d+ · Column \d+/.test(b.label)));
 const html=renderStatutoryRegisterDocument(company,3);
 assert(!html.includes('Original Worksheet'));
 assert(!html.includes('<table'));
});
test('show blank fields uses the same register model in view and PDF',()=>{
 const base=buildIndependentRegister(company,1);
 const more=buildIndependentRegister(company,1,{showBlanks:true});
 assert(more.blocks.length>base.blocks.length);
 assert(!renderStatutoryRegisterDocument(company,1).includes('data-s="1" data-r="4" data-c="3"'));
 assert(renderStatutoryRegisterDocument(company,1,{showBlanks:true}).includes('data-s="1" data-r="4" data-c="3"'));
});
test('html escaping prevents code injection into editable statutory form',()=>{
 const book=structuredClone(company);
 book.companyName='<img src=x onerror=alert(1)>';
 book.sheets[0].rows[4][1]='<script>alert(1)</script>';
 const html=renderStatutoryRegisterDocument(book,0);
 assert.doesNotMatch(html,/<script>|<img/);
 assert.match(html,/&lt;script&gt;/);
});
