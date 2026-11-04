import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {buildStatutoryRegistersPdf} from '../src/statutory-register-pdf.js';

const co={id:'c1',name:'EXAMPLE SDN BHD',registration_no:'202601000001'};
function book(){
 return makeRegisterBook(co,{path:'Register Book.xlsx',sheets:[
  {name:'Register of Directors',rows:[
   ['Name','NRIC No.','Date Ceased to be a Director'],
   ['DIRECTOR FORMER','D001','02/11/2026']]},
  {name:'Register of Members',rows:[
   ['Name','Identification No.','Date Ceased to be a Member','Total Shares Held'],
   ['MEMBER FORMER','M001','02/11/2026','0']]},
  {name:'Register of Beneficial Owners',rows:[
   ['Full Name','NRIC No.','Date a Person Ceases to be BO'],
   ['BO FORMER','B001','02/11/2026']]},
  {name:'Register of Secretaries',rows:[
   ['Name','NRIC No.','Cessation Date','Residential Address','MIA No.'],
   ['LIN TZE YEE (MIA27166)','S001','02/11/2026','','MIA27166']]}
 ]});
}
test('recorded Excel cessation always wins over a stale manual Current override',()=>{
 const b=book();
 b.recordStatuses={'0:1':'current','1:1':'current','2:1':'current','3:1':'current'};
 for(let i=0;i<4;i++){
  const blocks=buildGroupedRegister(b,i,{showBlanks:true}).blocks;
  assert(blocks.some(x=>x.type==='group'&&x.title==='Former'));
  assert(blocks.some(x=>x.type==='record'&&x.status==='Former'),b.sheets[i].name);
  assert(!blocks.some(x=>x.type==='record'&&x.status==='Current'),b.sheets[i].name);
 }
});
test('secretary legal name omits appended MIA details but retains Membership No. and source',()=>{
 const b=book(),original=structuredClone(b.sheets[3].rows);
 const section=buildGroupedRegister(b,3,{showBlanks:true});
 assert.equal(section.blocks.find(x=>x.type==='record')?.title,'LIN TZE YEE');
 assert.equal(section.blocks.find(x=>x.type==='field'&&x.label==='Name')?.value,'LIN TZE YEE');
 assert.equal(section.blocks.find(x=>x.type==='field'&&x.label==='Membership No.')?.value,'MIA27166');
 assert.deepEqual(b.sheets[3].rows,original);
 const html=renderStatutoryRegisterDocument(b,3,{showBlanks:true});
 assert(!html.includes('LIN TZE YEE (MIA27166)'));
 assert(html.includes('placeholder="-"'));
 const address=section.blocks.find(x=>x.type==='field'&&x.label==='Residential Address');
 assert.equal(address.value,'');
});
test('PDF displays a dash for a missing statutory particular without mutating the cell',async()=>{
 const b=book(),draws=[];
 const ctx={scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(v){draws.push(String(v))},measureText(v){return {width:String(v).length*7}},
  set font(v){this._font=v},get font(){return this._font}};
 const old=globalThis.document;
 globalThis.document={createElement:()=>({getContext(){return ctx},width:0,height:0,
  toBlob(cb){cb(new Blob([Uint8Array.of(0xff,0xd8,0xff,0xd9)],{type:'image/jpeg'}))}})};
 try{
  await buildStatutoryRegistersPdf(b,{sheetIndex:3,showBlanks:true});
  assert(draws.includes('-'));
  assert.equal(b.sheets[3].rows[1][3],'');
 }finally{globalThis.document=old;}
});
