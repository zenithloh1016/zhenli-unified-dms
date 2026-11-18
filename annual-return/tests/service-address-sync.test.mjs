import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank} from '../src/core.js';
import {readFileSync} from 'node:fs';
import {importCombinedRegisterSnapshot,currentStatutoryServiceAddresses,useStatutoryServiceAddress} from '../src/register-import.js';

const field=(label,value)=>({type:'field',label,value});
const group=title=>({type:'group',title});
const record=(title,status='Current')=>({type:'record',title,status});
function snapshot({company=[],directors=[],secretaries=[]}={}){
 return {version:1,companyId:'company-1',companyName:'EXAMPLE SDN BHD',
  registrationNo:'202601234567',sections:[
   {title:'Company Details',blocks:company.map(([label,value])=>field(label,value))},
   {title:'Register of Directors',blocks:directors.flatMap(([name,address,status='Current'])=>[
    group(status),record(name,status),field('Name',name),field('Service Address',address)
   ])},
   {title:'Register of Secretaries',blocks:secretaries.flatMap(([name,address,status='Current'])=>[
    group(status),record(name,status),field('Name',name),field('Service Address',address)
   ])}
  ]};
}
const value=(doc,name)=>doc.particulars.find(x=>x.type==='field'&&x.en===name)?.value;
const business='Principal Place of Business';
const financial='Address Where Financial Records Are Kept';

test('one consistent current service address fills blank principal and financial addresses',()=>{
 const data=snapshot({directors:[['DIRECTOR A','NO. 9, IPOH'],['DIRECTOR B','NO. 9, IPOH']],
  secretaries:[['SECRETARY A','NO. 9, IPOH']]});
 const original=structuredClone(data);
 const {document}=importCombinedRegisterSnapshot(cloneBlank(),data);
 assert.equal(value(document,business),'NO. 9, IPOH');
 assert.equal(value(document,financial),'NO. 9, IPOH');
 assert.deepEqual(data,original,'source statutory records must not change');
});

test('a former officeholder does not affect current service address default',()=>{
 const data=snapshot({directors:[['DIRECTOR A','IPOH'],['DIRECTOR FORMER','KUALA LUMPUR','Former']]});
 const {document}=importCombinedRegisterSnapshot(cloneBlank(),data);
 assert.equal(value(document,business),'IPOH');
 assert.equal(value(document,financial),'IPOH');
});

test('disagreeing current service addresses never invent a company business address',()=>{
 const data=snapshot({directors:[['DIRECTOR A','IPOH'],['DIRECTOR B','PENANG']]});
 const {document}=importCombinedRegisterSnapshot(cloneBlank(),data);
 assert.equal(value(document,business),'');
 assert.equal(value(document,financial),'');
});

test('registered business and financial addresses take precedence over service address',()=>{
 const data=snapshot({
  company:[['Business Address','JOHOR'],['Address Where Financial Records Are Kept','MELAKA']],
  directors:[['DIRECTOR A','IPOH']]
 });
 const {document}=importCombinedRegisterSnapshot(cloneBlank(),data);
 assert.equal(value(document,business),'JOHOR');
 assert.equal(value(document,financial),'MELAKA');
});

test('an independently entered draft business address is never replaced',()=>{
 const data=snapshot({directors:[['DIRECTOR A','IPOH']]});
 const doc=cloneBlank();
 doc.particulars.find(x=>x.type==='field'&&x.en===business).value='VERIFIED BUSINESS ADDRESS';
 doc.particulars.find(x=>x.type==='field'&&x.en===financial).value='VERIFIED RECORDS ADDRESS';
 const {document}=importCombinedRegisterSnapshot(doc,data);
 assert.equal(value(document,business),'VERIFIED BUSINESS ADDRESS');
 assert.equal(value(document,financial),'VERIFIED RECORDS ADDRESS');
});

test('financial records address follows an existing principal business address when empty',()=>{
 const data=snapshot({company:[['Principal Place of Business','PENANG']],
  directors:[['DIRECTOR A','IPOH']]});
 const {document}=importCombinedRegisterSnapshot(cloneBlank(),data);
 assert.equal(value(document,business),'PENANG');
 assert.equal(value(document,financial),'PENANG');
});

