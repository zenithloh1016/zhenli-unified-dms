import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegisterBookTab} from '../src/register-book-tab.js';
import {makeRegisterBook,sanitizeSheet,validateRegisterBook} from '../src/statutory-register-data.js';

const companies=[
 {id:'c1',name:'ALPHA SDN BHD',registration_no:'202601234567'},
 {id:'c2',name:'BETA SDN BHD',registration_no:'202609876543'}
];
function fixture(custom=companies){
 const blobs=new Map(),written=[];
 const storage={
  list:async()=>({data:[...blobs.keys()].filter(k=>k.startsWith('u1/statutory-registers/'))
   .map(k=>({id:k,name:k.split('/').at(-1)})),error:null}),
  download:async path=>blobs.has(path)?
   {data:blobs.get(path),error:null}:{data:null,error:{message:'Object not found',statusCode:404}},
  upload:async(path,blob)=>{blobs.set(path,blob);written.push(path);return {error:null};}
 };
 const db={storage:{from:()=>storage}};
 const tab=createRegisterBookTab({db,getUser:()=>({id:'u1'}),getCompanies:()=>custom});
 return {tab,blobs,written};
}
test('Statutory Registers replaces the old file directory',()=>{
 const {tab}=fixture();
 const html=tab.render();
 assert.match(html,/Statutory Registers/);
 assert.match(html,/Import Register Book ZIP/);
 assert.match(html,/data-action="sr-open"/);
 assert.doesNotMatch(html,/Folder not yet created/);
 assert.match(html,/ALPHA SDN BHD/);
});
test('opens editable statutory register templates for a company',async()=>{
 const {tab}=fixture();
 await tab.openCompany('c1');
 assert.equal(tab.state.book.companyId,'c1');
 const html=tab.render();
 assert.match(html,/Register of Directors/);
 assert.match(html,/Register of Members/);
 assert.match(html,/Register of Beneficial Owners/);
 assert.match(html,/data-action="sr-save"/);
 assert.match(html,/data-action="sr-pdf"/);
 assert.match(html,/class="rb-cell"/);
});
test('saves edited register privately and reloads it',async()=>{
 const {tab,blobs,written}=fixture();
 await tab.openCompany('c1');
 globalThis.document={getElementById:()=>null};
 assert.equal(tab.updateCell({dataset:{r:'0',c:'0'},value:'Director Name'}),true);
 assert.equal(tab.state.dirty,true);
 await tab.save();
 assert.equal(tab.state.dirty,false);
 assert(written.some(path=>path==='u1/statutory-registers/c1.json'));
 assert(blobs.has('u1/statutory-registers/c1.json'));
 tab.closeCompany();
 await tab.openCompany('c1');
 assert.equal(tab.state.book.sheets[0].rows[0][0],'Director Name');
});
test('directory filters companies and escapes names',()=>{
 const data=[{id:'x',name:'<script>alert(1)</script>',registration_no:'12'},...companies];
 const {tab}=fixture(data);
 let html=tab.render();
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 tab.search('202609876543');
 html=tab.render();
 assert.match(html,/BETA SDN BHD/);
 assert.doesNotMatch(html,/ALPHA SDN BHD/);
});
test('directory pagination and worksheet data validations',()=>{
 const data=Array.from({length:26},(_,i)=>({id:'c'+i,name:'COMPANY '+String(i).padStart(2,'0')}));
 const {tab}=fixture(data);
 assert.match(tab.render(),/COMPANY 00/);
 assert.doesNotMatch(tab.render(),/COMPANY 25/);
 tab.command('rb-next');
 assert.match(tab.render(),/COMPANY 25/);
 const book=makeRegisterBook(companies[0]);
 assert.equal(book.version,1);
 assert(validateRegisterBook(book));
 assert.deepEqual(sanitizeSheet(' Directors ',[['Name','Date'],['Alice','01/01/2026'],['','']]).rows,
  [['Name','Date'],['Alice','01/01/2026']]);
});
