import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank} from '../src/core.js';
import {importCombinedRegisterSnapshot} from '../src/register-import.js';
const field=(label,value)=>({type:'field',label,value});
const record=(title,status)=>({type:'record',title,status});
const group=title=>({type:'group',title});
const source={
 version:1,companyId:'c1',companyName:'EXAMPLE SDN BHD',registrationNo:'202601000001',
 sections:[
  {title:'Company Details',blocks:[field('Registered Address','22, JALAN MERU, IPOH'),
   field('Business Address','IPOH BUSINESS ADDRESS'),field('Date of Incorporation','43803'),
   field('Nature of Business','Construction services')]},
  {title:'Register of Directors',blocks:[
   group('Current / Active'),record('CURRENT DIRECTOR','Current / Active'),
   field('Director Name','DIRECTOR CURRENT'),field('IC No. / Passport No.','111111-08-1111'),
   field('Date of Birth','30094'),field('Gender','MALE'),field('Residential Address','IPOH ADDRESS'),
   group('Former / Ceased (History)'),record('FORMER DIRECTOR','Former / Ceased'),
   field('Director Name','FORMER DIRECTOR'),field('IC No. / Passport No.','222222-08-2222')]},
  {title:'Register of Members',blocks:[
   group('Current Members'),record('CURRENT MEMBER','Current'),
   field('Shareholder Name','CURRENT MEMBER'),field('Identification No.','333333-08-3333'),
   field('ID Type','NRIC'),field('Date of Birth','01/01/1980'),
   field('Nationality/Origin','Malaysian'),field('Address','IPOH MEMBER ADDRESS'),
   field('Current Number of Shares Held','100,000'),
   {type:'metric',label:'Percentage of Recorded Current Holdings',value:'100.00%'},
   group('Former Members (History)'),record('FORMER MEMBER','Former / Ceased'),
   field('Shareholder Name','FORMER MEMBER'),field('Last Recorded Number of Shares Held','0')]},
  {title:'Register of Charges',blocks:[
   group('Current / Active'),record('ACTIVE CHARGE','Current / Active'),
   field('Registered No.','CHG001'),field('Name of Chargee','BANK ABC'),
   field('Date of Registration','45000'),field('Nature of Charge','DEBENTURE'),
   field('Date of Discharge',''),
   group('Discharged / Former (History)'),record('FORMER CHARGE','Discharged / Former'),
   field('Registered No.','CHG002'),field('Name of Chargee','BANK OLD'),
   field('Date of Discharge','46000')]},
  {title:'Register of Beneficial Owners',blocks:[
   group('Current / Active'),record('BO CURRENT','Current / Active'),
   field('Full Name','BO CURRENT'),field('NRIC No.','444444-08-4444'),
   field('Type of Beneficial Ownership','Direct'),
   field('Criteria of Beneficial Ownership','Criteria A')]},
  {title:'Register of Secretaries',blocks:[group('Current / Active'),
   record('SECRETARY CURRENT','Current / Active'),
   field('Name','SECRETARY CURRENT'),field('NRIC No.','555555-08-5555')]}
 ]
};
function value(doc,label){return doc.particulars.find(f=>f.type==='field'&&f.en===label)?.value;}
test('imports real combined statutory particulars into bilingual Annual Return safely',()=>{
 const blank=cloneBlank();const before=structuredClone(source);
 const {document:d,summary}=importCombinedRegisterSnapshot(blank,source);
 assert.equal(value(d,'Company Name'),'EXAMPLE SDN BHD');
 assert.equal(value(d,'Company Registration No.'),'202601000001');
 assert.equal(value(d,'Registered Office'),'22, JALAN MERU, IPOH');
 assert.equal(value(d,'Principal Place of Business'),'IPOH BUSINESS ADDRESS');
 assert.equal(value(d,'Date of Incorporation'),'04/12/2019');
 assert.equal(value(d,'Number of Registered Charges'),undefined);
 assert.equal(summary.records.charges,1);
 assert.equal(value(d,'Secretary Name'),'SECRETARY CURRENT');
 assert.equal(value(d,'Secretary NRIC'),'555555-08-5555');
 assert.equal(d.particulars.find((p,i)=>p.type==='heading'&&p.en==='DIRECTOR 1').en,'DIRECTOR 1');
 assert.equal(value(d,'Number of Shares Held'),'100,000');
 assert.equal(value(d,'Member Type'),'Individual');
 assert.equal(value(d,'Criteria of Beneficial Ownership'),'Criteria A');
 assert.equal(value(d,'Total Number of Issued Shares (all classes)'),'');
 assert.equal(value(d,'Percentage of Own Share Class'),'');
 assert(!d.particulars.some(p=>p.type==='field'&&p.value==='FORMER DIRECTOR'));
 assert(!d.particulars.some(p=>p.type==='field'&&p.value==='FORMER MEMBER'));
 assert(!d.particulars.some(p=>p.type==='field'&&p.value==='BANK OLD'));
 assert(summary.filled>=15);
 assert.deepEqual(source,before,'import may not mutate saved source');
});
test('matches extra directors, members and BO records by cloned blocks without deleting template records',()=>{
 const expanded=structuredClone(source);
 for(let n=2;n<=6;n++){
  expanded.sections[1].blocks.push(group('Current / Active'),record('DIRECTOR '+n,'Current / Active'),
   field('Director Name','DIRECTOR '+n),field('IC No. / Passport No.','ID'+n));
 }
 for(let n=2;n<=4;n++)expanded.sections[2].blocks.splice(10,0,
  record('MEMBER '+n,'Current'),field('Shareholder Name','MEMBER '+n),
  field('Current Number of Shares Held','100'));
 for(let n=2;n<=3;n++)expanded.sections[4].blocks.push(record('BO '+n,'Current / Active'),
  field('Full Name','BO '+n));
 const {document:doc,summary}=importCombinedRegisterSnapshot(cloneBlank(),expanded);
 assert(doc.particulars.some(p=>p.type==='heading'&&p.en==='DIRECTOR 6'));
 assert(doc.particulars.some(p=>p.type==='heading'&&p.en==='MEMBER 4'));
 assert(doc.particulars.some(p=>p.type==='heading'&&p.en==='BENEFICIAL OWNER 3'));
 assert.equal(summary.records.directors,6);
 assert.equal(summary.records.members,4);
 assert.equal(summary.records.bos,3);
});
test('keeps nonblank Annual Return drafts and rejects cross-company register import',()=>{
 const draft=cloneBlank();draft.company.name='EXAMPLE SDN BHD';draft.company.no='202601000001';
 draft.particulars.find(p=>p.en==='Registered Office').value='OWN CONFIRMED ADDRESS';
 const original=structuredClone(draft);
 const output=importCombinedRegisterSnapshot(draft,source);
 assert.equal(value(output.document,'Registered Office'),'OWN CONFIRMED ADDRESS');
 assert.deepEqual(draft,original);
 const other=structuredClone(source);other.companyName='UNRELATED SDN BHD';
 assert.throws(()=>importCombinedRegisterSnapshot(draft,other),/does not match/);
});
test('invalid combined snapshots do not change Annual Return',()=>{
 const draft=cloneBlank(),before=JSON.stringify(draft);
 assert.throws(()=>importCombinedRegisterSnapshot(draft,{version:0,sections:[]}),/Invalid combined/);
 assert.equal(JSON.stringify(draft),before);
});

