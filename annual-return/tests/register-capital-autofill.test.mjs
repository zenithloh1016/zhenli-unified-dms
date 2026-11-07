import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank} from '../src/core.js';
import {importCombinedRegisterSnapshot} from '../src/register-import.js';
import {prepopulateAuditorFromMasterListing} from '../src/auditor-import.js';

const f=(label,value)=>({type:'field',label,value});
const r=(title,status='Current')=>({type:'record',title,status});
const g=title=>({type:'group',title});
const section=(title,blocks)=>({title,blocks});
const capital=[
 f('Currency','MYR'),
 f('Classes of Shares Issued','Ordinary & Preference'),
 f('Number of Ordinary Shares','100'),
 f('Number of Preference Shares','50'),
 f('Total Number of Issued Shares (all classes)','150'),
 f('Ordinary Share Capital (recorded amount paid)','100,000.00'),
 f('Preference Share Capital (recorded amount paid)','50,000.00'),
 f('Aggregate Amount Paid on Allotments (verify share capital)','150,000.00')
];
function snapshot({
 memberRecords=[
  {name:'MEMBER A',id:'ID A',shares:'60',cls:'Ordinary'},
  {name:'MEMBER B',id:'ID B',shares:'40',cls:'Ordinary'},
  {name:'MEMBER C',id:'ID C',shares:'50',cls:'Preference'}
 ],
 companyFields=capital
}={}){
 return {
  version:1,companyId:'company-1',companyName:'EXAMPLE SDN BHD',
  registrationNo:'202601000001',
  sections:[
   section('Company Details',companyFields),
   section('Register of Members',[
    g('Current'),
    ...memberRecords.flatMap(x=>[r(x.name),
     f('Shareholder Name',x.name),f('Identification No.',x.id),
     f('Class of Shares',x.cls),f('Current Number of Shares Held',x.shares)]),
    g('Former'),r('FORMER MEMBER','Former'),
    f('Shareholder Name','FORMER MEMBER'),
    f('Current Number of Shares Held','9,999')
   ]),
   section('Register of Secretaries',[g('Current'),r('SECRETARY'),
    f('Name','SECRETARY A'),f('Identification No.','SECID')])
  ]
 };
}
function fieldValue(doc,label,heading){
 const start=heading?doc.particulars.findIndex(x=>x.type==='heading'&&x.en===heading):0;
 assert.ok(start>=0);
 const tail=heading?doc.particulars.slice(start+1):doc.particulars;
 const end=heading?tail.findIndex(x=>x.type==='heading'||x.type==='section'):-1;
 return (end<0?tail:tail.slice(0,end)).find(x=>x.type==='field'&&x.en===label)?.value;
}
function baseDraft(){
 const doc=cloneBlank();
 doc.company.name='EXAMPLE SDN BHD';doc.company.no='202601000001';
 return doc;
}
test('automatically fills documented capital and current member details without overwriting verified entries',()=>{
 const input=snapshot(),before=structuredClone(input),draft=baseDraft();
 draft.particulars.find(x=>x.en==='Number of Ordinary Shares').value='MANUALLY VERIFIED';
 const result=importCombinedRegisterSnapshot(draft,input,{
  secretaryOnly:true,shareholdingOnly:true
 });
 const doc=result.document;
 assert.equal(fieldValue(doc,'Number of Ordinary Shares'),'MANUALLY VERIFIED');
 assert.equal(fieldValue(doc,'Number of Preference Shares'),'50');
 assert.equal(fieldValue(doc,'Total Number of Issued Shares (all classes)'),'150');
 assert.equal(fieldValue(doc,'Ordinary Share Capital (recorded amount paid)'),'RM100,000.00');
 assert.equal(fieldValue(doc,'Preference Share Capital (recorded amount paid)'),'RM50,000.00');
 assert.equal(fieldValue(doc,'Currency'),'MYR');
 assert.equal(fieldValue(doc,'Secretary Name','COMPANY SECRETARY'),'SECRETARY A');
 assert.equal(fieldValue(doc,'Number of Shares Held','MEMBER 1'),'60');
 assert.equal(fieldValue(doc,'Class of Shares','MEMBER 2'),'Ordinary');
 assert.equal(fieldValue(doc,'Percentage of Own Share Class','MEMBER 1'),'60.00%');
 assert.equal(fieldValue(doc,'Percentage of Own Share Class','MEMBER 2'),'40.00%');
 assert.equal(fieldValue(doc,'Percentage of Own Share Class','MEMBER 3'),'100.00%');
 assert.equal(fieldValue(doc,'Full Name','DIRECTOR 1'),'');
 assert.equal(result.summary.records.members,3);
 assert.equal(fieldValue(draft,'Number of Preference Shares'),'','draft remains untouched');
 assert.deepEqual(input,before,'statutory source remains untouched');
 assert.equal(JSON.stringify(doc).includes('FORMER MEMBER'),false,'former holdings excluded');
});
test('does not guess capital or share-class percentage from ambiguous member holdings',()=>{
 const data=snapshot({
  companyFields:[],
  memberRecords:[
   {name:'A',id:'A',shares:'40',cls:'Ordinary'},
   {name:'B',id:'B',shares:'60',cls:''}
  ]
 });
 const {document:doc}=importCombinedRegisterSnapshot(baseDraft(),data,{
  secretaryOnly:true,shareholdingOnly:true
 });
 assert.equal(fieldValue(doc,'Total Number of Issued Shares (all classes)'),'100');
 assert.equal(fieldValue(doc,'Ordinary Share Capital (recorded amount paid)'),'');
 assert.equal(fieldValue(doc,'Percentage of Own Share Class','MEMBER 1'),'');
 assert.equal(fieldValue(doc,'Percentage of Own Share Class','MEMBER 2'),'');
 assert.equal(fieldValue(doc,'Number of Shares Held','MEMBER 1'),'40');
});
test('real auditor Master Listing prefill and statutory shareholding import combine without changing custom auditor',()=>{
 const d=baseDraft();
 d.particulars.find(x=>x.en==='Audit Firm Name').value='VERIFIED AUDITOR';
 const fromRegister=importCombinedRegisterSnapshot(d,snapshot(),{
  secretaryOnly:true,shareholdingOnly:true
 }).document;
 const fromMaster=prepopulateAuditorFromMasterListing(fromRegister,{
  name:'UNVERIFIED NAME',registrationNo:'AF1234',address:'IPOH'
 });
 assert.equal(fieldValue(fromMaster.document,'Audit Firm Name','AUDITOR'),'VERIFIED AUDITOR');
 assert.equal(fieldValue(fromMaster.document,'Audit Firm Registration No.','AUDITOR'),'AF1234');
 assert.equal(fieldValue(fromMaster.document,'Number of Shares Held','MEMBER 1'),'60');
});
