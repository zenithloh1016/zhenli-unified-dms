import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {ensureReferenceParticulars,latestRegisterRecords} from '../src/statutory-register-review.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {
 extractBoCessationDate,isLegacyBoCombinedDateField
} from '../src/statutory-register-reference.js';

const company={id:'bo-cessation-test',name:'TEST SDN BHD',registration_no:'202601234567'};
const combined='Date a Person Becomes / Cease to Become BO';
const heading=['Name of Beneficial Owner','NRIC No.',combined,'Criteria','Cessation Date'];
function from(rows,name='Register of Beneficial Owners'){
 return makeRegisterBook(company,{path:'Register Book.xlsx',sheets:[
  {name,rows:[heading.slice(),...rows.map(row=>row.slice())]}
 ]});
}
const blocks=book=>buildGroupedRegister(book,0,{showBlanks:true}).blocks;
const bo=(book,name)=>blocks(book).find(b=>b.type==='record'&&b.title===name);
const field=(book,label)=>blocks(book).filter(b=>b.type==='field'&&b.label===label);

test('legacy combined BO date recognises only valid explicitly labelled cessation',()=>{
 assert.equal(isLegacyBoCombinedDateField(combined),true);
 assert.equal(isLegacyBoCombinedDateField('Date a Person Becomes / Ceased to Become BO'),true);
 for(const [value,expected] of [
  ['Date becoming BO: 06/06/2025\n-\nDate ceasing BO: 01/08/2025','01/08/2025'],
  ['Date becoming BO: 06/06/2025\\nDate ceasing BO: 01/08/2025','01/08/2025'],
  ['Date ceased: 02/11/2026','02/11/2026'],
  ['Cessation Date: 02/11/2026','02/11/2026'],
  ['Date a Person Ceases to be BO: 02/11/2026','02/11/2026'],
  ['Date becoming BO: 06/06/2025\nDate ceasing BO: -',''],
  ['Date becoming BO: 06/06/2025',''],
  ['06/06/2025',''],
  ['Date ceasing BO: 31/02/2025',''],
  ['Date ceasing BO: 01/08/2025\nDate ceased: 02/08/2025','']
 ])assert.equal(extractBoCessationDate(value),expected,value);
});
test('saved BO source with combined ceased date immediately appears Former even before migration',()=>{
 const b=from([
  ['BO CEASED','S100','Date becoming BO: 06/06/2025\nDate ceasing BO: 01/08/2025','A',''],
  ['BO CURRENT','S101','Date becoming BO: 06/06/2025\nDate ceasing BO: -','A','']
 ]);
 b.recordStatuses={'0:1':'current'}; // stale older manual flag
 assert.equal(bo(b,'BO CEASED')?.status,'Former');
 assert.equal(bo(b,'BO CURRENT')?.status,'Current');
});
test('existing Excel BO register backfills separate Cessation Date while preserving source column',()=>{
 const b=from([
  ['BO CEASED','S100','Date becoming BO: 06/06/2025\nDate ceasing BO: 01/08/2025','A',''],
  ['BO CURRENT','S101','Date becoming BO: 01/05/2024\nDate ceasing BO: -','A',''],
  ['BO ALREADY CEASED','S102','Date becoming BO: 01/01/2010\nDate ceasing BO: 01/08/2025','A','03/04/2026']
 ]);
 const original=structuredClone(b.sheets[0].rows);
 assert.equal(ensureReferenceParticulars(b),true);
 assert.equal(b.sheets[0].rows[1][4],'01/08/2025');
 assert.equal(b.sheets[0].rows[2][4],'');
 assert.equal(b.sheets[0].rows[3][4],'03/04/2026','an existing cessation value wins');
 assert.deepEqual(b.sheets[0].rows.slice(1).map(x=>x[2]),original.slice(1).map(x=>x[2]),
  'legacy source cells are preserved');
 assert.equal(bo(b,'BO CEASED')?.status,'Former');
 assert.equal(bo(b,'BO ALREADY CEASED')?.status,'Former');
 assert.equal(bo(b,'BO CURRENT')?.status,'Current');
 assert(field(b,'Cessation Date').some(x=>x.value==='01/08/2025'));
 assert.equal(ensureReferenceParticulars(b),false,'migration is idempotent');
 const html=renderStatutoryRegisterDocument(b,0,{showBlanks:true});
 assert(html.includes('Former'));
 assert(html.includes('01/08/2025'));
 assert(!html.includes('Date ceasing BO:'));
});
test('BO Date Ceased as BO column and Name of BO headings classify correctly',()=>{
 const b=makeRegisterBook(company,{path:'BO.xlsx',sheets:[
  {name:'Register of BO',rows:[
   ['Name of BO','NRIC No.','Date Ceased as BO'],
   ['FORMER BO','S101','02/11/2026'],
   ['ACTIVE BO','S102','']
  ]}
 ]});
 assert.equal(bo(b,'FORMER BO')?.status,'Former');
 assert.equal(bo(b,'ACTIVE BO')?.status,'Current');
});
test('newer blank BO snapshot does not erase earlier cessation for the same appointment',()=>{
 const first=from([['BO X','S100','Date becoming BO: 01/01/2024\nDate ceasing BO: 01/06/2025','A','']]);
 const newer=from([['BO X','S100','Date becoming BO: 01/01/2024\nDate ceasing BO: -','A','']]);
 first.sheets.push({...newer.sheets[0],name:'Register of Beneficial Owners (Imported 2026-11-04)'});
 assert.equal(latestRegisterRecords(first,[0,1]).length,1);
 assert.equal(latestRegisterRecords(first,[0,1])[0].status,'former');
});
test('BO with a distinct later effective becoming date may be Current after reappointment',()=>{
 const old=from([['BO X','S100','Date becoming BO: 01/01/2024\nDate ceasing BO: 01/06/2025','A','']]);
 const newSheet=from([['BO X','S100','Date becoming BO: 01/01/2026\nDate ceasing BO: -','A','']]);
 old.sheets.push({...newSheet.sheets[0],name:'Register of Beneficial Owners (Imported 2026-11-04)'});
 const history=latestRegisterRecords(old,[0,1]);
 assert.deepEqual(history.map(x=>x.status).sort(),['current','former']);
});
