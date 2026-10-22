import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegisterBookTab} from '../src/register-book-tab.js';
import {makeRegisterBook} from '../src/statutory-register-data.js';

const company={id:'co1',name:'DEMO SDN BHD',registration_no:'202601111111'};
function fixture({preloaded=true}={}){
 const files=new Map(),writes=[];
 if(preloaded){
  const starting=makeRegisterBook(company);
  starting.sheets[0].rows[0][0]='Before my edits';
  files.set('u1/statutory-registers/co1.json',
   new Blob([JSON.stringify(starting)],{type:'application/json'}));
 }
 const storage={
  list:async(prefix,{limit=1000,offset=0,search=''}={})=>{
   const items=[...files.keys()]
    .filter(key=>key.startsWith(prefix+'/'))
    .map(key=>({name:key.split('/').at(-1),id:'mock-id',
     created_at:new Date(+(key.match(/-(\d{13})-/)||[])[1]||Date.now()).toISOString()}))
    .filter(f=>f.name.includes(search))
    .sort((a,b)=>b.name.localeCompare(a.name))
    .slice(offset,offset+limit);
   return {data:items,error:null};
  },
  download:async key=>files.has(key)?
   {data:files.get(key),error:null}:
   {data:null,error:{message:'Object not found',statusCode:404}},
  upload:async(key,blob)=>{
   files.set(key,blob);writes.push(key);return {error:null};
  }
 };
 const db={storage:{from:()=>storage},from(){
  const q={select(){return q;},eq(){return q;},is(){return q;},ilike(){return q;},order(){return q;},
   limit:async()=>({data:[],error:null})};return q;
 }};
 const tab=createRegisterBookTab({db,getUser:()=>({id:'u1'}),getCompanies:()=>[company]});
 return {tab,files,writes};
}
function mockBrowser(){
 const original={window:globalThis.window,document:globalThis.document};
 globalThis.window={confirm:()=>true,prompt:()=>''};
 globalThis.document={getElementById:()=>null};
 return ()=>{globalThis.window=original.window;globalThis.document=original.document;};
}
test('Unsaved Statutory Registers can be discarded without overwriting saved version',async()=>{
 const undo=mockBrowser();
 try{
  const {tab,files,writes}=fixture();
  await tab.openCompany('co1');
  tab.updateCell({dataset:{s:'0',r:'0',c:'0'},value:'Unsaved typo'});
  assert.equal(tab.state.dirty,true);
  assert.match(tab.render(),/Discard Unsaved Edits/);
  await tab.discardUnsaved();
  assert.equal(tab.state.dirty,false);
  assert.equal(tab.state.book.sheets[0].rows[0][0],'Before my edits');
  assert.equal(writes.length,0);
  assert(JSON.stringify(await files.get('u1/statutory-registers/co1.json').text()).includes('Before my edits'));
 }finally{undo();}
});
test('Preview and restore previously saved company registers with a fresh reversible backup',async()=>{
 const undo=mockBrowser();
 try{
  const {tab,files,writes}=fixture();
  await tab.openCompany('co1');
  assert.match(tab.render(),/Previous Versions/);
  tab.updateCell({dataset:{s:'0',r:'0',c:'0'},value:'Changed information'});
  await tab.save();
  assert.equal(tab.state.book.sheets[0].rows[0][0],'Changed information');
  const countBeforeRestore=writes.filter(k=>k.includes('/history/')).length;
  assert.equal(countBeforeRestore,1);
  await tab.openHistory();
  assert.equal(tab.state.historyOpen,true);
  assert.equal(tab.state.historyItems.length,1);
  assert.match(tab.render(),/Preview Version/);
  const filename=tab.state.historyItems[0].name;
  await tab.previewHistory(filename);
  assert.equal(tab.state.historyPreview.sheets[0].rows[0][0],'Before my edits');
  assert.match(tab.render(),/Restore This Version/);
  await tab.restoreHistory();
  assert.equal(tab.state.historyOpen,false);
  assert.equal(tab.state.book.sheets[0].rows[0][0],'Before my edits');
  assert.equal(tab.state.dirty,false);
  const json=JSON.parse(await files.get('u1/statutory-registers/co1.json').text());
  assert.equal(json.sheets[0].rows[0][0],'Before my edits');
  const backups=writes.filter(k=>k.includes('/history/'));
  assert.equal(backups.length,2);
  const replaced=JSON.parse(await files.get(backups.at(-1)).text());
  assert.equal(replaced.sheets[0].rows[0][0],'Changed information');
 }finally{undo();}
});
test('Restore cannot silently overwrite a newer version saved on another device',async()=>{
 const undo=mockBrowser();
 try{
  const {tab,files,writes}=fixture();
  await tab.openCompany('co1');
  tab.updateCell({dataset:{s:'0',r:'0',c:'0'},value:'My saved edit'});
  await tab.save();
  await tab.openHistory();
  await tab.previewHistory(tab.state.historyItems[0].name);
  const key='u1/statutory-registers/co1.json';
  const current=JSON.parse(await files.get(key).text());
  current.updatedAt='2030-01-01T12:00:00.000Z';
  current.sheets[0].rows[0][0]='Edited on other device';
  files.set(key,new Blob([JSON.stringify(current)]));
  const before=writes.length;
  await assert.rejects(tab.restoreHistory(),/updated on another device/);
  assert.equal(writes.length,before);
  assert.equal(JSON.parse(await files.get(key).text()).sheets[0].rows[0][0],
   'Edited on other device');
  assert.equal(tab.state.historyOpen,true);
 }finally{undo();}
});
test('No saved backup shows helpful guidance without fabricating a previous version',async()=>{
 const undo=mockBrowser();
 try{
  const {tab}=fixture({preloaded:false});
  await tab.openCompany('co1');
  await tab.openHistory();
  assert.equal(tab.state.historyItems.length,0);
  assert.match(tab.render(),/No earlier saved versions were found/);
 }finally{undo();}
});
