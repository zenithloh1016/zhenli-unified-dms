import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook,mergeRegisterBooks} from '../src/statutory-register-data.js';
import {recordedFormerCompanyName,currentCompanyRegisterView,formerNameFromInlineCell} from '../src/statutory-register-company-context.js';
import {recoverFormerNameFromOriginalExcels} from '../src/statutory-register-original-former-name.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';

const company={id:'id-register-company',name:'CURRENT REGISTER COMPANY SDN BHD',registration_no:'202603330000',former_names:[]};
const legacyRows=[
 ['Company Name:','CURRENT REGISTER COMPANY SDN BHD'],
 ['Former Name:','','','ORIGINAL LEGAL NAME SDN BHD'],
 ['Company No.:','202603330000'],
 ['Registered Address:','SELANGOR']
];

test('Excel import preserves an explicit former name in the fourth column',()=>{
 const imported=makeRegisterBook(company,{path:'Original Register Book.xlsx',
  sheets:[{name:'Master',rows:legacyRows}]});
 assert.equal(imported.formerNames.at(-1),'ORIGINAL LEGAL NAME SDN BHD');
 assert.equal(imported.sheets[0].rows[1][1],'');
 const visible=currentCompanyRegisterView(imported,company);
 const section=buildGroupedRegister(visible,0,{showBlanks:true});
 assert.equal(section.blocks.find(x=>x.label==='Former Name')?.value,
  'ORIGINAL LEGAL NAME SDN BHD');
 assert.equal(imported.sheets[0].rows[1][3],'ORIGINAL LEGAL NAME SDN BHD');
});
test('merging identical Excel sources can repair missing former-name metadata',()=>{
 const old=makeRegisterBook(company);
 const original=structuredClone(old);
 const incoming=makeRegisterBook(company,{path:'Original.xlsx',
  sheets:[{name:'Master',rows:legacyRows}]});
 const first=mergeRegisterBooks(old,incoming);
 assert.equal(first.metadataChanged,true);
 assert.equal(first.book.formerNames.at(-1),'ORIGINAL LEGAL NAME SDN BHD');
 assert.deepEqual(old,original,'original cloud register remains unmodified');
 const again=mergeRegisterBooks(first.book,incoming);
 assert.equal(again.metadataChanged,false);
});
test('original archived Excel can restore a value when the JSON register is blank',async()=>{
 let downloadCount=0;
 const storage={download:async path=>{
  downloadCount++;assert.equal(path,'private/book1.xlsx');
  return {data:{size:128},error:null};
 }};
 const book={sheetNames:['Master','Register of Directors'],
  readSheet:sheet=>sheet==='Master'?legacyRows:[['Director Name','Date of Appointment']]};
 const restored=await recoverFormerNameFromOriginalExcels(
  [{name:'Register Book.xlsx',storage_path:'private/book1.xlsx',size_bytes:128}],
  {storage,openWorkbook:async blob=>{assert.equal(blob.size,128);return book;}}
 );
 assert.equal(restored.name,'ORIGINAL LEGAL NAME SDN BHD');
 assert.equal(downloadCount,1);
});
test('a former name stored on a continuation row is recovered',()=>{
 const source=makeRegisterBook(company,{path:'Workbook.xlsx',sheets:[{name:'Master',rows:[
  ['Company Name:','CURRENT REGISTER COMPANY SDN BHD'],
  ['Former Company Name (If Any):',''],
  ['', 'PREVIOUS NAME FROM LINE BELOW SDN BHD'],
  ['Registered Address:','IPOH']
 ]}]});
 assert.equal(recordedFormerCompanyName(source),'PREVIOUS NAME FROM LINE BELOW SDN BHD');
});
test('conflicting original Excel files require review and never invent a choice',async()=>{
 const storage={download:async()=>({data:{size:128},error:null})};
 let calls=0;
 const value=await recoverFormerNameFromOriginalExcels([
  {name:'First.xlsx',storage_path:'a',size_bytes:128},
  {name:'Second.xlsx',storage_path:'b',size_bytes:128}
 ],{storage,openWorkbook:async()=>{
  calls++;
  return {sheetNames:['Master'],readSheet:()=>[
   ['Company Name:','CURRENT REGISTER COMPANY SDN BHD'],
   ['Former Name:',calls===1?'HISTORY ONE SDN BHD':'HISTORY TWO SDN BHD']
  ]};
 }});
 assert.equal(value.conflict,true);
 assert.equal(value.name,'');
});
test('an archived Excel for another company without evidence does not fill a name',async()=>{
 const value=await recoverFormerNameFromOriginalExcels([
  {name:'Register Book.xlsx',storage_path:'a',size_bytes:128}
 ],{storage:{download:async()=>({data:{size:128}})},
 openWorkbook:async()=>({sheetNames:['Master'],readSheet:()=>[
  ['Company Name:','CURRENT REGISTER COMPANY SDN BHD'],
  ['Business Nature:','PREVIOUS BUSINESS ACTIVITIES']
 ]})});
 assert.equal(value.name,'');
});

test('F.K.A. prefixes in preserved Excel are recovered without being displayed',()=>{
 const inputs=[
  'F.K.A. ORIGINAL REGISTER NAME SDN BHD',
  'F.K.A.:ORIGINAL REGISTER NAME SDN BHD',
  'F.K.A.ORIGINAL REGISTER NAME SDN BHD',
  'F.K.A：ORIGINAL REGISTER NAME SDN BHD',
  '(F.K.A. ORIGINAL REGISTER NAME SDN BHD)',
  'CURRENT REGISTER COMPANY SDN BHD\nF.K.A. ORIGINAL REGISTER NAME SDN BHD',
  'Former Name: F.K.A. ORIGINAL REGISTER NAME SDN BHD',
  'F.K.A.\nORIGINAL REGISTER NAME SDN BHD'
 ];
 for(const v of inputs){
  assert.equal(formerNameFromInlineCell(v),'ORIGINAL REGISTER NAME SDN BHD',JSON.stringify(v));
  const source=makeRegisterBook(company,{path:'Preserved Original.xlsx',sheets:[
   {name:'Master',rows:[
    ['Company Name:','CURRENT REGISTER COMPANY SDN BHD'],
    ['Company No.:','202603330000'],
    ['Historical company particulars',v]
   ]}
  ]});
  assert.equal(recordedFormerCompanyName(source),'ORIGINAL REGISTER NAME SDN BHD');
  const current=currentCompanyRegisterView(source,company);
  assert.equal(current.formerNames.at(-1),'ORIGINAL REGISTER NAME SDN BHD');
  const section=buildGroupedRegister(current,0,{showBlanks:true});
  assert.equal(section.blocks.find(x=>x.label==='Former Company Name')?.value,
   'ORIGINAL REGISTER NAME SDN BHD');
 }
});
test('legal former company names ending in parentheses remain intact',()=>{
 const original=makeRegisterBook(company,{path:'Preserved Original.xlsx',sheets:[
  {name:'Master',rows:[['Former Name:','F.K.A. OLD GROUP (MALAYSIA)']]}
 ]});
 assert.equal(recordedFormerCompanyName(original),'OLD GROUP (MALAYSIA)');
});
