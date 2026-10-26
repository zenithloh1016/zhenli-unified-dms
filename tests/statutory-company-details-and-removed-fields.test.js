import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {ensureReferenceParticulars,visibleRegisterIndices} from '../src/statutory-register-review.js';
import {buildGroupedRegister,buildCombinedRegisters} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {excludeRegisterField} from '../src/statutory-register-reference.js';

const co={id:'test',name:'EXAMPLE COMPANY SDN. BHD.',
 registration_no:'202612345678 (1234567-X)'};
const profile=book=>book.sheets.findIndex(s=>s.name==='Company Details'||s.name==='Master');

test('every new company has Company Details first in tabs and combined PDF',()=>{
 const b=makeRegisterBook(co);
 const pi=profile(b);
 assert(pi>=0);
 assert.equal(visibleRegisterIndices(b)[0],pi);
 assert.equal(buildCombinedRegisters(b,{showBlanks:true})[0].title,'Company Details');
 const page=buildGroupedRegister(b,pi,{showBlanks:true});
 const fields=page.blocks.filter(x=>x.type==='field');
 assert.deepEqual(fields.map(x=>x.label),[
  'Company Name','Company No.','Last update','Date of Incorporation',
  'Date of Cosec Appointment','Registered Address'
 ]);
 assert.deepEqual(fields.map(x=>x.value),[
  co.name,co.registration_no,'','','',''
 ]);
 const html=renderStatutoryRegisterDocument(b,pi,{showBlanks:true});
 assert(html.includes(co.name));
 assert(html.includes('Date of Cosec Appointment'));
 assert(html.includes('Registered Address'));
});

test('imported Master company details keep values, add missing fields, and remain idempotent',()=>{
 const b=makeRegisterBook(co,{path:'original.xlsx',sheets:[
  {name:'Master',rows:[
   ['Company Name:','ORIGINAL COMPANY NAME'],
   ['Company No.:','LEGACY REGISTRATION'],
   ['Date of Incorporation:','23/07/2014'],
   ['Registered Office:','ORIGINAL REGISTERED OFFICE']
  ]},
  {name:'Register of Directors',rows:[['Name','Date of Appointment'],['DIRECTOR A','01/01/2025']]}
 ]});
 const before=structuredClone(b.sheets[0].rows);
 assert.equal(ensureReferenceParticulars(b),true);
 assert.deepEqual(b.sheets[0].rows.slice(0,before.length),before);
 const details=buildGroupedRegister(b,0,{showBlanks:true});
 const fields=details.blocks.filter(x=>x.type==='field');
 assert.deepEqual(fields.map(x=>x.label).slice(0,6),[
  'Company Name','Company No.','Last update','Date of Incorporation',
  'Date of Cosec Appointment','Registered Address'
 ]);
 assert(fields.some(x=>x.label==='Registered Address'&&x.value==='ORIGINAL REGISTERED OFFICE'));
 assert(fields.some(x=>x.label==='Company Name'&&x.value==='ORIGINAL COMPANY NAME'));
 assert(fields.some(x=>x.label==='Date of Incorporation'&&x.value==='23/07/2014'));
 assert(fields.some(x=>x.label==='Date of Cosec Appointment'&&x.value===''));
 const snapshot=JSON.stringify(b.sheets);
 assert.equal(ensureReferenceParticulars(b),false);
 assert.equal(JSON.stringify(b.sheets),snapshot);
});

test('existing register collection without a profile creates Company Details with company-specific name and no guesses',()=>{
 const b=makeRegisterBook(co,{path:'imported.xlsx',sheets:[
  {name:'Register of Directors',rows:[['Name','Date of Appointment'],['DIRECTOR ONE','2026-01-01']]}
 ]});
 assert.equal(profile(b),-1);
 assert.equal(ensureReferenceParticulars(b),true);
 assert.equal(visibleRegisterIndices(b)[0],profile(b));
 const fields=buildGroupedRegister(b,profile(b),{showBlanks:true}).blocks.filter(x=>x.type==='field');
 assert.equal(fields.find(x=>x.label==='Company Name').value,co.name);
 assert.equal(fields.find(x=>x.label==='Company No.').value,co.registration_no);
 assert(fields.filter(x=>x.label==='Date of Incorporation'||x.label==='Date of Cosec Appointment'||x.label==='Registered Address')
  .every(x=>x.value===''));
 assert.equal(b.sheets.filter(s=>s.name==='Company Details').length,1);
});

