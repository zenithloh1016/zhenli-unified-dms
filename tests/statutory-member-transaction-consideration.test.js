import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook,sanitizeSheet} from '../src/statutory-register-data.js';
import {memberLedgerTotals,parseMemberFolios} from '../src/statutory-current-members.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {buildStatutoryRegistersPdf} from '../src/statutory-register-pdf.js';

const company={id:'c1',name:'CONSIDERATION SAMPLE SDN BHD',registration_no:'202601000008'};
const header=['Date','No. Of Share Certificate','Allotment or Transfer No.','Folio',
 'Class of Shares','No. of Shares','Consideration','Date ','Transfer No.','Folio',
 'Class of Shares','No. of Shares','Consideration','Balance of Shares'];
function folio(rows,at,{name,shares,ceased,ledger}){
 rows[at]=['Name:',name,,,,,'Date of Birth:','30094'];
 rows[at+1]=['ID Type:','NRIC',,,,,'Nationality/Origin:','MALAYSIAN'];
 rows[at+2]=['Identification No.:',name==='ACTIVE PERSON'?'ID-A':'ID-B'];
 rows[at+3]=['Address:','IPOH',,,,,'Date Entered as A Member:','01/01/2020'];
 rows[at+4]=['','PERAK',,,,,'Date Ceased to be A Member:',ceased||'-'];
 rows[at+5]=[,,,,,,'Total Shares Held:',shares];
 rows[at+7]=['SHARES ACQUIRED',,,,,,,'SHARES TRANSFERRED'];
 rows[at+8]=header;
 for(let i=0;i<ledger.length;i++)rows[at+9+i]=ledger[i];
}
const transfer=(qty,amount,date='45477',ref='T1')=>
 ['-','-','-','-','-','0','0',date,ref,'5','Ordinary',String(qty),String(amount),'0'];
const acquire=(qty,amount,date='43178')=>
 [date,'-','A1','1','Ordinary',String(qty),String(amount),'-','-','-','-','0','0',String(qty)];
