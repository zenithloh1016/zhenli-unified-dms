import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPANY_DETAILS_FIELDS,createCompanyDetailsSheet} from '../src/statutory-register-reference.js';
import {currentCompanyRegisterView,recordedFormerCompanyName,formerNameFromInlineCell} from '../src/statutory-register-company-context.js';
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
  assert.equal(sheet.rows[1][1],'OLD EXAMPLE SDN BHD');
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
 assert.match(html,/>AURUMROCK LABORATORY SDN\. BHD\.</);
 assert.doesNotMatch(html,/F\.K\.A\./);
 assert.doesNotMatch(html,/Type of Shares Issued|Ordinary Share Capital|Aggregate Amount Paid/);
});
test('existing saved former name is retained when Documents has no historical names',()=>{
 const original=bookWithLegacyFields();
 original.sheets[0].rows.splice(1,0,['Former Name:','F.K.A. SAVED PREVIOUS COMPANY SDN. BHD.']);
 const emptyHistory={...company,former_names:[]};
 const projected=currentCompanyRegisterView(original,emptyHistory);
 assert.equal(projected.formerNames[0],'SAVED PREVIOUS COMPANY SDN. BHD.');
 const html=renderStatutoryRegisterDocument(projected,0,{showBlanks:true});
 assert.match(html,/SAVED PREVIOUS COMPANY SDN\. BHD\./);
 assert.doesNotMatch(html,/F\.K\.A\./);
 assert.equal(original.sheets[0].rows[1][1],'F.K.A. SAVED PREVIOUS COMPANY SDN. BHD.',
  'source workbook and private history remain unchanged');
});
test('recognize former names in imported Company Details without a colon',()=>{
 const original=bookWithLegacyFields();
 original.sheets[0].rows.splice(1,0,['Previous Company Name','OLDER REGISTER NAME SDN. BHD.']);
 const projected=currentCompanyRegisterView(original,{...company,former_names:[]});
 const blocks=buildGroupedRegister(projected,0,{showBlanks:true}).blocks;
 assert.equal(blocks.find(x=>x.label==='Former Company Name'||x.label==='Previous Company Name')?.value,
  'OLDER REGISTER NAME SDN. BHD.');
});
test('read saved former-name metadata even when old Company Details added a blank field',()=>{
 const old=bookWithLegacyFields();
 old.formerNames=['REGISTER ORIGINAL NAME SDN. BHD.'];
 old.sheets[0].rows.splice(1,0,['Former Company Name:','']);
 const projected=currentCompanyRegisterView(old,{...company,former_names:[]});
 assert.equal(projected.sheets[0].rows[1][1],'REGISTER ORIGINAL NAME SDN. BHD.');
 const rendered=renderStatutoryRegisterDocument(projected,0,{showBlanks:true});
 assert.match(rendered,/REGISTER ORIGINAL NAME SDN\. BHD\./);
 assert.doesNotMatch(rendered,/F\.K\.A\./);
});
test('an obsolete workbook heading alone is not evidence of legal former name',()=>{
 const old=bookWithLegacyFields();
 const projected=currentCompanyRegisterView(old,{...company,former_names:[]});
 assert.equal(projected.companyName,newCompanyName);
 assert.equal(projected.formerNames.length,0);
 const fields=buildGroupedRegister(projected,0,{showBlanks:true}).blocks;
 assert.equal(fields.find(x=>x.label==='Former Company Name')?.value,'');
});

test('never apply another company name to the wrong company ID',()=>{
 const previous=bookWithLegacyFields('different-id');
 assert.equal(currentCompanyRegisterView(previous,company),previous);
});

test('legacy statutory books preserve former names stored in one cell',()=>{
 const samples=[
  'Former Name: LEGACY FIRST SDN BHD',
  'Former Name (If Any): LEGACY FIRST SDN BHD',
  'Company formerly known as: LEGACY FIRST SDN BHD',
  'F.K.A. LEGACY FIRST SDN BHD'
 ];
 for(const entry of samples){
  const book=bookWithLegacyFields();
  book.sheets[0].rows.splice(1,0,[entry]);
  assert.equal(formerNameFromInlineCell(entry),'LEGACY FIRST SDN BHD');
  assert.equal(recordedFormerCompanyName(book),'LEGACY FIRST SDN BHD');
  const view=currentCompanyRegisterView(book,{...company,former_names:[]});
  const section=buildGroupedRegister(view,0,{showBlanks:true});
  assert.equal(section.blocks.find(x=>x.label==='Former Company Name')?.value,
   'LEGACY FIRST SDN BHD');
  assert.equal(book.sheets[0].rows[1][0],entry,'original source must not change');
 }
});
test('legacy name label containing If Any restores verified adjacent value',()=>{
 const book=bookWithLegacyFields();
 book.sheets[0].rows.splice(1,0,['Former Name (If Any):','THE EARLIER NAME SDN BHD']);
 const view=currentCompanyRegisterView(book,{...company,former_names:[]});
 assert.equal(recordedFormerCompanyName(book),'THE EARLIER NAME SDN BHD');
 assert.match(renderStatutoryRegisterDocument(view,0,{showBlanks:true}),
  /THE EARLIER NAME SDN BHD/);
});
test('an unrelated description must never be guessed as a former legal name',()=>{
 const book=bookWithLegacyFields();
 book.sheets[0].rows.splice(1,0,['Business Description:','FORMER ACTIVITIES IN PROPERTY']);
 assert.equal(recordedFormerCompanyName(book),'');
});

test('current editable Company Details takes precedence over an older Master import',()=>{
 const historical=bookWithLegacyFields();
 historical.sheets=[
  {name:'Master',rows:[['Former Name:','VERY OLD COMPANY SDN BHD']]},
  {name:'Company Details',rows:[['Former Name (If Any):','CURRENTLY RECORDED FORMER SDN BHD']]}
 ];
 assert.equal(recordedFormerCompanyName(historical),'CURRENTLY RECORDED FORMER SDN BHD');
 const view=currentCompanyRegisterView(historical,{...company,former_names:[]});
 assert.equal(view.formerNames[0],'CURRENTLY RECORDED FORMER SDN BHD');
 const currentSection=buildGroupedRegister(view,1,{showBlanks:true});
 assert(currentSection.blocks.some(b=>b.value==='CURRENTLY RECORDED FORMER SDN BHD'));
});
