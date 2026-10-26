import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {ensureReferenceParticulars,visibleRegisterIndices} from '../src/statutory-register-review.js';
import {REFERENCE_FIELDS,referenceFieldIndex,referencePriority,sortReferenceFields} from '../src/statutory-register-reference.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';

const company={id:'reference-test',name:'SAMPLE COMPANY SDN. BHD.',
 registration_no:'202601234567 (1234567-X)'};

test('Majukaya worksheet order is reproduced in tabs without rearranging source sheets or including Managers',()=>{
 const b=makeRegisterBook(company,{path:'Majukaya reference structure.xlsx',sheets:[
  {name:'Master',rows:[['Company Name:','SAMPLE COMPANY SDN. BHD.']]},
  {name:'Register of Directors',rows:[['Director Name','Date of Birth','IC No. / Passport No.']]},
  {name:'Register of Members 001',rows:[['Name:','MEMBER X'],['Total Shares Held:','100']]},
  {name:'Register of Allotments',rows:[['Date','Allotment No.','Allottee\'s Name']]},
  {name:'Register of Transfer',rows:[['Transfer No.','Date','No. of Shares Transferred']]},
  {name:'Register of Charges',rows:[['Registered No.','Date of Registration','Name of Chargee']]},
  {name:'Register of Secretaries',rows:[['Full Name','NRIC No.','Date of Birth']]},
  {name:'Register of Managers',rows:[['Full Name','NRIC No.']]},
  {name:'Register of BO',rows:[['Full Name','NRIC No. / Passport No.','Date of Birth']]}
 ]});
 assert.deepEqual(visibleRegisterIndices(b),[0,1,2,3,4,5,6,8]);
 assert.equal(b.sheets[7].name,'Register of Managers');
 const unsequenced=makeRegisterBook(company);
 assert.deepEqual(visibleRegisterIndices(unsequenced),[7,0,1,5,6,4,3,2]);
 assert(referencePriority('Register of Allotments')<referencePriority('Register of Charges'));
 assert(referencePriority('Register of Secretaries')<referencePriority('Register of BO'));
});

test('blank register templates contain the full reference headings, with no copied statutory entries',()=>{
 const b=makeRegisterBook(company);
 const indices={directors:0,members:1,beneficialOwners:2,secretaries:3,charges:4,allotments:5,transfers:6};
 for(const [kind,index] of Object.entries(indices)){
  assert.deepEqual(b.sheets[index].rows,[REFERENCE_FIELDS[kind]]);
  assert.equal(b.sheets[index].rows.length,1);
  const registered=buildGroupedRegister(b,index);
  assert(!registered.blocks.some(x=>x.type==='record'));
 }
});

test('existing source content remains intact and additions are blank, reversible and idempotent',()=>{
 const b=makeRegisterBook(company,{path:'Imported Register.xlsx',sheets:[
  {name:'Register of Directors',rows:[
   ['Director Name','NRIC No.','Date of Appointment','Date of Cessation'],
   ['DIRECTOR SAMPLE','000000-00-0000','01/01/2025','']
  ]},
  {name:'Register of Members 001',rows:[
   ['Name:','EXISTING MEMBER'],['Total Shares Held:','100'],
   ['SHARES ACQUIRED'],['Date','No. of Shares','Consideration'],
   ['01/01/2025','100','100']
  ]},
  {name:'Register of Charges',rows:[['Registered No.','Date of Registration','Name of Chargee','Date of Discharge'],['C001','01/01/2025','BANK A','']]}
 ]});
 const before=structuredClone(b);
 assert.equal(ensureReferenceParticulars(b),true);
 assert.equal(b.sheets[0].rows[1][0],before.sheets[0].rows[1][0]);
 assert.equal(b.sheets[0].rows[1][1],before.sheets[0].rows[1][1]);
 assert.deepEqual(b.sheets[1],before.sheets[1]);
 assert.deepEqual(b.sheets[2].rows[1],before.sheets[2].rows[1]);
 assert(b.sheets[0].rows[0].includes('Service Address'));
 assert(b.sheets[2].rows[0].includes('Amount of Indebtedness'));
 assert.equal(ensureReferenceParticulars(b),false);
 assert.equal(referenceFieldIndex('directors','NRIC No.'),2);
});

test('reference field display ordering preserves source edit coordinates',()=>{
 const fields=[
  {label:'Residential Address',col:7,value:'IPOH'},
  {label:'Director Name',col:0,value:'DIRECTOR A'},
  {label:'Date of Appointment',col:9,value:'01/01/2025'},
  {label:'Date of Birth',col:1,value:'01/01/1990'}
 ];
 const arranged=sortReferenceFields('Register of Directors',fields);
 assert.deepEqual(arranged.map(x=>x.col),[0,1,7,9]);
 assert.deepEqual(fields.map(x=>x.col),[7,0,9,1]);
});
