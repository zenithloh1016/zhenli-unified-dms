import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {ensureReferenceParticulars} from '../src/statutory-register-review.js';
import {REFERENCE_FIELDS,referenceFieldIndex} from '../src/statutory-register-reference.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';

const company={id:'test-secretary',name:'TEST SECRETARY SDN. BHD.',
 registration_no:'202601234567 (1234567-X)'};
const secretaryIndex=b=>b.sheets.findIndex(s=>s.name==='Register of Secretaries');

test('default Secretaries places SSM PC and Membership directly after Name and omits Registration No.',()=>{
 const b=makeRegisterBook(company);
 const directors=REFERENCE_FIELDS.directors;
 const secretary=REFERENCE_FIELDS.secretaries;
 assert.deepEqual(secretary.slice(0,3),[
  'Name','SSM Practicing Certificate No.','Membership No.'
 ]);
 assert.deepEqual(secretary.slice(3),directors.slice(1));
 assert(!secretary.includes('Registration No.'));
 const sheet=b.sheets[secretaryIndex(b)];
 assert.deepEqual(sheet.rows,[secretary]);
 assert.equal(buildGroupedRegister(b,secretaryIndex(b),{showBlanks:true}).blocks.filter(x=>x.type==='record').length,0);
 assert.equal(referenceFieldIndex('secretaries','NRIC No.'),4);
 assert.equal(referenceFieldIndex('secretaries','Registration No.'),-1);
 assert.notEqual(referenceFieldIndex('secretaries','Membership No.'),
  referenceFieldIndex('secretaries','SSM Practicing Certificate No.'));
});

test('existing secretary records keep all values while new particulars are blank and correctly ordered',()=>{
 const originalHeaders=['Name','Registration No.','Date of Birth','Nationality / Race',
  'Business Occupation','Residential Address','Appointment Date','Cessation Date','NRIC No.'];
 const originalRecord=['LIN TZE YEE (MIA27166)','LEGACY REGISTRATION',
  '16/05/1978','MALAYSIAN / CHINESE','COMPANY SECRETARY','KUALA LUMPUR',
  '06/06/2025','-','780516-14-5295'];
 const b=makeRegisterBook(company,{path:'Original Secretaries.xlsx',sheets:[
  {name:'Register of Secretaries',rows:[originalHeaders.slice(),originalRecord.slice()]}
 ]});
 const before=JSON.stringify(b.sheets[0].rows);
 assert.equal(ensureReferenceParticulars(b),true);
 assert.deepEqual(b.sheets[0].rows[0].slice(0,originalHeaders.length),originalHeaders);
 assert.deepEqual(b.sheets[0].rows[1],originalRecord);
 assert(b.sheets[0].rows[0].includes('SSM Practicing Certificate No.'));
 assert(b.sheets[0].rows[0].includes('Membership No.'));
 assert(!b.sheets[0].rows[0].includes('Identification No.'),
  'the original NRIC column already fulfills the identification requirement');
 const blocks=buildGroupedRegister(b,0,{showBlanks:true}).blocks;
 const fields=blocks.filter(x=>x.type==='field');
 assert.deepEqual(fields.map(x=>x.label),REFERENCE_FIELDS.secretaries);
 assert.equal(fields.find(x=>x.label==='Identification No.').value,'780516-14-5295');
 assert(!fields.some(x=>x.label==='Registration No.'),'legacy Registration No. is not shown');
 assert.equal(b.sheets[0].rows[1][1],'LEGACY REGISTRATION',
  'saved legacy registration number must remain intact');
 assert.equal(fields.find(x=>x.label==='SSM Practicing Certificate No.').value,'');
 assert.equal(fields.find(x=>x.label==='Membership No.').value,'');
 assert.equal(blocks.find(x=>x.type==='record').status,'Current');
 const html=renderStatutoryRegisterDocument(b,0,{showBlanks:true});
 assert(html.includes('SSM Practicing Certificate No.'));
 assert(html.includes('Membership No.'));
 assert(html.includes('780516-14-5295'));
 assert(!html.includes('LEGACY REGISTRATION'));
 assert.deepEqual(fields.slice(0,3).map(f=>f.label),[
  'Name','SSM Practicing Certificate No.','Membership No.'
 ]);
 assert.equal(ensureReferenceParticulars(b),false);
 assert.equal(JSON.stringify(b.sheets[0].rows.slice(0,2)),
  JSON.stringify([b.sheets[0].rows[0],originalRecord]));
 assert.notEqual(before,JSON.stringify(b.sheets[0].rows),
  'only missing header cells are appended and existing values are unchanged');
});

test('existing secretary with populated SSM PC and membership headers does not get duplicate columns',()=>{
 const heads=['Name','Date of Birth','NRIC No.','SSM Practising Certificate No.',
  'MIA No.','Date of Appointment','Date of Cessation'];
 const record=['SECRETARY A','01/01/1980','800101-00-0000','PC/12345',
  'MIA12345','01/01/2025','05/05/2026'];
 const b=makeRegisterBook(company,{path:'legacy.xlsx',sheets:[
  {name:'Register of Secretaries',rows:[heads.slice(),record.slice()]}
 ]});
 assert.equal(ensureReferenceParticulars(b),true);
 const mapped=buildGroupedRegister(b,0,{showBlanks:true}).blocks;
 assert.equal(mapped.find(x=>x.type==='record').status,'Former');
 const fields=mapped.filter(x=>x.type==='field');
 assert.equal(fields.filter(x=>x.label==='SSM Practicing Certificate No.').length,1);
 assert.equal(fields.filter(x=>x.label==='Membership No.').length,1);
 assert.equal(fields.find(x=>x.label==='SSM Practicing Certificate No.').value,'PC/12345');
 assert.equal(fields.find(x=>x.label==='Membership No.').value,'MIA12345');
 assert.deepEqual(b.sheets[0].rows[1],record);
 assert.equal(ensureReferenceParticulars(b),false);
});

test('legacy Registration No. stays archived but never appears in secretary PDFs or combined register',()=>{
 const book=makeRegisterBook(company,{path:'historic.xlsx',sheets:[
  {name:'Register of Secretaries',rows:[
   ['Name','Registration No.','Date of Birth','NRIC No.','Date of Appointment','Date of Cessation'],
   ['SECRETARY B','HISTORIC REGISTER 123','01/01/1980','800101-00-0000','01/01/2022','-']
  ]}
 ]});
 const original=JSON.stringify(book.sheets[0].rows);
 ensureReferenceParticulars(book);
 const page=buildGroupedRegister(book,0,{showBlanks:true});
 assert.deepEqual(page.blocks.filter(x=>x.type==='field').slice(0,3).map(x=>x.label),
  ['Name','SSM Practicing Certificate No.','Membership No.']);
 assert(!page.blocks.some(x=>x.label==='Registration No.'));
 const html=renderStatutoryRegisterDocument(book,0,{showBlanks:true});
 assert(!html.includes('HISTORIC REGISTER 123'));
 // 'Company Registration No.' remains in the document heading; the Secretary field is absent.
 assert.equal(book.sheets[0].rows[1][1],'HISTORIC REGISTER 123');
 assert.deepEqual(book.sheets[0].rows.slice(1),JSON.parse(original).slice(1));
 assert.equal(ensureReferenceParticulars(book),false);
});
