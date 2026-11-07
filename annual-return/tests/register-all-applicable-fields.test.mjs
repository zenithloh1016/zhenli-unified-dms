import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank} from '../src/core.js';
import {importCombinedRegisterSnapshot} from '../src/register-import.js';
const field=(label,value)=>({type:'field',label,value});
const group=title=>({type:'group',title});
const record=(title,status='Current')=>({type:'record',title,status});
const section=(title,blocks)=>({title,blocks});
function snapshot(){
 return {version:1,companyId:'c1',companyName:'EXAMPLE SDN BHD',
  registrationNo:'202601000001',sections:[
   section('Company Details',[
    field('Former Name','PREVIOUS SDN BHD'),field('Anniversary Date','01/07/2026'),
    field('Date of Incorporation','01/07/2019'),field('Registered Address','NO. 1 IPOH'),
    field('Business Address','NO. 2 IPOH'),field('Currency','MYR'),
    field('Classes of Shares Issued','Ordinary'),field('Paid Up Capital','100,000.00')]),
   section('Register of Directors',[group('Current'),record('D1'),
    field('Name','DIRECTOR A'),field('Identification No.','DIR123'),
    field('Date of Birth','1980-01-01'),field('Gender','Female'),
    field('Nationality / Race','Malaysian'),field('Service Address','IPOH SERVICE'),
    group('Former'),record('D0','Former'),field('Name','OLD DIRECTOR')]),
   section('Register of Members',[group('Current'),record('M1'),
    field('Folio No.','001'),field('Shareholder Name','PARENT SDN BHD'),
    field('Company Registration No.','202601000003'),field('Address','IPOH PARENT'),
    field('Country of Incorporation','Malaysia'),
    field('Current Number of Shares Held','60'),field('Class of Shares','Ordinary'),
    record('M2'),field('Folio No.','002'),field('Shareholder Name','MEMBER B'),
    field('Identification No.','MBR123'),field('ID Type','Passport'),
    field('Nationality/Origin','Thailand'),field('Gender','Female'),
    field('Current Number of Shares Held','40'),field('Class of Shares','Ordinary'),
    group('Former'),record('OLD MEMBER','Former'),field('Shareholder Name','OLD MEMBER'),
    field('Current Number of Shares Held','1000')]),
   section('Register of Beneficial Owners',[group('Current'),record('BO1'),
    field('Full Name','BENEFICIAL A'),field('Identification No.','BO123'),
    field('Ownership / Voting Rights (%)','60.00%'),field('Type of Ownership','Direct'),
    field('Criteria','Criteria A'),field('Business Occupation','Director')]),
   section('Register of Charges',[group('Current'),record('C1'),
    field('Registered No.','CHG123'),field('Date of Registration','01/02/2025'),
    field('Name of Chargee','EXAMPLE BANK'),field('Nature of Charge','DEBENTURE'),
    field('Current Outstanding Indebtedness','50,000'),
    group('Former'),record('C0','Former'),field('Registered No.','OLD CHG')]),
   section('Register of Secretaries',[group('Current'),record('S1'),
    field('Name','SECRETARY A'),field('Identification No.','SEC123'),
    field('Membership No.','MIA123'),field('SSM Practising Certificate No.','PC123'),
    field('Date of Birth','1970-01-01'),field('Gender','Female')])
  ]};
}
function val(d,key,head){
 const p=d.particulars;
 if(!head)return p.find(x=>x.type==='field'&&x.en===key)?.value;
 const i=p.findIndex(x=>x.type==='heading'&&x.en===head);
 if(i<0)return undefined;
 const tail=p.slice(i+1),end=tail.findIndex(x=>x.type!=='field');
 return (end<0?tail:tail.slice(0,end)).find(x=>x.type==='field'&&x.en===key)?.value;
}
test('all statutory sources populate current directors, secretaries, auditor-compatible data, members, BOs and active charges',()=>{
 const input=snapshot(),original=structuredClone(input),doc=cloneBlank();
 const {document,summary}=importCombinedRegisterSnapshot(doc,input);
 assert.equal(val(document,'Former Name'),'PREVIOUS SDN BHD');
 assert.equal(val(document,'Anniversary Date'),'01/07/2026');
 assert.equal(val(document,'Registered Office'),'NO. 1 IPOH');
 assert.equal(val(document,'Principal Place of Business'),'NO. 2 IPOH');
 assert.equal(val(document,'Total Number of Issued Shares (all classes)'),'100');
 assert.equal(val(document,'Number of Ordinary Shares'),'100');
 assert.equal(val(document,'Ordinary Share Capital (recorded amount paid)'),'100,000.00');
 assert.equal(val(document,'Full Name','DIRECTOR 1'),'DIRECTOR A');
 assert.equal(val(document,'NRIC / Passport No.','DIRECTOR 1'),'DIR123');
 assert.equal(val(document,'Service / Business Address','DIRECTOR 1'),'IPOH SERVICE');
 assert.equal(val(document,'Member Folio','MEMBER 1'),'001');
 assert.equal(val(document,'Corporate Name','MEMBER 1'),'PARENT SDN BHD');
 assert.equal(val(document,'Member Type','MEMBER 1'),'Body Corporate');
 assert.equal(val(document,'Individual Full Name','MEMBER 1'),'');
 assert.equal(val(document,'Company Registration No. (per Members Register)','MEMBER 1'),'202601000003');
 assert.equal(val(document,'Registered / Correspondence Address','MEMBER 1'),'IPOH PARENT');
 assert.equal(val(document,'Individual Full Name','MEMBER 2'),'MEMBER B');
 assert.equal(val(document,'Individual Gender','MEMBER 2'),'Female');
 assert.equal(val(document,'Individual Nationality / Citizenship','MEMBER 2'),'Thailand');
 assert.equal(val(document,'Percentage of Own Share Class','MEMBER 1'),'60.00%');
 assert.equal(val(document,'Percentage of Own Share Class','MEMBER 2'),'40.00%');
 assert.equal(val(document,'Full Name','BENEFICIAL OWNER 1'),'BENEFICIAL A');
 assert.equal(val(document,'Recorded Ownership / Voting Rights Percentage','BENEFICIAL OWNER 1'),'60.00%');
 assert.equal(val(document,'Type of Beneficial Ownership','BENEFICIAL OWNER 1'),'Direct');
 assert.equal(val(document,'Criteria of Beneficial Ownership','BENEFICIAL OWNER 1'),'Criteria A');
 assert.equal(val(document,'Registered No.','REGISTERED CHARGE 1'),'CHG123');
 assert.equal(val(document,'Current Outstanding Indebtedness','REGISTERED CHARGE 1'),'50,000');
 assert.equal(val(document,'Secretary Name','COMPANY SECRETARY'),'SECRETARY A');
 assert.equal(val(document,'Professional Membership','COMPANY SECRETARY'),'MIA123');
 assert.equal(val(document,'Practising Certificate Number','COMPANY SECRETARY'),'PC123');
 assert.equal(val(document,'Gender','COMPANY SECRETARY'),'Female');
 assert(summary.records.directors===1&&summary.records.members===2&&summary.records.bos===1);
 assert(!JSON.stringify(document).includes('OLD DIRECTOR'));
 assert(!JSON.stringify(document).includes('OLD MEMBER'));
 assert(!JSON.stringify(document).includes('OLD CHG'));
 assert.deepEqual(input,original);
});
test('a saved return for a different company cannot import any register particulars',()=>{
 const d=cloneBlank();
 d.company.name='OTHER SDN BHD';
 assert.throws(()=>importCombinedRegisterSnapshot(d,snapshot()),/does not match/i);
});
