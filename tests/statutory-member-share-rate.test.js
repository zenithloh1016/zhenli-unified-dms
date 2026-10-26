import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {createRegisterBookTab} from '../src/register-book-tab.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';

const company={id:'c1',name:'PRICE EXAMPLE SDN. BHD.',registration_no:'202601234567'};
const book=()=>makeRegisterBook(company,{path:'Imported Register.xlsx',sheets:[
 {name:'Register of Members 001',rows:[
  ['Folio No.:','001'],['Name:','CURRENT HOLDER'],
  ['Identification No.:','880101-00-0000'],
  ['Date Ceased to be A Member:',''],
  ['Total Shares Held:','100,000']
 ]}
]});
function consideration(b){
 return buildGroupedRegister(b,0).blocks.find(x=>
  x.type==='metric'&&x.label==='Total Share Consideration (Acquisitions)');
}
test('no rate or ledger does not invent RM100,000 from 100,000 no-par-value shares',()=>{
 const b=book(), original=JSON.stringify(b.sheets);
 assert.equal(consideration(b).value,'Not recorded');
 assert.deepEqual(b.sheets,JSON.parse(original));
 assert(renderStatutoryRegisterDocument(b,0).includes('Set RM/share'));
});
test('documented RM1.00 per share gives RM100,000 and auto-updates if held shares change',()=>{
 const b=book();
 b.memberShareRates={'0:1':'1'};
 assert.equal(consideration(b).value,'RM100,000');
 assert.equal(consideration(b).rateRow,1);
 b.sheets[0].rows[4][1]='120,000';
 assert.equal(consideration(b).value,'RM120,000');
 b.memberShareRates['0:1']='0.50';
 assert.equal(consideration(b).value,'RM60,000');
 assert.equal(b.sheets[0].rows[0][1],'001');
 assert(!b.sheets[0].rows[4].includes('60000'));
});
test('member paid per-share setting can be changed and reset from register UI',async()=>{
 const files=new Map(),db={
  storage:{from:()=>({
   list:async()=>({data:[],error:null}),
   download:async k=>files.has(k)?{data:files.get(k),error:null}:
    {data:null,error:{message:'Object not found',statusCode:404}},
   upload:async(k,b)=>{files.set(k,b);return {error:null}}
  })},
  from:()=>{const q={select(){return q},eq(){return q},is(){return q},
   ilike(){return q},order(){return q},limit:async()=>({data:[],error:null})};return q;}
 };
 const tab=createRegisterBookTab({db,getUser:()=>({id:'u1'}),getCompanies:()=>[company]});
 await tab.openCompany('c1');
 const index=tab.state.book.sheets.findIndex(s=>s.name==='Register of Members');
 tab.command('sr-sheet',String(index));
 tab.command('sr-add-row');
 const folioIndex=tab.state.book.sheets.findIndex(s=>s.name==='Register of Members 001');
 const folio=tab.state.book.sheets[folioIndex];
 const nameRow=folio.rows.findIndex(r=>r[0]==='Name:');
 folio.rows.find(r=>r[0]==='Total Shares Held:')[1]='100000';
 const previous=globalThis.window;
 let answer='1';
 globalThis.window={prompt(){return answer}};
 try{
  assert.match(tab.render(),/Set RM\/share/);
  tab.command('sr-set-consideration-rate',folioIndex+':'+nameRow);
  assert.equal(tab.state.book.memberShareRates[folioIndex+':'+nameRow],'1');
  assert(tab.render().includes('RM100,000'));
  folio.rows.find(r=>r[0]==='Total Shares Held:')[1]='200000';
  assert(tab.render().includes('RM200,000'));
  answer='';
  tab.command('sr-set-consideration-rate',folioIndex+':'+nameRow);
  assert(tab.render().includes('Not recorded'));
  assert.equal(tab.state.book.memberShareRates[folioIndex+':'+nameRow],undefined);
  answer='not a rate';
  assert.throws(()=>tab.command('sr-set-consideration-rate',folioIndex+':'+nameRow),
   /valid non-negative RM rate/);
 }finally{globalThis.window=previous;}
});
test('former shareholders show their transfer history but no rate-adjustment button',()=>{
 const b=book();
 b.memberShareRates={'0:1':'1'};
 b.sheets[0].rows[3][1]='01/09/2026';
 const section=buildGroupedRegister(b,0);
 assert(!section.blocks.some(x=>x.label==='Total Share Consideration (Acquisitions)'));
 assert(!renderStatutoryRegisterDocument(b,0).includes('Set RM/share'));
});
