import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMbrsWorkspace,mbrsWorksheetCsv,mbrsPreparationSummary} from '../src/mbrs-preparation.js';

const annualReturn=()=>({
 company:{name:'',no:'',arYear:'',arDate:''},
 particulars:[
  {type:'section',en:'COMPANY DETAILS'},
  {type:'field',en:'Company Name',value:'EXAMPLE SDN. BHD.'},
  {type:'field',en:'Company Registration No.',value:'202601234567'},
  {type:'field',en:'Annual Return Year',value:'2026'},
  {type:'field',en:'Anniversary Date',value:'06/11/2026'},
  {type:'section',en:'SECTION D - DIRECTORS, COMPANY SECRETARY AND AUDITOR'},
  {type:'heading',en:'DIRECTOR 1'},
  {type:'field',en:'Full Name',value:'TEST DIRECTOR'},
  {type:'heading',en:'AUDITOR'},
  {type:'field',en:'Audit Firm Name',value:'EXAMPLE AUDIT'},
  {type:'section',en:'SECTION E - PARTICULARS OF MEMBERS'},
  {type:'heading',en:'MEMBER 1'},
  {type:'field',en:'Individual Full Name',value:'TEST MEMBER'}
 ]
});
test('AR1 extracts current draft without mutating it or inventing XBRL',()=>{
 const doc=annualReturn(),before=JSON.stringify(doc);
 const result=extractMbrsWorkspace(doc);
 assert.equal(result.format,'UNICOSEC-MBRS-PREPARATION-ONLY');
 assert.equal(result.filingType,'AR1');
 assert.equal(result.company.registrationNo,'202601234567');
 assert.equal(result.company.name,'EXAMPLE SDN. BHD.');
 assert.equal(result.fields.find(x=>x.record==='MEMBER 1').value,'TEST MEMBER');
 assert.equal(result.checks.filter(x=>x.level==='missing').length,0);
 assert.match(mbrsPreparationSummary(result),/Not an SSM filing/);
 assert.equal(JSON.stringify(doc),before);
});
test('AR4 requires independent unchanged-particulars confirmation',()=>{
 const no=extractMbrsWorkspace(annualReturn(),{filingType:'AR4'});
 assert.ok(no.checks.some(x=>x.level==='missing'&&/unchanged/.test(x.message)));
 const yes=extractMbrsWorkspace(annualReturn(),{filingType:'AR4',unchangedConfirmed:true});
 assert.ok(!yes.checks.some(x=>x.level==='missing'&&/unchanged/.test(x.message)));
 assert.ok(yes.checks.some(x=>x.level==='review'&&/AR4/.test(x.message)));
});
test('missing company identity blocks readiness',()=>{
 const doc=annualReturn();
 doc.particulars.find(x=>x.en==='Company Registration No.').value='';
 doc.particulars.find(x=>x.en==='Anniversary Date').value='';
 const result=extractMbrsWorkspace(doc);
 assert.ok(result.checks.filter(x=>x.level==='missing').length>=2);
});
test('exported CSV quotes values, prevents Excel formula injection and is explicitly a worksheet',()=>{
 const doc=annualReturn();
 doc.particulars.push({type:'field',en:'Notes',value:'=WEBSERVICE("https://example.test")'});
 const csv=mbrsWorksheetCsv(extractMbrsWorkspace(doc));
 assert.ok(csv.startsWith('\uFEFF"Filing Type"'));
 assert.ok(csv.includes('"\u0027=WEBSERVICE(""https://example.test"")"'));
 assert.ok(csv.includes('"AR1","COMPANY DETAILS","","Company Name","EXAMPLE SDN. BHD."'));
 assert.ok(!csv.includes('"<xbrl'));
});
test('invalid filing types are not silently accepted',()=>{
 assert.throws(()=>extractMbrsWorkspace(annualReturn(),{filingType:'EA2'}),/Choose AR1 or AR4/);
});
