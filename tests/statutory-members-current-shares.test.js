import test from 'node:test';
import assert from 'node:assert/strict';
import {
 registerLabel,normalizeRegisterName,isManagerRegister
} from '../src/statutory-register-review.js';
import {buildIndependentRegister} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {createRegisterBookTab} from '../src/register-book-tab.js';
import {makeRegisterBook,sanitizeSheet} from '../src/statutory-register-data.js';

function memberRows(){
 const rows=Array.from({length:20},()=>[]);
 rows[1]=['Company Name:','SAMPLE SDN BHD'];
 rows[6]=[,,,,,,,,,,,,'Folio No.:','1'];
 rows[8]=['Name:','MEMBER ALPHA',,,,,'Date of Birth:','01/01/1980'];
 rows[9]=['ID Type:','NRIC',,,,,'Nationality/Origin:','MALAYSIA'];
 rows[10]=['Identification No.:','TEST-ID-0001',,,,,'Race:','CHINESE'];
 rows[11]=['Occupation:','DIRECTOR',,,,,'Email Address:','member@example.test'];
 rows[12]=['Address:','NO. 1 SAMPLE ROAD',,,,,'Date Entered as A Member:','01/01/2020'];
 rows[13]=['','IPO, PERAK',,,,,'Date Ceased to be A Member:','-'];
 rows[14]=[,,,,,,'Total Shares Held:','250'];
 rows[17]=['SHARES ACQUIRED',,,,,,,'SHARES TRANSFERRED'];
 rows[18]=['Date','No. Of Share Certificate','Allotment or Transfer No.','Folio','Class of Shares','No. of Shares','Consideration',
   'Date','Transfer No.','Folio','Class of Shares','No. of Shares','Consideration','Balance of Shares'];
 rows[19]=['01/01/2020','-','A1','1','Ordinary','300','300',
   '01/02/2021','T1','2','Ordinary','50','50','250'];
 return rows;
}
const company={
 companyName:'SAMPLE SDN BHD',registrationNo:'202601111111',
 sheets:[
  {name:'Master',rows:[['Company Name:','SAMPLE SDN BHD']]},
  {name:'Register of Directors',rows:[['Name','NRIC No.','Date of Appointment'],['DIRECTOR A','TEST-ID','01/01/2025']]},
  {name:'Register of Members 001',rows:memberRows()},
  {name:'Register of Managers',rows:[['Name','Date'],['MANAGER A','01/01/2019']]},
  {name:'Register of BO',rows:[['Full Name','NRIC No.','Criteria of BO'],['BO A','TEST','Criteria A']]},
  {name:'Register of Charge',rows:[['Chargee','Creation Date','Amount'],['BANK A','01/01/2026','RM500']]},
  {name:'Register of Transfer',rows:[['Name','Date','Shares'],['TRANSFER A','01/01/2026','100']]}
 ]
};
test('all statutory registers use the full Register of prefix and Managers are excluded',()=>{
 assert.equal(registerLabel('Register of Directors'),'Register of Directors');
 assert.equal(registerLabel('Register of Members 001'),'Register of Members');
 assert.equal(registerLabel('Register of BO'),'Register of Beneficial Owners');
 assert.equal(registerLabel('Register of Charge'),'Register of Charges');
 assert.equal(registerLabel('Register of Transfer'),'Register of Transfers');
 assert.equal(normalizeRegisterName('Charges'),'Register of Charges');
 assert.equal(normalizeRegisterName('register of BO'),'Register of Beneficial Owners');
 assert.equal(isManagerRegister('Register of Managers'),true);
 assert.throws(()=>normalizeRegisterName('Managers'),/Managers is excluded/);
 assert.throws(()=>buildIndependentRegister(company,3),/Managers is not shown/);
});
test('member folios show only identity/contact particulars and current shares held',()=>{
 const register=buildIndependentRegister(company,2);
 assert.equal(register.title,'Register of Members');
 const labels=register.blocks.filter(b=>b.type==='field').map(b=>b.label);
 assert.deepEqual(labels,['Shareholder Name','Current Number of Shares Held']);
 assert(!labels.includes('Date Entered as A Member'));
 assert(!labels.includes('Date Ceased to be A Member'));
 assert(!labels.includes('Class of Shares'));
 assert(!labels.includes('Balance of Shares'));
 assert.equal(register.blocks.filter(b=>b.type==='record').length,1);
 const shares=register.blocks.find(b=>b.label==='Current Number of Shares Held');
 assert.equal(shares.value,'250');
 assert.equal(shares.row,14);
 assert.equal(shares.col,7);
 const html=renderStatutoryRegisterDocument(company,2);
 assert.match(html,/Register of Members/);
 assert.match(html,/Current Number of Shares Held/);
 assert.match(html,/>250<\/textarea>/);
 assert(!html.includes('Share acquisition and transfer history'));
 assert(!html.includes('SHARES ACQUIRED'));
 assert(!html.includes('SHARES TRANSFERRED'));
 assert(!html.includes('Date Ceased to be A Member'));
 assert.equal(company.sheets[2].rows[14][7],'250');
 assert.equal(company.sheets[2].rows[19][13],'250');
});
test('if Total Shares Held is missing, use the last recorded share balance only',()=>{
 const testBook=structuredClone(company);
 testBook.sheets[2].rows[14][7]='';
 const section=buildIndependentRegister(testBook,2);
 const shares=section.blocks.find(b=>b.label==='Current Number of Shares Held');
 assert.equal(shares.value,'250');
 assert.equal(shares.row,19);
 assert.equal(shares.col,13);
 assert(section.blocks.every(b=>b.type!=='field'||!/^Date$/.test(b.label)));
});
test('Managers tab is hidden in the DMS; source data retained and other registers selectable',async()=>{
 const base=makeRegisterBook({id:'c1',name:'SAMPLE SDN BHD',registration_no:'202601111111'},{
  path:'Register Book_SAMPLE SDN BHD.xlsx',sheets:company.sheets.map(s=>sanitizeSheet(s.name,s.rows))
 });
 const storage={
  download:async()=>({data:new Blob([JSON.stringify(base)]),error:null}),
  list:async()=>({data:[],error:null})
 };
 const db={storage:{from:()=>storage},from(){
  const q={select(){return q;},eq(){return q;},is(){return q;},ilike(){return q;},
   order(){return q;},limit:async()=>({data:[],error:null})};
  return q;
 }};
 const tab=createRegisterBookTab({db,getUser:()=>({id:'u1'}),getCompanies:()=>[
  {id:'c1',name:'SAMPLE SDN BHD',registration_no:'202601111111'}
 ]});
 await tab.openCompany('c1');
 const html=tab.render();
 assert(!html.includes('Register of Managers'));
 assert(html.includes('Register of Members'));
 assert(html.includes('Register of Beneficial Owners'));
 assert(html.includes('Register of Charges'));
 assert(html.includes('Register of Transfers'));
 assert.equal(tab.state.book.sheets[3].name,'Register of Managers');
 tab.command('sr-sheet','3');
 assert.notEqual(tab.state.sheetIndex,3);
 tab.command('sr-sheet','2');
 assert.equal(tab.state.sheetIndex,2);
 assert.match(tab.render(),/Current Number of Shares Held/);
});
