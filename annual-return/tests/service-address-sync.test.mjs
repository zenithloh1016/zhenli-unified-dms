import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank} from '../src/core.js';
import {importCombinedRegisterSnapshot} from '../src/register-import.js';

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
