import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {createRegisterBookTab} from '../src/register-book-tab.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {buildStatutoryRegistersPdf} from '../src/statutory-register-pdf.js';
import {formatMemberFolioNumber} from '../src/statutory-member-folio-format.js';

const company={id:'c1',name:'MAX PLUS TECHNOLOGIES SDN. BHD.',
 registration_no:'202301009667 (1503588-X)'};
const memberIndex=b=>b.sheets.findIndex(s=>s.name==='Register of Members');

function oneMember({folio='1',name='CURRENT HOLDER',shares='50',withLedger=false}={}){
 const rows=[
  ['Folio No.:',folio],
  ['Name:',name],
  ['Date of Birth:','25/11/1987'],
  ['Identification No.:','871125-08-5436'],
  ['Date Ceased to be A Member:','-'],
  ['Total Shares Held:',shares]
 ];
 if(withLedger)rows.push(
  ['SHARES ACQUIRED','','','','','','','SHARES TRANSFERRED'],
  ['Date','No. of Share Certificate','Allotment or Transfer No.','Folio',
   'Class of Shares','No. of Shares','Consideration','Date','Transfer No.',
   'Folio','Class of Shares','No. of Shares','Consideration','Balance of Shares'],
  ['01/01/2025','-','A001',folio,'Ordinary',shares,'50','','','','','','',shares]
 );
 return makeRegisterBook(company,{path:'Original Register Book.xlsx',
  sheets:[{name:'Register of Members 001',rows}]});
}
const view=b=>buildGroupedRegister(b,0,{showBlanks:true});
const consideration=b=>view(b).blocks.filter(x=>x.type==='metric'&&
 x.label==='Total Share Consideration (Acquisitions)');

test('current members always have a consideration row without inventing RM0',()=>{
 const book=oneMember(),original=JSON.stringify(book);
 assert.equal(consideration(book).length,1);
 assert.equal(consideration(book)[0].value,'Not recorded');
 assert(!view(book).blocks.some(x=>x.type==='metric'&&x.value==='RM0'));
 const html=renderStatutoryRegisterDocument(book,0,{showBlanks:true});
 assert(html.includes('Total Share Consideration (Acquisitions)'));
 assert(html.includes('Not recorded'));
 assert.equal(JSON.stringify(book),original);
});

test('verified acquired consideration is correctly formatted and former does not show historical acquisitions',()=>{
 const book=oneMember({folio:'0001',withLedger:true});
 assert.equal(consideration(book).length,1);
 assert.equal(consideration(book)[0].value,'RM50');
 assert(view(book).blocks.some(x=>x.label==='Folio No.'&&x.value==='001'));
 book.sheets[0].rows[4][1]='30/09/2026';
 const blocks=view(book).blocks;
 assert(blocks.some(x=>x.type==='record'&&x.status==='Former'));
 assert(!blocks.some(x=>x.label==='Total Share Consideration (Acquisitions)'));
});

test('old one or two digit folios are zero-padded only for display, never rewritten',()=>{
 for(const [input,expected] of [
  ['1','001'],['9','009'],['99','099'],['001','001'],['0002','002'],
  ['999','999'],['1000','1000'],['A7','A7'],['','']
 ]){
  assert.equal(formatMemberFolioNumber(input),expected);
 }
 const book=oneMember({folio:'7'}),snapshot=JSON.stringify(book);
 const field=view(book).blocks.find(x=>x.type==='field'&&x.label==='Folio No.');
 assert.equal(field.value,'007');
 assert.equal(field.sheetIndex,0);
 assert.equal(field.row,0);
 assert.equal(field.col,1);
 assert.equal(book.sheets[0].rows[0][1],'7');
 assert.equal(JSON.stringify(book),snapshot);
 const html=renderStatutoryRegisterDocument(book,0,{showBlanks:true});
 assert(html.includes('>007</textarea>'));
});

test('each newly added member folio begins with 001 and 002; blanks have consideration row',async()=>{
 const files=new Map();
 const storage={
  list:async()=>({data:[],error:null}),
  download:async key=>files.has(key)
   ?{data:files.get(key),error:null}
   :{data:null,error:{message:'Object not found',statusCode:404}},
  upload:async(key,blob)=>{files.set(key,blob);return {error:null};}
 };
 const db={storage:{from:()=>storage},from(){
  const q={select(){return q;},eq(){return q;},is(){return q;},
   ilike(){return q;},order(){return q;},limit:async()=>({data:[],error:null})};
  return q;
 }};
 const tab=createRegisterBookTab({db,getUser:()=>({id:'u1'}),
  getCompanies:()=>[company]});
 await tab.openCompany('c1');
 tab.command('sr-sheet',String(memberIndex(tab.state.book)));
 tab.command('sr-add-row');
 tab.command('sr-add-row');
 const folios=tab.state.book.sheets.filter(s=>/^Register of Members 00[12]$/.test(s.name));
 assert.deepEqual(folios.map(s=>s.rows[0][1]),['001','002']);
 const current=buildGroupedRegister(tab.state.book,memberIndex(tab.state.book),{showBlanks:true});
 assert.equal(current.blocks.filter(b=>b.type==='record'&&b.status==='Current').length,2);
 assert.equal(current.blocks.filter(b=>b.type==='metric'&&
  b.label==='Total Share Consideration (Acquisitions)'&&b.value==='Not recorded').length,2);
 const previous=globalThis.document;
 globalThis.document={getElementById:()=>null};
 try{
  assert(tab.updateCell({dataset:{r:'0',c:'1',s:String(tab.state.book.sheets.indexOf(folios[0]))},value:'001'}));
  assert.equal(folios[0].rows[0][1],'001');
  assert(tab.updateCell({dataset:{r:'0',c:'1',s:String(tab.state.book.sheets.indexOf(folios[0]))},value:'9'}));
  assert.equal(folios[0].rows[0][1],'009');
 }finally{globalThis.document=previous;}
});

test('member PDF displays missing consideration and normalized folio number',async()=>{
 const book=oneMember({folio:'1'}),original=JSON.stringify(book);
 const recorded=[],old=globalThis.document;
 const ctx={
  scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(v){recorded.push(String(v));},
  measureText(v){return {width:String(v).length*7}},
  set font(v){this._font=v},get font(){return this._font}
 };
 globalThis.document={createElement:()=>({
  width:0,height:0,getContext(){return ctx},
  toBlob(cb){cb(new Blob([Uint8Array.of(0xff,0xd8,0xff,0xd9)],{type:'image/jpeg'}));}
 })};
 try{
  const pdf=await buildStatutoryRegistersPdf(book,{sheetIndex:0});
  assert((await pdf.text()).startsWith('%PDF'));
  assert(recorded.includes('Folio No.'));
  assert(recorded.includes('001'));
  assert(recorded.includes('Total Share Consideration (Acquisitions)'));
  assert(recorded.includes('Not recorded'));
  assert.equal(JSON.stringify(book),original);
 }finally{globalThis.document=old;}
});
