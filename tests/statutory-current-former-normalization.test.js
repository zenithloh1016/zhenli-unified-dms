import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook,sanitizeSheet} from '../src/statutory-register-data.js';
import {visibleRegisterIndices,registerGroupIndices,latestRegisterRecords} from '../src/statutory-register-review.js';
import {buildGroupedRegister,buildCombinedRegisters} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {buildStatutoryRegistersPdf} from '../src/statutory-register-pdf.js';
import {createRegisterBookTab} from '../src/register-book-tab.js';

const co={id:'c1',name:'ACE ALLIANCE HOLDINGS SDN BHD',registration_no:'201901032897'};
const directorHeader=['Director Name','Date of Birth','IC No. / Passport No.',
 'Gender','Nationality / Race','Date of Appointment','Date of Cessation'];
function directors(rows,name='Register of Directors'){return sanitizeSheet(name,[
 [],['Company Name:',co.name],['Company No.:',co.registration_no],
 [],[],[],[],directorHeader,...rows
]);}
function mk(){
 return makeRegisterBook(co,{path:'Register Book_ACE_ALLIANCE_TEST.xlsx',sheets:[
  directors([
   ['DIRECTOR A','30094','101010-01-1010','MALE','MALAYSIAN','43721','-'],
   ['DIRECTOR B','30094','202020-02-2020','FEMALE','MALAYSIAN','43721','-']
  ]),
  directors([
   ['DIRECTOR A','30094','101010-01-1010','MALE','MALAYSIAN','43721','46200'],
   ['DIRECTOR B','30094','202020-02-2020','FEMALE','MALAYSIAN','43721','-'],
   ['DIRECTOR C','30094','303030-03-3030','MALE','MALAYSIAN','46100','-']
  ],'Register of Directors (Imported 2026-10-22)'),
  sanitizeSheet('Register of Secretaries',[
   ['Name','NRIC No.','Date of Appointment','Date of Cessation'],
   ['SECRETARY ACTIVE','S001','43721','-'],
   ['SECRETARY FORMER','S002','43721','45000']
  ]),
  sanitizeSheet('Register of BO',[
   ['Full Name','NRIC No.','Date of Becoming BO','Date of Cessation'],
   ['BO CURRENT','B001','43721','-'],
   ['BO FORMER','B002','43721','45000']
  ]),
  sanitizeSheet('Register of Charges',[
   ['Registered No.','Date of Registration','Chargee','Date of Discharge'],
   ['CHARGE ACTIVE','45000','BANK ONE','-'],
   ['CHARGE DISCHARGED','44000','BANK TWO','45800']
  ]),
  sanitizeSheet('Register of Transfers',[
   ['Name','Date','No. of Shares'],['TRANSFER ONE','44500','100']
  ]),
  sanitizeSheet('Register of Allotments',[
   ['Name','Date','No. of Shares'],['ALLOTMENT ONE','44500','100']
  ])
 ]});
}
test('ACE ALLIANCE prior director entries from different imported editions share one tab',()=>{
 const b=mk();
 assert.deepEqual(registerGroupIndices(b,0),[0,1]);
 assert.deepEqual(visibleRegisterIndices(b),[0,6,5,4,2,3]);
 const consolidated=latestRegisterRecords(b,[0,1]);
 assert.equal(consolidated.length,3);
 assert.equal(consolidated.find(x=>x.title==='DIRECTOR A').status,'former');
 assert.equal(consolidated.find(x=>x.title==='DIRECTOR A').sourceSheetIndex,1);
 const layout=buildGroupedRegister(b,0);
 assert.deepEqual(layout.blocks.filter(x=>x.type==='group').map(x=>x.title),['Current','Former']);
 assert.equal(layout.blocks.filter(x=>x.type==='record'&&x.status==='Former').length,1);
 assert.equal(layout.blocks.filter(x=>x.type==='record'&&x.status==='Current').length,2);
 const former=layout.blocks.find(x=>x.type==='record'&&x.title==='DIRECTOR A');
 assert.equal(former.sheetIndex,1);
 assert.equal(former.row,8);
 assert(!JSON.stringify(layout).includes('Status Not Recorded'));
 const view=renderStatutoryRegisterDocument(b,0);
 assert(view.includes('DIRECTOR A')&&view.includes('DIRECTOR C'));
 assert(view.includes('Former'));
 assert(!view.includes('Status Not Recorded'));
 assert(!view.includes('Verify</div>'));
});
test('missing status source uses Current/Former only and accepts verified status override',()=>{
 const b=mk();
 // A section with a missing date of cessation cannot add an unwanted third tab.
 b.sheets[2]=sanitizeSheet('Register of Secretaries',[
  ['Name','NRIC No.','Date of Appointment'],
  ['SOME SECRETARY','S003','43721']
 ]);
 let layout=buildGroupedRegister(b,2);
 assert.deepEqual(layout.blocks.filter(x=>x.type==='group').map(x=>x.title),['Current','Former']);
 assert(layout.blocks.some(x=>x.type==='record'&&x.title==='SOME SECRETARY'&&x.status==='Current'));
 b.recordStatuses={'2:1':'former'};
 layout=buildGroupedRegister(b,2);
 assert(layout.blocks.some(x=>x.type==='record'&&x.title==='SOME SECRETARY'&&x.status==='Former'));
 assert(!layout.blocks.some(x=>x.type==='group'&&/Status Not Recorded/.test(x.title)));
});
test('Current/Former section names identical for Directors, Secretaries, BO and Charges; not Transfers/Allotments',()=>{
 const b=mk();
 for(const i of [0,2,3,4]){
  const layout=buildGroupedRegister(b,i);
  assert.deepEqual(layout.blocks.filter(x=>x.type==='group').map(x=>x.title),['Current','Former']);
  assert(layout.blocks.every(x=>x.status!=='Status Not Recorded'));
 }
 for(const i of [5,6]){
  const layout=buildGroupedRegister(b,i);
  assert.deepEqual(layout.blocks.filter(x=>x.type==='group').map(x=>x.title),['Transactions']);
   assert(!layout.blocks.some(x=>x.status==='Current'||x.status==='Former'));
 }
 const combined=buildCombinedRegisters(b);
 assert.equal(combined.filter(x=>x.title==='Register of Directors').length,1);
 assert(!JSON.stringify(combined).includes('Status Not Recorded'));
});
test('verified Mark Former/Current persists in book without inventing cessation dates',async()=>{
 const b=mk();
 const storage={
  download:async()=>({data:new Blob([JSON.stringify(b)]),error:null}),
  list:async()=>({data:[],error:null})
 };
 const db={storage:{from:()=>storage},from(){
  const q={select(){return q;},eq(){return q;},is(){return q;},ilike(){return q;},
   order(){return q;},limit:async()=>({data:[],error:null})};return q;
 }};
 const tab=createRegisterBookTab({db,getUser:()=>({id:'u1'}),getCompanies:()=>[co]});
 const originalWindow=globalThis.window;globalThis.window={confirm:()=>true};
 try{
  await tab.openCompany('c1');
  tab.command('sr-sheet','0');
  const html=tab.render();
  assert(html.includes('Mark Former'));
  assert(html.includes('Mark Current'));
  assert(html.includes('data-action="sr-set-status"'));
  const source=tab.state.book.sheets[1].rows[9][6];
  assert.equal(source,'-');
  tab.command('sr-set-status','1:9:former');
  assert.equal(tab.state.book.recordStatuses['1:9'],'former');
  assert.equal(tab.state.book.sheets[1].rows[9][6],source);
  assert.equal(tab.state.dirty,true);
  // The visible latest edition is reclassified; older imported source rows
  // and original cessation values remain untouched.
  const projection=buildGroupedRegister(tab.state.book,0);
  assert(projection.blocks.some(x=>x.title==='DIRECTOR B'&&x.status==='Former'));
  assert(projection.blocks.some(x=>x.title==='DIRECTOR A'&&x.status==='Former'));
 }finally{globalThis.window=originalWindow;}
});
test('individual and combined PDF contain exactly two section headings, with recovered former director',async()=>{
 const b=mk();const draws=[];
 const ctx={scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(v){draws.push(String(v))},measureText(v){return {width:String(v).length*7}},
  set font(v){this._font=v},get font(){return this._font}};
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({getContext(){return ctx},width:0,height:0,
  toBlob(cb){cb(new Blob([Uint8Array.of(0xff,0xd8,0xff,0xd9)],{type:'image/jpeg'}))}})};
 try{
  await buildStatutoryRegistersPdf(b,{sheetIndex:0});
  assert(draws.includes('DIRECTOR A'));
  assert(draws.includes('Current')&&draws.includes('Former'));
  assert(!draws.includes('Status Not Recorded — Verify'));
  draws.length=0;
  await buildStatutoryRegistersPdf(b,{combined:true});
  assert(draws.includes('DIRECTOR A'));
  assert(!draws.includes('Status Not Recorded — Verify'));
 }finally{globalThis.document=previous;}
});
