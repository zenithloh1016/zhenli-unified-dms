import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPANY_DETAILS_FIELDS,createCompanyDetailsSheet,companyDetailIndex}
 from '../src/statutory-register-reference.js';
import {isMemberPersonalOrSharesLabel,ensureReferenceParticulars}
 from '../src/statutory-register-review.js';

test('Company Details ends at Registered Address; share capital is not guessed or displayed',()=>{
 const sheet=createCompanyDetailsSheet({name:'EXAMPLE SDN BHD',
  registration_no:'202601000001',former_names:['OLD EXAMPLE SDN BHD']});
 const labels=sheet.rows.map(row=>row[0].replace(/:$/,''));
 assert.deepEqual(labels,COMPANY_DETAILS_FIELDS);
 assert.equal(labels.at(-1),'Registered Address');
 assert.equal(sheet.rows[1][1],'F.K.A. OLD EXAMPLE SDN BHD');
 for(const label of [
  'Number of Ordinary Shares','Number of Preference Shares',
  'Total Number of Issued Shares (all classes)',
  'Ordinary Share Capital (recorded amount paid)',
  'Preference Share Capital (recorded amount paid)'
 ]) {
  assert(!labels.includes(label),'capital entries must not be added to Company Details');
  assert(companyDetailIndex(label)>=0,'legacy field identity must remain understood');
 }
});
test('legacy capital source values are preserved without injecting new capital fields',()=>{
 const book={
  version:1,companyId:'test',companyName:'EXAMPLE SDN BHD',
  registrationNo:'202601000001',
  sheets:[{name:'Company Details',rows:[
   ['Company Name:','EXAMPLE SDN BHD'],
   ['Number of Ordinary Shares:','200']
  ]}]
 };
 ensureReferenceParticulars(book);
 const rows=book.sheets.find(x=>x.name==='Company Details').rows;
 assert.equal(rows.filter(row=>row[0]==='Number of Ordinary Shares:').length,1);
 assert.equal(rows.find(row=>row[0]==='Number of Ordinary Shares:')[1],'200');
 assert(!rows.some(row=>row[0]==='Number of Preference Shares:'));
 assert(rows.some(row=>row[0]==='Former Company Name:'));
 assert(rows.some(row=>row[0]==='Registered Address:'));
 assert(isMemberPersonalOrSharesLabel('Class of Shares'));
 assert(isMemberPersonalOrSharesLabel('Share Class'));
});
