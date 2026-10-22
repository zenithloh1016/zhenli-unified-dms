import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook,sanitizeSheet} from '../src/statutory-register-data.js';
import {describeStatutorySheet} from '../src/statutory-register-review.js';
import {buildGroupedRegister,buildIndependentRegister,currentMemberRecords,buildCombinedRegisters} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {buildStatutoryRegistersPdf} from '../src/statutory-register-pdf.js';

const company={id:'c1',name:'EXAMPLE SDN BHD',registration_no:'202601123456'};
function folio(rows,at,{name,id,shares,ceased='-',balance}){
 rows[at]=['Name:',name,,,,,'Date of Birth:','01/01/1970'];
 rows[at+1]=['ID Type:','NRIC',,,,,'Nationality/Origin:','MALAYSIA'];
 rows[at+2]=['Identification No.:',id,,,,,'Race:','-'];
 rows[at+3]=['Address:','NO. 1 SAMPLE STREET',,,,,'Date Entered as A Member:','01/01/2021'];
 rows[at+4]=['','SAMPLE CITY',,,,,'Date Ceased to be A Member:',ceased];
 rows[at+5]=[,,,,,,'Total Shares Held:',shares];
 rows[at+7]=['SHARES ACQUIRED',,,,,,,'SHARES TRANSFERRED'];
 rows[at+8]=['Date','No. Of Share Certificate','Allotment or Transfer No.','Folio',
   'Class of Shares','No. of Shares','Consideration','Date','Transfer No.','Folio',
   'Class of Shares','No. of Shares','Consideration','Balance of Shares'];
 rows[at+9]=['01/01/2021','-','A1','1','Ordinary','100','100','','','','','','',balance||shares];
}
function book(rows){
 return makeRegisterBook(company,{path:'Register Book_EXAMPLE SDN BHD.xlsx',
  sheets:[sanitizeSheet('Register of Members 001',rows)]});
}
test('reads every folio from a multi-member worksheet and excludes ceased or zero-shareholders',()=>{
 const rows=Array.from({length:125},()=>[]);
 folio(rows,8,{name:'FORMER HOLDER',id:'ID-A',shares:'0',ceased:'45477'});
 folio(rows,28,{name:'CURRENT HOLDER B',id:'ID-B',shares:'2,500'});
 folio(rows,48,{name:'CURRENT HOLDER C',id:'ID-C',shares:'800'});
 folio(rows,68,{name:'ZERO SHARE HOLDER',id:'ID-D',shares:'0'});
 folio(rows,88,{name:'CURRENT HOLDER B',id:'ID-B',shares:'3,000'});
 const b=book(rows);
 const source=describeStatutorySheet(b.sheets[0]);
 assert.equal(source.records.length,5,'all 5 folios must be parsed, not just the first');
 const current=currentMemberRecords(b,[0]);
 assert.equal(current.length,2,'two distinct, currently holding shareholders');
 assert.deepEqual(current.map(x=>x.record.title).sort(),['CURRENT HOLDER B','CURRENT HOLDER C']);
 const result=buildGroupedRegister(b,0);
 const names=result.blocks.filter(x=>x.type==='field'&&x.label==='Shareholder Name');
 const holdings=result.blocks.filter(x=>x.type==='field'&&x.label==='Current Number of Shares Held');
 assert.equal(names.length,2);assert.equal(holdings.length,2);
 assert(holdings.some(x=>x.value==='3,000'&&x.row===93&&x.col===7),
  'newest folio must supply current shares with original editable cell coordinates');
 assert(holdings.some(x=>x.value==='800'));
 assert.equal(result.blocks.filter(x=>x.type==='record').length,2);
 assert(!JSON.stringify(result.blocks).includes('FORMER HOLDER'));
 assert(!JSON.stringify(result.blocks).includes('ZERO SHARE HOLDER'));
 assert(!JSON.stringify(result.blocks).includes('2,500'));
 const html=renderStatutoryRegisterDocument(b,0);
 assert(html.includes('CURRENT HOLDER B'));
 assert(html.includes('CURRENT HOLDER C'));
 assert(!html.includes('FORMER HOLDER'));
 assert(!html.includes('ZERO SHARE HOLDER'));
 assert(!html.includes('NO. 1 SAMPLE STREET'),'only name and current shares should display');
 assert(!html.includes('SHARES ACQUIRED'),'historic share movement ledger is hidden');
});
test('a newer imported member worksheet supersedes older current holdings and cessation states',()=>{
 const old=Array.from({length:25},()=>[]);
 folio(old,8,{name:'SHAREHOLDER ONE',id:'ONE001',shares:'300'});
 folio(old,8,{name:'SHAREHOLDER ONE',id:'ONE001',shares:'300'});
 const newRows=Array.from({length:45},()=>[]);
 folio(newRows,8,{name:'SHAREHOLDER ONE',id:'ONE001',shares:'0',ceased:'31/12/2025'});
 folio(newRows,28,{name:'NEW SHAREHOLDER',id:'NEW002',shares:'300'});
 const b=book(old);
 b.sheets.push(sanitizeSheet('Register of Members 001 (Imported 2026-10-22)',newRows));
 const source=structuredClone(b.sheets);
 const current=currentMemberRecords(b,[0,1]);
 assert.deepEqual(current.map(x=>x.record.title),['NEW SHAREHOLDER']);
 const grouped=buildGroupedRegister(b,0);
 assert.equal(grouped.blocks.filter(x=>x.type==='record').length,1);
 assert(!JSON.stringify(grouped).includes('SHAREHOLDER ONE'));
 assert(grouped.blocks.some(x=>x.type==='field'&&x.value==='300'&&x.sheetIndex===1));
 const combined=buildCombinedRegisters(b);
 assert.equal(combined.length,1,'duplicated member source sheets share one tab and PDF section');
 assert.deepEqual(b.sheets,source,'source history must remain intact');
});
test('when a folio total is blank use the most recent explicit ledger balance without calculating transfers',()=>{
 const rows=Array.from({length:30},()=>[]);
 folio(rows,8,{name:'CURRENT SHAREHOLDER',id:'CURRENT003',shares:'',balance:'1,250'});
 const b=book(rows);
 const blocks=buildIndependentRegister(b,0).blocks;
 assert(blocks.some(x=>x.type==='field'&&x.label==='Current Number of Shares Held'&&x.value==='1,250'));
 assert(blocks.some(x=>x.type==='field'&&x.row===17&&x.col===13),'balance retains editable source coordinate');
});
test('when no current holding can be verified show a warning instead of listing former members',()=>{
 const rows=Array.from({length:44},()=>[]);
 folio(rows,8,{name:'CEASED ONE',id:'CEASED001',shares:'0',ceased:'2025-01-01'});
 folio(rows,28,{name:'NO SHARES',id:'ZERO002',shares:'0'});
 const b=book(rows);
 const result=buildGroupedRegister(b,0);
 assert(!result.blocks.some(x=>x.type==='record'));
 assert(result.blocks.some(x=>x.type==='note'&&/No current shareholders/i.test(x.text)));
});
test('member PDF exports the same current-only shareholders, never historic names or transactions',async()=>{
 const rows=Array.from({length:45},()=>[]);
 folio(rows,8,{name:'FORMER PERSON',id:'FORMER001',shares:'0',ceased:'45477'});
 folio(rows,28,{name:'ACTIVE PERSON',id:'ACTIVE001',shares:'5,000'});
 const b=book(rows);
 const drawn=[];
 const ctx={
  scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(str){drawn.push(String(str))},
  measureText(str){return {width:String(str).length*7}},
  set font(v){this._font=v},get font(){return this._font}
 };
 const prev=globalThis.document;
 globalThis.document={createElement:()=>({
  width:0,height:0,getContext(){return ctx},
  toBlob(cb){cb(new Blob([Uint8Array.of(0xff,0xd8,0xff,0xd9)],{type:'image/jpeg'}));}
 })};
 try{
  const pdf=await buildStatutoryRegistersPdf(b,{sheetIndex:0});
  assert((await pdf.text()).startsWith('%PDF'));
  assert(drawn.includes('ACTIVE PERSON'));
  assert(drawn.includes('5,000'));
  assert(!drawn.includes('FORMER PERSON'));
  assert(!drawn.includes('SHARES ACQUIRED'));
 }finally{globalThis.document=prev;}
});
