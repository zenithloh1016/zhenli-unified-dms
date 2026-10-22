import test from 'node:test';
import assert from 'node:assert/strict';
import {numericKind,formatStatutoryNumber,formatStatutoryNumberByKind,normalizeStatutoryNumberByKind} from '../src/statutory-number-format.js';
import {makeRegisterBook,sanitizeSheet} from '../src/statutory-register-data.js';
import {buildGroupedRegister,buildCombinedRegisters,formerMemberRecords} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {buildStatutoryRegistersPdf} from '../src/statutory-register-pdf.js';
import {createRegisterBookTab} from '../src/register-book-tab.js';

const company={id:'co1',name:'DEMO COMPANY SDN BHD',registration_no:'202601000001'};
function memberSheet(){
 const rows=Array.from({length:58},()=>[]);
 function folio(at,name,id,held,ceased,consideration){
  rows[at]=['Name:',name,,,,,'Date of Birth:','01/01/1980'];
  rows[at+1]=['ID Type:','NRIC',,,,,'Nationality/Origin:','MALAYSIA'];
  rows[at+2]=['Identification No.:',id,,,,,'Race:','-'];
  rows[at+3]=['Address:','EXAMPLE STREET',,,,,'Occupation:','DIRECTOR'];
  rows[at+4]=['','PERAK',,,,,'Date Ceased to be A Member:',ceased];
  rows[at+5]=[,,,,,,'Total Shares Held:',held];
  rows[at+7]=['SHARES ACQUIRED',,,,,,,'SHARES TRANSFERRED'];
  rows[at+8]=['Date','Share Certificate No.','Allotment No.','Folio','Class of Shares','No. of Shares','Consideration','Date','Transfer No.','Folio','Class of Shares','No. of Shares','Consideration','Balance of Shares'];
  rows[at+9]=['01/01/2023','-','A1','1','Ordinary','100000',consideration,'','','','','','',''+held];
 }
 folio(4,'CURRENT ONE','111','100000','-','1000000');
 folio(23,'CURRENT TWO','222','100000','-','1000000');
 folio(42,'FORMER THREE','333','0','10/08/2025','2000000');
 return sanitizeSheet('Register of Members 001',rows);
}
function book(){return makeRegisterBook(company,{path:'Register Book_DEMO COMPANY SDN BHD.xlsx',sheets:[memberSheet()]});}
test('formatted statutory quantities, consideration and ownership percentages preserve source precision',()=>{
 assert.equal(numericKind('Total Shares Held'),'shares');
 assert.equal(numericKind('Consideration'),'currency');
 assert.equal(numericKind('Shareholding Percentage'),'percent');
 assert.equal(formatStatutoryNumber('Current Number of Shares Held','100000'),'100,000');
 assert.equal(formatStatutoryNumber('Share Consideration','1000000'),'RM1,000,000');
 assert.equal(formatStatutoryNumber('Percentage','50'),'50.00%');
 assert.equal(formatStatutoryNumber('Percentage','50%'),'50.00%');
 assert.equal(formatStatutoryNumber('Share Consideration','RM1,000,000.25'),'RM1,000,000.25');
 assert.equal(formatStatutoryNumber('Identification No.','000123456'),'000123456');
 assert.equal(normalizeStatutoryNumberByKind('shares','100,000'),'100000');
 assert.equal(normalizeStatutoryNumberByKind('currency','RM1,000,000'),'1000000');
 assert.equal(formatStatutoryNumberByKind('percent','50'),'50.00%');
});
test('two active shareholders plus former history all show with correctly formatted figures',()=>{
 const b=book(),before=JSON.stringify(b);
 const section=buildGroupedRegister(b,0);
 assert.equal(section.blocks.filter(x=>x.type==='group').length,2);
 const active=section.blocks.filter(x=>x.type==='record'&&x.status==='Current');
 const former=section.blocks.filter(x=>x.type==='record'&&x.status==='Former');
 assert.equal(active.length,2);assert.equal(former.length,1);
 assert(formerMemberRecords(b,[0]).some(x=>x.record.title==='FORMER THREE'));
 assert.equal(section.blocks.filter(x=>x.type==='metric'&&x.value==='50.00%').length,2);
 assert(section.blocks.some(x=>x.type==='field'&&x.value==='100,000'));
 assert(section.blocks.some(x=>x.type==='metric'&&x.value==='RM1,000,000'));
 assert(section.blocks.some(x=>x.type==='metric'&&x.value==='RM2,000,000'));
 assert(section.blocks.some(x=>x.type==='field'&&x.label==='Date Ceased to be a Member'));
 const html=renderStatutoryRegisterDocument(b,0);
 assert(html.includes('Former'));
 assert(html.includes('50.00%'));
 assert(html.includes('100,000'));
 assert(html.includes('RM1,000,000'));
 assert(html.includes('RM2,000,000'));
 assert.equal(JSON.stringify(b),before);
 assert.equal(buildCombinedRegisters(b).length,1);
});
test('formatting an unchanged input must not rewrite or mark dirty on blur',async()=>{
 const stored=book(), storage={download:async()=>({data:new Blob([JSON.stringify(stored)]),error:null}),list:async()=>({data:[],error:null})};
 const db={storage:{from:()=>storage},from(){
  const q={select(){return q},eq(){return q},is(){return q},ilike(){return q},order(){return q},limit:async()=>({data:[],error:null})};
  return q;
 }};
 const tab=createRegisterBookTab({db,getUser:()=>({id:'u1'}),getCompanies:()=>[company]});
 const oldDocument=globalThis.document;globalThis.document={getElementById:()=>null};
 try{
  await tab.openCompany('co1');
  const initial=tab.state.book.sheets[0].rows[9][7];
  assert.equal(initial,'100000');
  const changed=tab.updateCell({dataset:{r:'9',c:'7',s:'0',numericKind:'shares'},value:'100,000'});
  assert.equal(changed,true);
  assert.equal(tab.state.dirty,false);
  assert.equal(tab.state.book.sheets[0].rows[9][7],'100000');
  tab.updateCell({dataset:{r:'9',c:'7',s:'0',numericKind:'shares'},value:'120,000'});
  assert.equal(tab.state.book.sheets[0].rows[9][7],'120000');
  assert.equal(tab.state.dirty,true);
 }finally{globalThis.document=oldDocument;}
});
test('PDF includes former history, share counts, consideration and percentage',async()=>{
 const recorded=[];const old=globalThis.document;
 const ctx={scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(text){recorded.push(String(text));},measureText(text){return {width:String(text).length*7}},
  set font(v){this._font=v},get font(){return this._font}};
 globalThis.document={createElement:()=>({width:0,height:0,getContext(){return ctx},
  toBlob(cb){cb(new Blob([Uint8Array.of(0xff,0xd8,0xff,0xd9)],{type:'image/jpeg'}))}})};
 try{
  const pdf=await buildStatutoryRegistersPdf(book(),{sheetIndex:0});
  assert((await pdf.text()).startsWith('%PDF'));
  assert(recorded.includes('Former'));
  assert(recorded.includes('50.00%'));
  assert(recorded.includes('100,000'));
  assert(recorded.includes('RM1,000,000'));
  assert(recorded.includes('FORMER THREE'));
 }finally{globalThis.document=old;}
});
