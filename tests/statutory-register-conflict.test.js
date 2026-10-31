import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeStatutoryRegisterEdits} from '../src/statutory-register-conflict.js';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {createRegisterBookTab} from '../src/register-book-tab.js';

const company={id:'c1',name:'TEST COMPANY SDN BHD',registration_no:'202601234567'};
const clone=x=>structuredClone(x);
const original=()=>{
 const b=makeRegisterBook(company);
 b.updatedAt='2026-10-31T00:00:00.000Z';
 return b;
};

test('merges two edits to separate register fields',()=>{
 const base=original(),local=clone(base),remote=clone(base);
 local.sheets[0].rows[0][0]='Local field edit';
 remote.sheets[0].rows[0][1]='Remote field edit';
 remote.updatedAt='2026-10-31T01:00:00.000Z';
 const {book,conflicts}=mergeStatutoryRegisterEdits(base,local,remote);
 assert.deepEqual(conflicts,[]);
 assert.equal(book.sheets[0].rows[0][0],'Local field edit');
 assert.equal(book.sheets[0].rows[0][1],'Remote field edit');
 assert.equal(book.updatedAt,remote.updatedAt);
});

test('rejects overlapping changes to the same statutory field',()=>{
 const base=original(),local=clone(base),remote=clone(base);
 local.sheets[0].rows[0][0]='Local correction';
 remote.sheets[0].rows[0][0]='Different remote correction';
 assert.equal(mergeStatutoryRegisterEdits(base,local,remote).book,null);
});

test('rejects simultaneous structural worksheet changes',()=>{
 const base=original(),local=clone(base),remote=clone(base);
 local.sheets[0].rows.push(['New local entry']);
 remote.sheets[0].rows[0][0]='Remote updated field';
 assert.equal(mergeStatutoryRegisterEdits(base,local,remote).book,null);
});

function fixture(){
 const records=new Map();
 const path='u1/statutory-registers/c1.json';
 records.set(path,new Blob([JSON.stringify(original())],{type:'application/json'}));
 const storage={
  download:async key=>records.has(key)?
   {data:records.get(key),error:null}:
   {data:null,error:{message:'Object not found',statusCode:404}},
  upload:async(key,data)=>{records.set(key,data);return {error:null};}
 };
 const db={
  storage:{from:()=>storage},
  from(){
   const query={select(){return query;},eq(){return query;},is(){return query;},ilike(){return query;},order(){return query;},
    limit:async()=>({data:[],error:null})};
   return query;
  }
 };
 const tab=createRegisterBookTab({db,getUser:()=>({id:'u1'}),getCompanies:()=>[company]});
 return {tab,path,records,read:async()=>JSON.parse(await records.get(path).text())};
}

test('safe save retains independent edits made in another device',async()=>{
 const {tab,path,records,read}=fixture();
 await tab.openCompany(company.id);
 tab.command('sr-sheet','0');
 const saved=await read();
 saved.sheets[0].rows[0][1]='Cloud edit';
 saved.updatedAt='2026-10-31T02:00:00.000Z';
 records.set(path,new Blob([JSON.stringify(saved)]));
 const prevDocument=globalThis.document;
 globalThis.document={getElementById:()=>null};
 try{
  tab.updateCell({dataset:{r:'0',c:'0'},value:'Local edit'});
  await tab.save();
  const combined=await read();
  assert.equal(combined.sheets[0].rows[0][0],'Local edit');
  assert.equal(combined.sheets[0].rows[0][1],'Cloud edit');
  assert.equal(tab.state.conflict,false);
  assert.equal(tab.state.dirty,false);
  assert([...records.keys()].some(k=>k.includes('/history/')),'saves a previous-version backup');
 }finally{globalThis.document=prevDocument;}
});

test('overlapping edits protect cloud version until explicit backed-up recovery',async()=>{
 const {tab,path,records,read}=fixture();
 await tab.openCompany(company.id);
 tab.command('sr-sheet','0');
 const remote=await read();
 remote.sheets[0].rows[0][0]='Cloud change';
 remote.updatedAt='2026-10-31T03:00:00.000Z';
 records.set(path,new Blob([JSON.stringify(remote)]));
 const prevDocument=globalThis.document,prevWindow=globalThis.window;
 globalThis.document={getElementById:()=>null};
 globalThis.window={confirm:()=>true};
 try{
  tab.updateCell({dataset:{r:'0',c:'0'},value:'Local change'});
  await assert.rejects(tab.save(),/overlap/);
  assert.equal(tab.state.conflict,true);
  assert.equal(tab.state.dirty,true);
  assert.equal((await read()).sheets[0].rows[0][0],'Cloud change');
  assert.match(tab.render(),/sr-force-save/);
  await tab.save({force:true});
  assert.equal((await read()).sheets[0].rows[0][0],'Local change');
  const history=[...records.entries()].filter(([k])=>k.includes('/history/'));
  assert.equal(history.length,1);
  assert.equal(JSON.parse(await history[0][1].text()).sheets[0].rows[0][0],'Cloud change');
 }finally{globalThis.document=prevDocument;globalThis.window=prevWindow;}
});