function fixture(){
 const rows=Array.from({length:100},()=>[]);
 folio(rows,8,{name:'ACTIVE PERSON',shares:'100500',ledger:[
  acquire('1','1'),acquire('*99,999','999999.50','43342'),acquire('500','500.50','44710'),
  ['-','-','-','-','-','0','0','-','-','-','-','0','0','100500']
 ]});
 folio(rows,34,{name:'FORMER PERSON',shares:'0',ceased:'45477',ledger:[
  acquire('1','1'),acquire('17000','17000','43342'),
  transfer(17000,15500,'45477','T1'),transfer(1,100,'45478','T2'),
  ['-','-','-','-','-','0','0','-','-','-','-','0','0','0']
 ]});
 return makeRegisterBook(company,{path:'Register Book_CONSIDERATION SAMPLE.xlsx',
  sheets:[sanitizeSheet('Register of Members 001',rows)]});
}
function byStatus(blocks,status){
 const output=[];let current=null;
 for(const b of blocks){
  if(b.type==='record')current={name:b.title,status:b.status,blocks:[]};
  if(b.type==='record')output.push(current);
  else if(current&&b.type!=='group')current.blocks.push(b);
 }
 return output.filter(x=>x.status===status);
}
test('separately sums ALL acquired consideration for current member and transferred quantities for former member',()=>{
 const b=fixture(),rows=b.sheets[0].rows;
 const folios=parseMemberFolios(rows);
 assert.equal(folios.length,2);
 assert.equal(folios[0].ledgerTotals.acquisitionCount,3);
 assert.equal(folios[0].ledgerTotals.acquisitionValueCount,3);
 assert.equal(folios[0].ledgerTotals.acquisitionConsideration,1000501);
 assert.equal(folios[0].ledgerTotals.transferCount,0);
 assert.equal(folios[1].ledgerTotals.acquisitionConsideration,17001);
 assert.equal(folios[1].ledgerTotals.transferredShares,17001);
 assert.equal(folios[1].ledgerTotals.transferConsideration,15600);
 assert.equal(folios[1].ledgerTotals.transferCount,2);
 const result=buildGroupedRegister(b,0);
 const current=byStatus(result.blocks,'Current').find(x=>x.name==='ACTIVE PERSON');
 const former=byStatus(result.blocks,'Former').find(x=>x.name==='FORMER PERSON');
 assert(current&&former);
 assert(current.blocks.some(x=>x.type==='metric'&&x.label==='Total Share Consideration (Acquisitions)'&&x.value==='RM1,000,501'));
 assert(former.blocks.some(x=>x.type==='metric'&&x.label==='Total Number of Shares Transferred'&&x.value==='17,001'));
 assert(former.blocks.some(x=>x.type==='metric'&&x.label==='Total Share Consideration (Transfers)'&&x.value==='RM15,600'));
 assert(!former.blocks.some(x=>/Historical Acquisitions/i.test(x.label||'')));
 assert(!former.blocks.some(x=>x.value==='RM17,001'));
 assert(current.blocks.some(x=>x.type==='metric'&&x.label==='Total Share Consideration (Acquisitions)'));
 assert(former.blocks.some(x=>x.label==='Total Number of Shares Transferred'&&x.value==='17,001'));
 assert(!current.blocks.some(x=>x.label==='Total Share Consideration (Transfers)'));
 assert(!former.blocks.some(x=>x.label==='Total Share Consideration (Transfers)'&&x.value==='RM17,001'));
});
test('zero-valued placeholders and missing consideration never fabricate a monetary total',()=>{
 const rows=Array.from({length:48},()=>[]);
 folio(rows,8,{name:'FORMER PERSON',shares:'0',ceased:'45477',ledger:[
  acquire('100','100'),transfer(100,'-'),['-','-','-','-','-','0','0','-','-','-','-','0','0','0']
 ]});
 const parsed=parseMemberFolios(sanitizeSheet('Register of Members 001',rows).rows);
 assert.equal(parsed[0].ledgerTotals.transferCount,1);
 assert.equal(parsed[0].ledgerTotals.transferredShares,100);
 assert.equal(parsed[0].ledgerTotals.transferValueCount,0);
 const book=makeRegisterBook(company,{path:'Register Book_SAMPLE.xlsx',
  sheets:[sanitizeSheet('Register of Members 001',rows)]});
 const section=buildGroupedRegister(book,0);
 assert(section.blocks.some(x=>x.type==='metric'&&x.label==='Total Number of Shares Transferred'&&x.value==='100'));
 assert(!section.blocks.some(x=>x.type==='metric'&&x.label==='Total Share Consideration (Transfers)'));
 assert(section.blocks.some(x=>x.type==='note'&&/not recorded in the source ledger/i.test(x.text)));
});
test('all numeric results render in both member web view and PDF without changing source data',async()=>{
 const b=fixture();const before=JSON.stringify(b);
 const html=renderStatutoryRegisterDocument(b,0);
 assert(html.includes('RM1,000,501'));
 assert(html.includes('17,001'));
 assert(html.includes('RM15,600'));
 assert(!html.includes('Historical Acquisitions'));
 assert(!html.includes('RM17,001'));
 assert(!html.includes('Some acquisitions have no consideration recorded; the displayed acquisition amount is a partial total.'));
 assert.equal(JSON.stringify(b),before);
 const drawn=[],previous=globalThis.document;
 const ctx={scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(v){drawn.push(String(v))},measureText(v){return {width:String(v).length*7}},
  set font(v){this._font=v},get font(){return this._font}};
 globalThis.document={createElement:()=>({width:0,height:0,getContext(){return ctx},
  toBlob(cb){cb(new Blob([Uint8Array.of(0xff,0xd8,0xff,0xd9)],{type:'image/jpeg'}))}})};
 try{
  const pdf=await buildStatutoryRegistersPdf(b,{sheetIndex:0});
  assert((await pdf.text()).startsWith('%PDF'));
  assert(drawn.includes('RM1,000,501'));
  assert(drawn.includes('17,001'));
  assert(drawn.includes('RM15,600'));
  assert(!drawn.includes('RM17,001'));
  assert(!drawn.includes('Total Share Consideration (Historical Acquisitions)'));
 }finally{globalThis.document=previous;}
});
