import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank} from '../src/core.js';
import {parseRegisterBookText,applyRegisterBookImport} from '../src/register-book.js';

const example=[
'Company Name: EXAMPLE HOLDINGS SDN. BHD.',
'Company No.: 202401000001 (1234567-X)',
'Date of Incorporation: 01/02/2024',
'Registered Office: NO. 1, TEST ROAD',
'30000 IPOH, PERAK',
'REGISTER OF DIRECTORS PURSUANT TO SECTION 57',
'Director Name Date of Birth IC No. / Passport No. Date of Appointment Date of Cessation',
'ALICE TAN 01/01/1980 800101-08-1234 - FEMALE 01/02/2024 -',
'FORMER DIRECTOR 02/02/1975 750202-08-9876 - MALE 01/02/2024 01/02/2025',
'REGISTER OF MEMBERS PURSUANT TO SECTION 50',
'Folio No.: 001',
'Name: ALICE TAN Date of Birth: 01/01/1980',
'ID Type: NRIC Nationality/Origin: MALAYSIAN',
'Identification No.: 800101-08-1234 Race: CHINESE',
'Date Ceased to be A Member: - Total Shares Held: 120',
'Ordinary',
'REGISTER OF MEMBERS PURSUANT TO SECTION 50',
'Folio No.: 002',
'Name: BOB LIM Date of Birth: 02/02/1982',
'ID Type: NRIC Nationality/Origin: MALAYSIAN',
'Identification No.: 820202-08-5678 Race: CHINESE',
'Date Ceased to be A Member: - Total Shares Held: 80',
'Ordinary',
'REGISTER OF MEMBERS PURSUANT TO SECTION 50',
'Folio No.: 003',
'Name: FORMER MEMBER Date of Birth: 02/02/1975',
'ID Type: NRIC Nationality/Origin: MALAYSIAN',
'Identification No.: 750202-08-9876 Race: CHINESE',
'Date Ceased to be A Member: 01/04/2025 Total Shares Held: 0',
'REGISTER OF ALLOTMENT PURSUANT TO SECTION 77',
'REGISTER OF SECRETARIES PURSUANT TO SECTION 57',
'SECRETARY LIM (MIA12345) 700101-08-1111 01/01/1970 MALAYSIAN COMPANY SECRETARY 01/02/2024 -',
'REGISTER OF BENEFICIAL OWNERS (BO) PURSUANT TO SECTION 60B',
'Full Name NRIC No. Date of Birth Nationality Residential Address',
'ALICE TAN 800101-08-1234 01/01/1980 MALAYSIAN 60.0000 DIRECT OWNERSHIP CRITERIA A CRITERIA B Date ceased: -',
'BOB LIM 820202-08-5678 02/02/1982 MALAYSIAN 40.0000 DIRECT OWNERSHIP CRITERIA A Date ceased: -'
].join('\n');
test('parse repeated register headings, current directors and current members',()=>{
 const p=parseRegisterBookText(example);
 assert.equal(p.company.name,'EXAMPLE HOLDINGS SDN. BHD.');
 assert.equal(p.directors.length,1);
 assert.equal(p.members.length,2);
 assert.equal(p.members[1].folio,'002');
 assert.equal(p.members[0].shares,'120');
 assert.equal(p.beneficialOwners.length,2);
 assert.equal(p.beneficialOwners[0].name,'ALICE TAN');
 assert.equal(p.secretaries.length,1);
});
test('fill matching review fields without inventing Annual Return year',()=>{
 const blank=cloneBlank(),p=parseRegisterBookText(example);
 const stats=applyRegisterBookImport(blank,p);
 assert.ok(stats.filled>=20);
 assert.equal(blank.company.name,'EXAMPLE HOLDINGS SDN. BHD.');
 assert.equal(blank.company.no,'202401000001 (1234567-X)');
 assert.equal(blank.company.arYear,'2026');
 assert.ok(blank.particulars.some(x=>x.en==='Number of Shares Held'&&x.value==='80'));
 assert.ok(blank.particulars.some(x=>x.en==='Criteria of Beneficial Ownership'&&x.value.includes('Criteria B')));
});
test('preserves verified fields and rejects a different company',()=>{
 const doc=cloneBlank(),p=parseRegisterBookText(example);
 const name=doc.particulars.find(x=>x.en==='Company Name');name.value=p.company.name;doc.company.name=name.value;
 const office=doc.particulars.find(x=>x.en==='Registered Office');office.value='VERIFIED OFFICE';
 const first=applyRegisterBookImport(doc,p);
 assert.ok(first.filled>0);assert.equal(office.value,'VERIFIED OFFICE');
 const again=applyRegisterBookImport(doc,p);
 assert.equal(again.filled,0);
 const other=cloneBlank();other.company.name='WRONG COMPANY SDN BHD';
 assert.throws(()=>applyRegisterBookImport(other,p),/does not match/i);
});
