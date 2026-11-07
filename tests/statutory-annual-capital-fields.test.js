import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPANY_DETAILS_FIELDS,createCompanyDetailsSheet,companyDetailIndex}
 from '../src/statutory-register-reference.js';
import {isMemberPersonalOrSharesLabel,ensureReferenceParticulars}
 from '../src/statutory-register-review.js';

test('editable Company Details offers explicit capital source entries without assuming a value',()=>{
 const sheet=createCompanyDetailsSheet({name:'EXAMPLE SDN BHD',registration_no:'202601000001'});
 const labels=sheet.rows.map(row=>row[0].replace(/:$/,''));
 for(const label of [
  'Number of Ordinary Shares','Number of Preference Shares',
  'Total Number of Issued Shares (all classes)',
  'Ordinary Share Capital (recorded amount paid)',
  'Preference Share Capital (recorded amount paid)'
 ]){
  assert(COMPANY_DETAILS_FIELDS.includes(label));
  assert(labels.includes(label));
  assert(companyDetailIndex(label)>=0);
  assert.equal(sheet.rows.find(row=>row[0]===label+':')[1],'',
   'missing capital must not be inferred');
 }
});
test('legacy register books gain capital fields without losing existing values',()=>{
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
 assert(rows.some(row=>row[0]==='Number of Preference Shares:'));
 assert(isMemberPersonalOrSharesLabel('Class of Shares'));
 assert(isMemberPersonalOrSharesLabel('Share Class'));
});