test('distinct current Service Addresses are offered without guessing; former offices excluded',()=>{
 const data=snapshot({
  directors:[['DIRECTOR A','IPOH'],['DIRECTOR B','KUALA LUMPUR'],['FORMER DIRECTOR','OLD TOWN','Former']],
  secretaries:[['SECRETARY A','IPOH'],['FORMER SECRETARY','FORMER SECRETARY OFFICE','Former']]
 });
 const choices=currentStatutoryServiceAddresses(data);
 assert.deepEqual(choices.map(x=>x.value),['IPOH','KUALA LUMPUR']);
 assert(choices[0].label.includes('DIRECTOR A'));
 assert(choices[0].label.includes('SECRETARY A'));
 const {document}=importCombinedRegisterSnapshot(cloneBlank(),data);
 assert.equal(value(document,business),'','ambiguous addresses must not auto-select');
 assert.equal(value(document,financial),'');
});

test('explicit Service Address selection replaces both old saved values before PDF',()=>{
 const data=snapshot({directors:[['DIRECTOR A','IPOH'],['DIRECTOR B','KUALA LUMPUR']],
  company:[['Business Address','LEGACY BIZ'],['Address Where Financial Records Are Kept','OLD FINANCIAL']]
 });
 const original=cloneBlank();
 original.particulars.find(x=>x.en===business).value='OLD MANUAL BUSINESS ADDRESS';
 original.particulars.find(x=>x.en===financial).value='OLD MANUAL ACCOUNTING OFFICE';
 const pre=structuredClone(original),source=structuredClone(data);
 const result=useStatutoryServiceAddress(original,data,'KUALA LUMPUR');
 assert.equal(value(result.document,business),'KUALA LUMPUR');
 assert.equal(value(result.document,financial),'KUALA LUMPUR');
 assert.equal(result.overwritten,2);
 assert.equal(result.changed,2);
 assert.deepEqual(original,pre,'do not mutate current draft before its backup');
 assert.deepEqual(data,source,'do not alter archived statutory entries');
 assert.equal(value(useStatutoryServiceAddress(result.document,data,'KUALA LUMPUR').document,business),'KUALA LUMPUR');
 assert.equal(useStatutoryServiceAddress(result.document,data,'KUALA LUMPUR').changed,0);
});

test('only an actual current saved Service Address can be chosen',()=>{
 const data=snapshot({directors:[['D','CURRENT','Current'],['F','FORMER','Former']]});
 assert.throws(()=>useStatutoryServiceAddress(cloneBlank(),data,'FORMER'),/Choose an address/);
 assert.throws(()=>useStatutoryServiceAddress(cloneBlank(),data,'INVENTED'),/Choose an address/);
});

test('company mismatch and removed destination fields are blocked',()=>{
 const data=snapshot({directors:[['DIRECTOR','IPOH']]});
 const other=cloneBlank();other.company.no='209999999999';
 assert.throws(()=>useStatutoryServiceAddress(other,data,'IPOH'),/another company/);
 const missing=cloneBlank();
 missing.particulars=missing.particulars.filter(x=>x.en!==financial);
 assert.throws(()=>useStatutoryServiceAddress(missing,data,'IPOH'),/Restore both/);
});

test('when one of many statutory Service Addresses already matches financial records, blank business can follow it',()=>{
 const data=snapshot({directors:[['A','IPOH'],['B','PENANG']],
  company:[['Address Where Financial Records Are Kept','PENANG']]
 });
 const {document}=importCombinedRegisterSnapshot(cloneBlank(),data);
 assert.equal(value(document,business),'PENANG');
 assert.equal(value(document,financial),'PENANG');
});

test('Annual Return UI includes an explicit address selector and pre-PDF application handler',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 for(const id of ['sync-service-address','service-address-chooser','service-address-choice','apply-service-address'])
  assert(html.includes('id="'+id+'"'));
 assert(main.includes("useStatutoryServiceAddress(doc,serviceAddressSource,value)"));
 assert(main.includes("applyServiceAddressFromSavedRegisters("));
 assert(main.includes("doc=result.document;normalizeReviewValues()"));
});
