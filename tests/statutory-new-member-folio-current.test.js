import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {createRegisterBookTab} from '../src/register-book-tab.js';
import {buildGroupedRegister,currentMemberRecords,formerMemberRecords} from '../src/statutory-register-annual-layout.js';
import {parseMemberFolios} from '../src/statutory-current-members.js';

const company={id:'max',name:'MAX PLUS TECHNOLOGIES SDN. BHD.',
 registration_no:'202301009667 (1503588-X)'};
function fixture(){
 const blobs=new Map();
 const storage={
  list:async()=>({data:[],error:null}),
  download:async path=>blobs.has(path)
   ?{data:blobs.get(path),error:null}
   :{data:null,error:{message:'Object not found',statusCode:404}},
  upload:async(path,blob)=>{blobs.set(path,blob);return {error:null};}
 };
 const tab=createRegisterBookTab({db:{storage:{from:()=>storage}},
  getUser:()=>({id:'u1'}),getCompanies:()=>[company]});
 return {tab,blobs};
}
const memberIndex=book=>book.sheets.findIndex(s=>s.name==='Register of Members');
const indices=book=>book.sheets.map((s,i)=>s.name.startsWith('Register of Members')?i:-1).filter(i=>i>=0);
const entries=book=>buildGroupedRegister(book,memberIndex(book),{showBlanks:true}).blocks;

test('new blank member folio is provisional Current, not Former',async()=>{
 const {tab}=fixture();
 await tab.openCompany('max');
 tab.command('sr-sheet',String(memberIndex(tab.state.book)));
 tab.command('sr-add-row');
 const book=tab.state.book;
 const folio=book.sheets.find(s=>s.name==='Register of Members 001');
 assert(folio);
 assert.equal(folio.rows.find(r=>r[0]==='Total Shares Held:')?.[1],'');
 assert.deepEqual(entries(book).filter(b=>b.type==='record').map(b=>[b.title,b.status]),[['New member','Current']]);
 assert(entries(book).some(b=>b.type==='note'&&/provisional/i.test(b.text)));
 assert(!entries(book).some(b=>b.type==='metric'&&/Percentage/i.test(b.label||'')));
 assert.equal(currentMemberRecords(book,indices(book)).length,1);
 assert.equal(formerMemberRecords(book,indices(book)).length,0);
 assert.match(tab.render(),/New member/);
});

test('two unfinished new folios are both shown in Current and are not collapsed',async()=>{
 const {tab}=fixture();await tab.openCompany('max');
 tab.command('sr-sheet',String(memberIndex(tab.state.book)));
 tab.command('sr-add-row');
 tab.command('sr-add-row');
 assert.equal(currentMemberRecords(tab.state.book,indices(tab.state.book)).length,2);
 assert.equal(formerMemberRecords(tab.state.book,indices(tab.state.book)).length,0);
 assert.equal(entries(tab.state.book).filter(b=>b.type==='record'&&b.status==='Current').length,2);
});

test('member remains Current while incomplete, gains percentage with shares and becomes Former after cessation',async()=>{
 const {tab}=fixture();await tab.openCompany('max');
 tab.command('sr-sheet',String(memberIndex(tab.state.book)));
 tab.command('sr-add-row');
 const book=tab.state.book;
 const folio=book.sheets.find(s=>s.name==='Register of Members 001');
 folio.rows.find(r=>r[0]==='Name:')[1]='ACTUAL HOLDER';
 assert.equal(currentMemberRecords(book,indices(book))[0].record.title,'ACTUAL HOLDER');
 folio.rows.find(r=>r[0]==='Total Shares Held:')[1]='100';
 assert(entries(book).some(b=>b.label==='Percentage of Recorded Current Holdings'&&b.value==='100.00%'));
 folio.rows.find(r=>r[0]==='Date Ceased to be A Member:')[1]='24/10/2026';
 assert(!entries(book).some(b=>b.type==='record'&&b.status==='Current'));
 assert(entries(book).some(b=>b.type==='record'&&b.status==='Former'&&b.title==='ACTUAL HOLDER'));
});

test('historical zero share folio still stays outside verified Current',()=>{
 const rows=[['Folio No.:','1'],['Name:','HISTORICAL HOLDER'],
  ['Date Ceased to be A Member:',''],['Total Shares Held:','0']];
 const book=makeRegisterBook(company,{path:'original.xlsx',
  sheets:[{name:'Register of Members 001',rows}]});
 assert.equal(parseMemberFolios(rows)[0].status,'current');
 assert.equal(currentMemberRecords(book,[0]).length,0);
 assert.equal(formerMemberRecords(book,[0]).length,1);
});
