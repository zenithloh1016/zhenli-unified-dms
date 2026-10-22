import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStatutoryAnnualSections} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryAnnualDocument} from '../src/statutory-register-annual-ui.js';
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
test('builds complete Annual Return-style sections and leaves source values untouched',()=>{
 const before=JSON.stringify(company);
 const sections=buildStatutoryAnnualSections(company);
 assert.deepEqual(sections.map(s=>s.title),['Company Details','Directors','Beneficial Owners','Irregular Register']);
 assert(sections[0].blocks.some(b=>b.type==='field'&&b.label==='Registered Office'&&b.value==='Ipoh, Perak'));
 const director=sections[1].blocks.find(b=>b.type==='field'&&b.value==='DIRECTOR ALPHA');
 assert.deepEqual({sheet:director.sheetIndex,row:director.row,col:director.col},{sheet:1,row:4,col:0});
 assert(sections[1].blocks.some(b=>b.type==='record'&&b.status==='Former / Ceased'));
 assert(sections[3].blocks.some(b=>b.type==='field'&&b.label==='Row 1 · Column 1'));
 assert.equal(JSON.stringify(company),before);
});
test('view and PDF share an identical source-section model and field values',async()=>{
 const html=renderStatutoryAnnualDocument(company);
 assert.match(html,/STATUTORY REGISTER PARTICULARS REVIEW/);
 assert.match(html,/Company Registration No./);
 assert.match(html,/sr-ar-section-header/);
 assert.match(html,/sr-ar-row/);
 assert.match(html,/data-s="1" data-r="4" data-c="0"/);
 assert(html.indexOf('Company Details')<html.indexOf('Directors'));
 assert(html.indexOf('Directors')<html.indexOf('Beneficial Owners'));
 assert(html.includes('DIRECTOR ALPHA'));
 const drawn=[];
 const ctx={
  scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(str){drawn.push(str);},
  measureText(str){return {width:String(str).length*7}},
  set font(s){this._font=s},get font(){return this._font}
 };
 const prior=globalThis.document;
 globalThis.document={createElement(){
  return {
   width:0,height:0,getContext(){return ctx},
   toBlob(callback){callback(new Blob([Uint8Array.of(0xff,0xd8,0xff,0xd9)],{type:'image/jpeg'}));}
  };
 }};
 try{
  const pdf=await buildStatutoryRegistersPdf(company);
  const raw=await pdf.text();
  assert(raw.startsWith('%PDF-1.4'));
  assert(raw.includes('/MediaBox [0 0 595.28 841.89]'));
  assert(drawn.includes('DIRECTOR ALPHA'));
  assert(drawn.includes('BENEFICIAL OWNER ALPHA'));
  assert(drawn.includes('Irregular Register'));
  assert(drawn.includes('Ipoh, Perak'));
 }finally{globalThis.document=prior;}
});
test('show blank fields is consistent on screen and in PDF source model',()=>{
 const base=buildStatutoryAnnualSections(company);
 const withBlank=buildStatutoryAnnualSections(company,{showBlanks:true});
 assert(withBlank[1].blocks.length>base[1].blocks.length);
 assert(!renderStatutoryAnnualDocument(company).includes('data-s="1" data-r="4" data-c="3"'));
 assert(renderStatutoryAnnualDocument(company,{showBlanks:true}).includes('data-s="1" data-r="4" data-c="3"'));
});
test('html escaping prevents code injection into editable statutory form',()=>{
 const book=structuredClone(company);
 book.companyName='<img src=x onerror=alert(1)>';
 book.sheets[0].rows[4][1]='<script>alert(1)</script>';
 const html=renderStatutoryAnnualDocument(book);
 assert.doesNotMatch(html,/<script>|<img/);
 assert.match(html,/&lt;script&gt;/);
});
