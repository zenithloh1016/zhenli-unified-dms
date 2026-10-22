import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegisterBookTab} from '../src/register-book-tab.js';

const companies=[
 {id:'c1',name:'ALPHA SDN BHD',registration_no:'202601234567'},
 {id:'c2',name:'BETA SDN BHD',registration_no:'202609876543'}
];

function fixture({folders=[{id:'f1',company_id:'c1',name:'Register Book'}],documents=[{folder_id:'f1'},{folder_id:'f1'}]}={}){
 const reads=[];
 const db={from(table){
  const q={
   select(){return q;},
   in(field,ids){reads.push({table,field,ids});return q;},
   is(){return q;},ilike(){return q;},
   limit(){return Promise.resolve({data:folders,error:null});},
   range(){return Promise.resolve({data:documents,error:null});}
  };return q;
 }};
 const tab=createRegisterBookTab({db,getUser:()=>({id:'u1'}),getCompanies:()=>companies});
 return {tab,reads};
}

test('shows a dedicated Register Book ZIP import action and directory',()=>{
 const {tab}=fixture();
 const html=tab.render();
 assert.match(html,/Register Book ZIP/);
 assert.match(html,/data-action="register-zip"/);
 assert.match(html,/ALPHA SDN BHD/);
 assert.match(html,/BETA SDN BHD/);
 assert.match(html,/data-action="rb-open" data-id="c1"/);
});

test('loads existing folder and document totals from private DMS tables',async()=>{
 const {tab,reads}=fixture();
 await tab.load();
 const html=tab.render();
 assert.equal(tab.state.loaded,true);
 assert.equal(tab.state.counts.get('f1'),2);
 assert.match(html,/2 files/);
 assert.match(html,/No files yet|Folder not yet created/);
 assert(reads.some(x=>x.table==='folders'&&x.field==='company_id'));
 assert(reads.some(x=>x.table==='documents'&&x.field==='folder_id'));
});

test('filters companies by name and registration number',()=>{
 const {tab}=fixture();
 tab.search('202609876543');
 const html=tab.render();
 assert.match(html,/BETA SDN BHD/);
 assert.doesNotMatch(html,/ALPHA SDN BHD/);
});

test('escapes imported company names before inserting into HTML',()=>{
 const data=[{id:'unsafe',name:'<script>alert(1)</script>',registration_no:'12'}];
 const tab=createRegisterBookTab({db:{},getUser:()=>({id:'u1'}),getCompanies:()=>data});
 const html=tab.render();
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});

test('paginates large company directories',()=>{
 const data=Array.from({length:26},(_,i)=>({id:'c'+i,name:'COMPANY '+String(i).padStart(2,'0')}));
 const tab=createRegisterBookTab({db:{},getUser:()=>({id:'u1'}),getCompanies:()=>data});
 assert.match(tab.render(),/COMPANY 00/);
 assert.doesNotMatch(tab.render(),/COMPANY 25/);
 tab.changePage(1);
 assert.match(tab.render(),/COMPANY 25/);
 assert.doesNotMatch(tab.render(),/COMPANY 00/);
});
