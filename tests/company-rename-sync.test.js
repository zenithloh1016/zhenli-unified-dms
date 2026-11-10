import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileListingCompanyNames,registrationIdentity} from '../src/company-name-reconciliation.js';

function listing(){
 return {
  version:1,nameColumn:1,registrationColumn:2,
  columns:[{id:'c0',label:'No.'},{id:'c1',label:'Company Name'},
   {id:'c2',label:'Registration No.'},{id:'c3',label:'Financial Year End'}],
  rows:[
   {id:'r1',values:['1','AURUMROCK LABORATORY SDN. BHD.','201001006398','31/12/2023']},
   {id:'r2',values:['2','OTHER SDN. BHD.','202501234567 (123456-A)','31/12/2024']}
  ]
 };
}
const documents=[
 {id:'doc1',name:'LANGFORD PRIVATE EQUITY SDN. BHD.',registration_no:'201001006398 (891019-H)'},
 {id:'doc2',name:'OTHER SDN. BHD.',registration_no:'202501234567'}
];
test('match twelve-digit SSM number despite legacy parenthesized number',()=>{
 assert.equal(registrationIdentity('201001006398 (891019-H)'), '201001006398');
 const original=listing(),patched=reconcileListingCompanyNames(original,documents);
 assert.equal(patched.renamed.length,1);
 const row=patched.model.rows.find(row=>row.id==='r1');
 assert.equal(row.values[1],'LANGFORD PRIVATE EQUITY SDN. BHD.');
 assert.equal(row.values[2],'201001006398');
 assert.equal(row.values[3],'31/12/2023');
 assert.equal(original.rows[0].values[1],'AURUMROCK LABORATORY SDN. BHD.');
});
test('idempotent reconciliation never replaces unrelated fields',()=>{
 const first=reconcileListingCompanyNames(listing(),documents);
 const second=reconcileListingCompanyNames(first.model,documents);
 assert.equal(second.renamed.length,0);
 assert.equal(second.model.rows.find(row=>row.id==='r1').values[3],'31/12/2023');
});
test('ambiguous Documents registration numbers are skipped',()=>{
 const result=reconcileListingCompanyNames(listing(),[
  ...documents,{id:'doc3',name:'UNRELATED SDN. BHD.',registration_no:'201001006398'}]);
 assert.equal(result.renamed.length,0);
 assert.equal(result.conflicts,1);
});
test('unmatched Excel-only companies and different registration numbers stay untouched',()=>{
 const result=reconcileListingCompanyNames(listing(),[
  {id:'unmatched',name:'LANGFORD PRIVATE EQUITY SDN. BHD.',registration_no:'209909999999'}
 ]);
 assert.equal(result.renamed.length,0);
 assert.equal(result.model.rows[0].values[1],'AURUMROCK LABORATORY SDN. BHD.');
});
test('refuse to assign a name already belonging to a different worksheet row',()=>{
 const original=listing();
 original.rows[1].values[1]='LANGFORD PRIVATE EQUITY SDN. BHD.';
 const result=reconcileListingCompanyNames(original,documents);
 assert.equal(result.renamed.length,1); // second row changes to its authoritative Documents name
 assert.equal(result.conflicts,1); // first row cannot take the occupied name
 assert.equal(result.model.rows.find(row=>row.id==='r1').values[1],
  'AURUMROCK LABORATORY SDN. BHD.');
});
