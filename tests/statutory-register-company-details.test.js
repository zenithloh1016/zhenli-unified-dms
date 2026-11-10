import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPANY_DETAILS_FIELDS,createCompanyDetailsSheet} from '../src/statutory-register-reference.js';
import {currentCompanyRegisterView} from '../src/statutory-register-company-context.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';

const savedCompanyName='AURUMROCK LABORATORY SDN. BHD.';
const newCompanyName='LANGFORD PRIVATE EQUITY SDN. BHD.';
const company={id:'c1',name:newCompanyName,registration_no:'201001006398 (891019-H)',
 former_names:[savedCompanyName]};
const bookWithLegacyFields=(id='c1')=>({
 version:1,companyId:id,companyName:savedCompanyName,
 registrationNo:'201001006398 (891019-H)',
 sheets:[{name:'Company Details',rows:[
  ['Company Name:',newCompanyName],
  ['Company No.:','201001006398 (891019-H)'],
  ['Last update:','09/04/2026'],
  ['Date of Incorporation:','25/02/2010'],
  ['Date of Cosec Appointment:','26/03/2024'],
  ['Registered Address:','SEL OUTDOOR ADDRESS'],
  ['Type of Shares Issued:','Ordinary'],
  ['Currency:','MYR'],
  ['Classes of Shares Issued:','Ordinary'],
  ['Number of Ordinary Shares:','1,000'],
  ['Number of Preference Shares:','0'],
  ['Total Number of Issued Shares (all classes):','1,000'],
  ['Ordinary Share Capital (recorded amount paid):','RM1,000'],
  ['Preference Share Capital (recorded amount paid):','RM0'],
  ['Aggregate Amount Paid on Allotments (verify share capital):','RM1,000']
 ]}]
});

test('Company Details templates end at Registered Address for every new company',()=>{
 assert.deepEqual(COMPANY_DETAILS_FIELDS,[
  'Company Name','Former Company Name','Company No.','Last update',
  'Date of Incorporation','Date of Cosec Appointment','Registered Address'
 ]);
 for(const id of ['c1','c2']){
  const sheet=createCompanyDetailsSheet({id,name:'EXAMPLE SDN BHD',registration_no:'202601234567',
   former_names:['OLD EXAMPLE SDN BHD']});
  assert.equal(sheet.rows.length,7);
  assert.equal(sheet.rows[1][1],'F.K.A. OLD EXAMPLE SDN BHD');
  assert.equal(sheet.rows.at(-1)[0],'Registered Address:');
 }
});
test('all older imported Company Details exclude every field after registered address in preview and PDF projection',()=>{
 for(const id of ['c1','c2']){
  const original=bookWithLegacyFields(id);
  for(const showBlanks of [true,false]){
   const section=buildGroupedRegister(original,0,{showBlanks});
   const labels=section.blocks.filter(x=>x.type==='field').map(x=>x.label);
   assert.deepEqual(labels,COMPANY_DETAILS_FIELDS);
   assert.equal(section.blocks.find(x=>x.label==='Registered Address')?.value,'SEL OUTDOOR ADDRESS');
  }
  // Legacy records are retained privately and never mutated by the display.
  assert.equal(original.sheets[0].rows.length,15);
 }
});
test('the current Documents company name overrides stale stored heading in every preview and PDF',()=>{
 const previous=bookWithLegacyFields();
 const visible=currentCompanyRegisterView(previous,company);
 assert.equal(visible.companyName,newCompanyName);
 assert.equal(previous.companyName,savedCompanyName);
 const html=renderStatutoryRegisterDocument(visible,0,{showBlanks:true});
 assert.match(html,/<h2>LANGFORD PRIVATE EQUITY SDN\. BHD\.<\/h2>/);
 assert.doesNotMatch(html,/<h2>AURUMROCK LABORATORY/);
 assert.match(html,/F\.K\.A\. AURUMROCK LABORATORY SDN\. BHD\./);
 assert.doesNotMatch(html,/Type of Shares Issued|Ordinary Share Capital|Aggregate Amount Paid/);
});
test('never apply another company name to the wrong company ID',()=>{
 const previous=bookWithLegacyFields('different-id');
 assert.equal(currentCompanyRegisterView(previous,company),previous);
});
