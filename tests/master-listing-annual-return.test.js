import test from 'node:test';
import assert from 'node:assert/strict';
import {annualReturnParticularsFromMasterListing,matchedAnnualReturnListingRow} from '../src/master-listing-annual-return.js';

const headers=['Company Name','Company Registration No.','Former Name','Date of Incorporation',
 'Registered Address','Business Address','Nature of Business','MSIC Code 1','MSIC Code 2',
 'Share Classes Issued','Number of Ordinary Shares','Ordinary Share Capital',
 'Current Directors','Current Members','Current Beneficial Owners',
 'Company Secretary','Secretary NRIC','Secretary PC No','Secretary Membership No.',
 'Annual Return Year','Anniversary Date','Registered Office Fee',
 'Auditors','Audit Firm Address','Bank Account No.','FYE'];
const rows=[
 ['EXAMPLE SDN BHD','202601000001','OLD EXAMPLE SDN BHD','2020-01-01',
  'NO 1 IPOH','NO 2 IPOH','Construction','41001','41002','Ordinary',
  '100,000','RM 100,000.00','DIRECTOR A; DIRECTOR B','MEMBER A; HOLDING SDN BHD',
  'BO A','SECRETARY A','NRIC 111','PC1234','MIA 456','2026','01.01.2026',
  'RM 200','EXAMPLE & CO','NO 3 IPOH','SECRET BANK DATA','31/12/2026'],
 ['ANOTHER SDN BHD','202601000002','', '', '', '', '', '', '', '', '', '',
  'OTHER DIRECTOR','','','','','','','','','','','','','']
];
const model={version:1,nameColumn:0,registrationColumn:1,
 columns:headers.map((label,i)=>({id:'c'+i,label})),
 rows:rows.map((values,i)=>({id:'r'+i,values}))};
const company={name:'EXAMPLE SDN BHD',registrationNo:'202601000001'};
test('all matching Annual Return company, capital, activity, current person and secretary data is selected',()=>{
 const input=structuredClone(model),data=annualReturnParticularsFromMasterListing(input,company);
 assert.equal(data.fields['Company Name'],'EXAMPLE SDN BHD');
 assert.equal(data.fields['Company Registration No.'],'202601000001');
 assert.equal(data.fields['Former Name'],'OLD EXAMPLE SDN BHD');
 assert.equal(data.fields['Date of Incorporation'],'2020-01-01');
 assert.equal(data.fields['Registered Office'],'NO 1 IPOH');
 assert.equal(data.fields['Principal Place of Business'],'NO 2 IPOH');
 assert.equal(data.fields['Annual Return Year'],'2026');
 assert.equal(data.fields['Anniversary Date'],'01.01.2026');
 assert.equal(data.fields['Number of Ordinary Shares'],'100,000');
 assert.equal(data.fields['Ordinary Share Capital (recorded amount paid)'],'RM 100,000.00');
 assert.equal(data.fields['Nature of Business / MSIC Code'],'Construction\n41001 — \n41002 — ');
 assert.deepEqual(data.msicCodes,['41001','41002']);
 assert.deepEqual(data.people.directors,['DIRECTOR A','DIRECTOR B']);
 assert.deepEqual(data.people.members,['MEMBER A','HOLDING SDN BHD']);
 assert.deepEqual(data.people.bos,['BO A']);
 assert.equal(data.secretary['Secretary Name'],'SECRETARY A');
 assert.equal(data.secretary['Secretary NRIC'],'NRIC 111');
 assert.equal(data.secretary['Practising Certificate Number'],'PC1234');
 assert.equal(data.secretary['Professional Membership'],'MIA 456');
 assert(!JSON.stringify(data).includes('SECRET BANK DATA'));
 assert(!JSON.stringify(data).includes('RM 200'));
 assert(!JSON.stringify(data).includes('31/12/2026'));
 assert.deepEqual(model,input,'read-only source');
});
test('reject wrong registered company and ambiguous duplicate rows',()=>{
 assert.equal(matchedAnnualReturnListingRow(model,{name:company.name,registrationNo:'202601000003'}),null);
 assert.equal(annualReturnParticularsFromMasterListing(model,{name:'UNKNOWN SDN BHD'}),null);
 const repeated=structuredClone(model);repeated.rows.push({...repeated.rows[0],id:'duplicate'});
 assert.equal(annualReturnParticularsFromMasterListing(repeated,company),null);
});
test('no general paid-up capital allocation when share class is mixed or unspecified',()=>{
 const other=structuredClone(model);
 other.rows[0].values[9]='Ordinary & Preference';
 other.columns.push({id:'paid',label:'Total Paid Up Capital'});
 for(const row of other.rows)row.values.push('300,000');
 const data=annualReturnParticularsFromMasterListing(other,company);
 assert.equal(data.fields['Ordinary Share Capital (recorded amount paid)'],'RM 100,000.00');
 assert.equal(data.fields['Preference Share Capital (recorded amount paid)'],undefined);
});
test('multiple secretary names cannot be silently reduced to one officer',()=>{
 const other=structuredClone(model);other.rows[0].values[15]='SECRETARY A; SECRETARY B';
 const data=annualReturnParticularsFromMasterListing(other,company);
 assert.equal(data.secretary['Secretary Name'],'');
 assert.equal(data.secretary['Secretary NRIC'],'');
});

test('a renamed Documents company still matches its uniquely registered Master Listing row',()=>{
 const old=structuredClone(model);
 old.rows[0].values[0]='BEFORE NAME CHANGE SDN BHD';
 old.columns[2].label='Former Company Name (If Any)';
 const current={name:'EXAMPLE SDN BHD',registrationNo:'202601000001'};
 const match=matchedAnnualReturnListingRow(old,current);
 assert.equal(match?.id,'r0');
 const data=annualReturnParticularsFromMasterListing(old,current);
 assert.equal(data.fields['Company Name'],'EXAMPLE SDN BHD');
 assert.equal(data.fields['Former Name'],'OLD EXAMPLE SDN BHD');
});
test('a registration match must be unique; never mix two companies with the same SSM number',()=>{
 const duplicate=structuredClone(model);
 duplicate.rows.push({id:'r3',values:[...duplicate.rows[0].values]});
 duplicate.rows.at(-1).values[0]='OLDER NAME SDN BHD';
 assert.equal(matchedAnnualReturnListingRow(duplicate,company),null);
});
test('older Master Listing labels for FKA and Previous Name (If Any) are recognised',()=>{
 for(const label of ['Former Name (If Any)','Previous Company Name (If Any)',
  'Company Formerly Known As','F.K.A.']){
  const book=structuredClone(model);
  book.columns[2].label=label;
  const fields=annualReturnParticularsFromMasterListing(book,company)?.fields||{};
  assert.equal(fields['Former Name'],'OLD EXAMPLE SDN BHD',label);
 }
});
