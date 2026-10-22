import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook,sanitizeSheet} from '../src/statutory-register-data.js';
import {ensureChargeRegister} from '../src/statutory-register-review.js';
import {buildGroupedRegister,buildCombinedRegisters} from '../src/statutory-register-annual-layout.js';
import {combinedRegisterSnapshot} from '../src/statutory-ar-bridge.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {buildStatutoryRegistersPdf} from '../src/statutory-register-pdf.js';

const company={id:'c1',name:'EXAMPLE SDN BHD',registration_no:'202601111111'};
const book=()=>makeRegisterBook(company,{path:'Register Book_EXAMPLE.xlsx',sheets:[
 sanitizeSheet('Master',[
  ['Company Name:','EXAMPLE SDN BHD'],['Company No.:','202601111111'],
  ['Registered Office:','NO. 22, JALAN MERU'],['','IPOH PERAK']]),
 sanitizeSheet('Register of Directors',[
  ['Director Name','Date of Birth','IC No. / Passport No.','Passport Expiry',
   'Gender','Nationality / Race','Business Occupation','Residential Address',
   'Service Address','Date of Appointment','Date of Cessation'],
  ['CURRENT DIRECTOR','30094','800101-10-1111','-','MALE','MALAYSIAN / CHINESE',
   'DIRECTOR','CURRENT ADDRESS','SERVICE ADDRESS','43803','-'],
  ['FORMER DIRECTOR','31094','700101-10-2222','-','FEMALE','MALAYSIAN / CHINESE',
   'DIRECTOR','FORMER ADDRESS','SERVICE ADDRESS','43803','45356']]),
 sanitizeSheet('Register of Secretaries',[
  ['Name','NRIC No.','Date of Appointment','Date of Cessation'],
  ['CURRENT SECRETARY','SEC001','45000','-'],
  ['FORMER SECRETARY','SEC002','43000','45500']]),
 sanitizeSheet('Register of BO',[
  ['Full Name','NRIC No.','Date of Becoming BO','Date of Cessation'],
  ['CURRENT BO','BO001','45000','-'],
  ['FORMER BO','BO002','45000','46000']]),
 sanitizeSheet('Register of Charges',[
  ['Registered No.','Date of Registration','Name of Chargee','Nature of Charge','Amount of Indebtedness'],
  ['CHG001','44000','BANK ACTIVE','FIXED','1000000'],
  ['CHG002','42000','BANK FORMER','DEBENTURE','2000000']]),
 sanitizeSheet('Register of Transfer',[
  ['Name','Date','Shares'],
  ['SHARE TRANSFER','44444','200']]),
 sanitizeSheet('Register of Allotments',[
  ['Name','Date','Shares'],
  ['SHARE ALLOTMENT','44444','200']])
]});
test('Director history is recovered with personal particulars and current/former grouping',()=>{
 const b=book();
 const section=buildGroupedRegister(b,1);
 assert(section.blocks.some(x=>x.type==='group'&&x.title==='Current'));
 assert(section.blocks.some(x=>x.type==='group'&&x.title==='Former'));
 assert(section.blocks.some(x=>x.type==='record'&&x.title==='CURRENT DIRECTOR'&&x.status==='Current'));
 assert(section.blocks.some(x=>x.type==='record'&&x.title==='FORMER DIRECTOR'&&x.status==='Former'));
 assert(section.blocks.some(x=>x.type==='field'&&x.label==='Date of Cessation'&&x.value==='45356'));
 const html=renderStatutoryRegisterDocument(b,1);
 assert(html.includes('CURRENT DIRECTOR')&&html.includes('FORMER DIRECTOR'));
 assert(html.indexOf('CURRENT DIRECTOR')<html.indexOf('FORMER DIRECTOR'));
});
test('all applicable registers separate current/former while Transfers and Allotments do not',()=>{
 const b=book();ensureChargeRegister(b);
 for(const i of [1,2,3,4]){
  const reg=buildGroupedRegister(b,i);
  assert(reg.blocks.some(x=>x.type==='group'&&x.title==='Current'));
  assert(reg.blocks.some(x=>x.type==='group'&&/Former/.test(x.title)));
 }
 for(const i of [5,6]){
  const reg=buildGroupedRegister(b,i);
  assert(!reg.blocks.some(x=>x.type==='group'));
 }
 const combined=buildCombinedRegisters(b);
 assert(combined.some(x=>x.title==='Register of Directors'));
 assert(combined.some(x=>x.title==='Register of Charges'));
});
test('Charge Date of Discharge added once while preserving existing charges and supplying current/former status',()=>{
 const b=book();
 assert.equal(ensureChargeRegister(b),true);
 assert.equal(ensureChargeRegister(b),false);
 const sheet=b.sheets[4];
 assert.equal(sheet.rows[0].filter(v=>v==='Date of Discharge').length,1);
 const col=sheet.rows[0].indexOf('Date of Discharge');
 assert.equal(sheet.rows[1][col],'');
 sheet.rows[2][col]='46000';
 const reg=buildGroupedRegister(b,4);
 assert(reg.blocks.some(x=>x.type==='record'&&x.title==='CHG001'&&x.status==='Current'));
 assert(reg.blocks.some(x=>x.type==='field'&&x.label==='Date of Discharge'&&x.value===''&&x.row===1));
 assert(reg.blocks.some(x=>x.type==='record'&&x.title==='CHG002'&&x.status==='Former'));
 assert(reg.blocks.some(x=>x.type==='field'&&x.label==='Date of Discharge'&&x.value==='46000'));
 const snapshot=combinedRegisterSnapshot(b,{companyId:company.id});
 assert(snapshot.sections.some(s=>s.title==='Register of Charges'));
 assert.throws(()=>combinedRegisterSnapshot(b,{companyId:'other'}),/another company/);
});
test('Existing discharged dates are never overwritten; missing charge data displays N/A',()=>{
 const b=book();b.sheets[4].rows[0].push('Date of Discharge');
 b.sheets[4].rows[2].push('44000');
 assert.equal(ensureChargeRegister(b),false);
 assert.equal(b.sheets[4].rows[2].at(-1),'44000');
 const empty=book();empty.sheets[4]={name:'Register of Charges',rows:[
  ['Registered No.','Date of Registration','Name of Chargee','Date of Discharge'],
  ['-','-','-','-']]};
 ensureChargeRegister(empty);
 const section=buildGroupedRegister(empty,4);
 assert(section.blocks.some(x=>x.type==='note'&&/N\/A/.test(x.text)));
});
test('Both individual and combined PDFs include the recovered former director history',async()=>{
 const b=book(),values=[];
 ensureChargeRegister(b);
 const ctx={scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(t){values.push(String(t));},measureText(t){return {width:String(t).length*7}},
  set font(v){this._font=v},get font(){return this._font}};
 const original=globalThis.document;
 globalThis.document={createElement:()=>({width:0,height:0,getContext(){return ctx},
  toBlob(cb){cb(new Blob([Uint8Array.of(0xff,0xd8,0xff,0xd9)],{type:'image/jpeg'}))}})};
 try{
  const pdf=await buildStatutoryRegistersPdf(b,{sheetIndex:1});
  assert((await pdf.text()).startsWith('%PDF'));
  assert(values.includes('FORMER DIRECTOR'));
  assert(values.includes('Former'));
  values.length=0;
  await buildStatutoryRegistersPdf(b,{combined:true});
  assert(values.includes('FORMER DIRECTOR'));
 }finally{globalThis.document=original;}
});
