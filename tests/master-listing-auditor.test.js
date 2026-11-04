import test from 'node:test';
import assert from 'node:assert/strict';
import {auditorFromMasterListing} from '../src/master-listing-auditor.js';
const model={
 version:1,nameColumn:0,registrationColumn:1,
 columns:[
  {id:'c0',label:'Company Name'},{id:'c1',label:'Registration No.'},
  {id:'c2',label:'Auditors'},{id:'c3',label:'Audit Firm Address'},
  {id:'c4',label:'Auditor Fees'}],
 rows:[
  {id:'r1',values:['EXAMPLE SDN BHD','202601000001','MY & CO. (AF1254)','NO. 1 IPOH','1000']},
  {id:'r2',values:['OTHER SDN BHD','202601000002','OTHERS & CO. (AF3210)','NO. 2 KL','2000']}
 ]};
test('firm, audit registration and address come only from exact matched Master Listing company',()=>{
 assert.deepEqual(auditorFromMasterListing(model,{name:'EXAMPLE SDN BHD',registrationNo:'202601000001'}),{
  name:'MY & CO.',registrationNo:'AF1254',address:'NO. 1 IPOH'});
 assert.deepEqual(auditorFromMasterListing(model,{name:'OTHER SDN BHD',registrationNo:'202601000002'}),{
  name:'OTHERS & CO.',registrationNo:'AF3210',address:'NO. 2 KL'});
 assert.equal(auditorFromMasterListing(model,{name:'EXAMPLE SDN BHD',registrationNo:'202601000002'}),null,
  'a contradictory registration cannot be used to match another company');
 assert.equal(auditorFromMasterListing(model,{name:'UNLISTED SDN BHD'}),null);
});
test('missing details and non-auditor fee columns do not invent data',()=>{
 const copy=structuredClone(model);
 copy.rows[0].values[2]='-';copy.rows[0].values[3]='';
 assert.equal(auditorFromMasterListing(copy,{name:'EXAMPLE SDN BHD'}),null);
 copy.rows[0].values[2]='FIRM & CO. (NF2222)';
 assert.equal(auditorFromMasterListing(copy,{name:'EXAMPLE SDN BHD'}).registrationNo,'NF2222');
});