test('Director Remarks are hidden from web and PDF layout but preserved in stored rows',()=>{
 const b=makeRegisterBook(co,{path:'old.xlsx',sheets:[
  {name:'Register of Directors',rows:[
   ['Name','Date of Birth','Identification No.','Remarks','Appointment Date','Cessation Date'],
   ['DIRECTOR A','01/01/1990','ID1','PRIVATE SOURCE REMARK','01/01/2025','-']
  ]}
 ]});
 const before=JSON.stringify(b.sheets[0].rows);
 assert(excludeRegisterField('Register of Directors','Remarks'));
 const blocks=buildGroupedRegister(b,0,{showBlanks:true}).blocks;
 assert(blocks.some(x=>x.label==='Name'&&x.value==='DIRECTOR A'));
 assert(!blocks.some(x=>x.label==='Remarks'));
 assert(!renderStatutoryRegisterDocument(b,0,{showBlanks:true}).includes('PRIVATE SOURCE REMARK'));
 assert.equal(JSON.stringify(b.sheets[0].rows),before);
});

test('BO effective date becoming BO is retained, Section 56 notice date is hidden, and cessation history remains',()=>{
 const b=makeRegisterBook(co,{path:'old.xlsx',sheets:[
  {name:'Register of BO',rows:[
   ['Full Name','Identification No.','Date of Birth',
    'Date a Person Becomes / Ceases to Become BO',
    'Date of Notices Pursuant to Subsection 56(1), (2) and (3) of the CA 2016 & Date of BO Received',
    'Effective Date','Cessation Date','Criteria'],
   ['BENEFICIAL OWNER A','ID-A','01/01/1990',
    'Date becoming BO: 01/01/2020','Date of notice: 01/01/2021',
    '01/01/2020','05/05/2026','A']
  ]}
 ]});
 const before=JSON.stringify(b.sheets[0].rows);
 const section=buildGroupedRegister(b,0,{showBlanks:true});
 assert(section.blocks.some(x=>x.type==='record'&&x.status==='Former'));
 const fields=section.blocks.filter(x=>x.type==='field');
 assert(fields.some(x=>x.label==='Cessation Date'&&x.value==='05/05/2026'));
 assert(fields.some(x=>x.label==='Criteria'&&x.value==='A'));
 const effective=fields.filter(x=>x.label==='Effective Date Becoming BO');
 assert.equal(effective.length,2,'retain both original becoming-BO source fields without losing data');
 assert(effective.some(x=>x.value==='01/01/2020'));
 assert(effective.some(x=>x.value==='Date becoming BO: 01/01/2020'));
 assert(!fields.some(x=>/notices|notice/i.test(x.label)));
 const html=renderStatutoryRegisterDocument(b,0,{showBlanks:true});
 assert(html.includes('Effective Date Becoming BO'));
 assert(html.includes('01/01/2020'));
 assert(!html.includes('Date of notice: 01/01/2021'));
 assert.equal(JSON.stringify(b.sheets[0].rows),before);
});
\ntest('all companies have a standard editable Effective Date Becoming BO field by default',()=>{
 const b=makeRegisterBook(co);
 const bo=b.sheets.find(s=>s.name==='Register of Beneficial Owners');
 assert(bo.rows[0].includes('Effective Date Becoming BO'));
 assert(!bo.rows[0].some(x=>/notices|notice/i.test(x)));
 const old=makeRegisterBook(co,{path:'historical.xlsx',sheets:[
  {name:'Register of BO',rows:[
   ['Full Name','Identification No.','Date a Person Becomes / Ceases to Become BO',
    'Date of Notices Pursuant to Section 56'],
   ['BO HOLDER','ID-X','Date becoming BO: 23/07/2014','Date of notice: 03/08/2014']
  ]}
 ]});
 const original=JSON.stringify(old.sheets[0].rows);
 assert.equal(ensureReferenceParticulars(old),true);
 const after=old.sheets[0].rows[0];
 assert.equal(after.filter(label=>/^(?:Effective Date Becoming BO|Date a Person Becomes \/ Ceases to Become BO)$/.test(label)).length,1,
  'existing becoming-BO heading must not be duplicated');
 assert.equal(old.sheets[0].rows[1][2],'Date becoming BO: 23/07/2014');
 const layout=buildGroupedRegister(old,0,{showBlanks:true});
 assert(layout.blocks.some(x=>x.type==='field'&&x.label==='Effective Date Becoming BO'));
 assert(!layout.blocks.some(x=>x.type==='field'&&/notice/i.test(x.label)));
 assert.equal(JSON.stringify(old.sheets[0].rows),original,
  'standardizing fields must not rewrite original BO records');
});