test('pre-populates all secretary-specific fields without touching directors or existing draft values',()=>{
 const snapshot=structuredClone(source);
 snapshot.sections.find(x=>x.title==='Register of Secretaries').blocks=[
  group('Current'),record('SECRETARY CURRENT','Current'),
  field('Name','SECRETARY CURRENT'),field('Identification No.','555555-08-5555'),
  field('SSM Practicing Certificate No.','PC 2026-001'),
  field('Membership No.','MAICSA 88888'),
  field('Date of Birth','16/05/1978'),field('Gender','FEMALE'),
  field('Nationality / Race','MALAYSIAN'),field('Residential Address','IPOH'),
  field('Service Address','KL SERVICE ADDRESS')
 ];
 const input=cloneBlank();
 input.company.name='EXAMPLE SDN BHD';input.company.no='202601000001';
 const heading=input.particulars.findIndex(x=>x.en==='COMPANY SECRETARY');
 const fields=()=>input.particulars.slice(heading+1,input.particulars.findIndex((x,i)=>i>heading&&x.type==='heading'));
 fields().find(x=>x.en==='Gender').value='CONFIRMED GENDER';
 const {document:doc,summary}=importCombinedRegisterSnapshot(input,snapshot,{secretaryOnly:true});
 const secretary=doc.particulars.slice(heading+1,doc.particulars.findIndex((x,i)=>i>heading&&x.type==='heading'));
 const at=label=>secretary.find(x=>x.en===label)?.value;
 assert.equal(at('Secretary Name'),'SECRETARY CURRENT');
 assert.equal(at('Secretary NRIC'),'555555-08-5555');
 assert.equal(at('Practising Certificate Number'),'PC 2026-001');
 assert.equal(at('Professional Membership'),'MAICSA 88888');
 assert.equal(at('Date of Birth'),'16/05/1978');
 assert.equal(at('Gender'),'CONFIRMED GENDER');
 assert.equal(at('Nationality / Race'),'MALAYSIAN');
 assert.equal(at('Secretary Residential Address'),'IPOH');
 assert.equal(at('Service / Business Address'),'KL SERVICE ADDRESS');
 assert.equal(doc.particulars.find(x=>x.en==='Date of Birth')?.value||'','',
  'director date of birth must not be overwritten');
 assert.equal(value(doc,'Registered Office'),'','secretary-only update must not change other fields');
 assert.equal(summary.kept,1);
 assert.ok(summary.filled>=7);
 assert.equal(input.particulars.slice(heading+1).find(x=>x.en==='Secretary Name').value,'',
  'the existing draft must not be mutated');
});
test('former secretary appointments cannot prepopulate a current annual return',()=>{
 const snapshot=structuredClone(source);
 snapshot.sections.find(x=>x.title==='Register of Secretaries').blocks=[
  group('Former'),record('FORMER SECRETARY','Former'),
  field('Name','FORMER SECRETARY'),field('Identification No.','111111-00-1111')
 ];
 const input=cloneBlank();input.company.name='EXAMPLE SDN BHD';input.company.no='202601000001';
 const {document:doc,summary}=importCombinedRegisterSnapshot(input,snapshot,{secretaryOnly:true});
 assert.equal(value(doc,'Secretary Name'),'');
 assert.equal(summary.filled,0);
});
