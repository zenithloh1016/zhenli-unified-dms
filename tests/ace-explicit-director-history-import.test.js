import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook,sanitizeSheet} from '../src/statutory-register-data.js';
import {describeStatutorySheet,latestRegisterRecords} from '../src/statutory-register-review.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';

test('explicit Former status survives a blank/placeholder cessation date on an imported director record',()=>{
 const company={id:'ace',name:'ACE ALLIANCE HOLDINGS SDN. BHD.',registration_no:'201901032897'};
 const sheet=sanitizeSheet('Register of Directors',[
  ['Director Name','IC No. / Passport No.','Date of Appointment','Date of Cessation','Status'],
  ['CHANG AI NEE','TEST-A','43721','-','Former — verify effective date'],
  ["DATO' CHOONG CHEE MENG",'TEST-B','43721','-','Former — verify effective date'],
  ['DIONG SIAO LING','TEST-C','46126','-','Current — per archived register'],
  ['PEY BIING KUEN','TEST-D','46126','-','Current — per archived register']
 ]);
 const desc=describeStatutorySheet(sheet);
 assert.deepEqual(desc.records.map(x=>x.status),['former','former','current','current']);
 const book=makeRegisterBook(company,{path:'Register Book_ACE ALLIANCE HOLDINGS SDN. BHD.xlsx',sheets:[sheet]});
 const layout=buildGroupedRegister(book,0);
 assert.deepEqual(layout.blocks.filter(x=>x.type==='group').map(x=>x.title),['Current','Former']);
 assert.deepEqual(layout.blocks.filter(x=>x.type==='record'&&x.status==='Former').map(x=>x.title),
  ['CHANG AI NEE',"DATO' CHOONG CHEE MENG"]);
 assert.deepEqual(layout.blocks.filter(x=>x.type==='record'&&x.status==='Current').map(x=>x.title),
  ['DIONG SIAO LING','PEY BIING KUEN']);
 // The explicit Former status is not an invented legal date of cessation.
 assert.equal(book.sheets[0].rows[1][3],'-');
});
test('restored ACE director import supersedes older Current classification without deleting source',()=>{
 const company={id:'ace',name:'ACE ALLIANCE HOLDINGS SDN. BHD.',registration_no:'201901032897'};
 const old=sanitizeSheet('Register of Directors',[
  ['Director Name','IC No. / Passport No.','Date of Appointment','Date of Cessation'],
  ['CHANG AI NEE','TEST-A','43721','-'],
  ["DATO' CHOONG CHEE MENG",'TEST-B','43721','-']
 ]);
 const latest=sanitizeSheet('Register of Directors (Imported 2026-10-22)',[
  ['Director Name','IC No. / Passport No.','Date of Appointment','Date of Cessation','Status'],
  ['CHANG AI NEE','TEST-A','43721','-','Former — verify effective date'],
  ["DATO' CHOONG CHEE MENG",'TEST-B','43721','-','Former — verify effective date']
 ]);
 const book=makeRegisterBook(company,{path:'Register Book_ACE ALLIANCE HOLDINGS SDN. BHD.xlsx',sheets:[old,latest]});
 const merged=latestRegisterRecords(book,[0,1]);
 assert.equal(merged.length,2);
 assert(merged.every(x=>x.status==='former'&&x.sourceSheetIndex===1));
 assert.equal(book.sheets[0].rows[1][3],'-','source data is preserved');
});
