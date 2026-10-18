import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDraftStore} from '../src/draft-storage.js';
import {cloneBlank,normalizeDocument} from '../src/core.js';

function memoryStorage(){
 const data=new Map();
 return {
  getItem:key=>data.get(key)??null,
  setItem:(key,value)=>{data.set(key,String(value));},
  removeItem:key=>data.delete(key)
 };
}
test('DMS local drafts can save and resume field changes with company and year metadata',()=>{
 const store=createDraftStore(memoryStorage());
 const doc=cloneBlank();
 doc.particulars.find(x=>x.en==='Company Name').value='TEST COMPANY SDN. BHD.';
 doc.particulars.find(x=>x.en==='Company Registration No.').value='202601234567';
 doc.particulars.find(x=>x.en==='Annual Return Year').value='2027';
 doc.particulars.find(x=>x.en==='Amount Considered Paid on Non-Cash Allotment').value='RM 5,000';
 doc.company={name:'TEST COMPANY SDN. BHD.',no:'202601234567',arYear:'2027',arDate:''};
 store.save('dms:account1','test-draft',normalizeDocument(doc),'company-uuid');
 const [meta]=store.list('dms:account1');
 assert.equal(meta.companyId,'company-uuid');
 assert.equal(meta.year,'2027');
 assert.equal(meta.companyName,'TEST COMPANY SDN. BHD.');
 assert.equal(store.load('dms:account1','test-draft').particulars.find(x=>x.en==='Amount Considered Paid on Non-Cash Allotment').value,'RM 5,000');
});
test('same draft id in different DMS user workspaces remains private and independent',()=>{
 const store=createDraftStore(memoryStorage()),doc=cloneBlank();
 doc.company.name='ALPHA TEST',doc.particulars.find(x=>x.en==='Company Name').value='ALPHA TEST';
 store.save('dms:accountA','shared-id',normalizeDocument(doc),'company-A');
 doc.company.name='BETA TEST';doc.particulars.find(x=>x.en==='Company Name').value='BETA TEST';
 store.save('dms:accountB','shared-id',normalizeDocument(doc),'company-B');
 assert.equal(store.load('dms:accountA','shared-id').company.name,'ALPHA TEST');
 assert.equal(store.load('dms:accountB','shared-id').company.name,'BETA TEST');
 assert.equal(store.list('dms:accountA').length,1);
 assert.equal(store.remove('dms:accountA','shared-id'),true);
 assert.equal(store.load('dms:accountA','shared-id'),null);
 assert.equal(store.list('dms:accountB').length,1);
});
test('empty or cleared drafts retain their saved identity and structural changes',()=>{
 const store=createDraftStore(memoryStorage());
 const doc=cloneBlank();
 doc.particulars.splice(20,1);
 store.save('standalone','blank-1',normalizeDocument(doc));
 assert.equal(store.load('standalone','blank-1').particulars.length,128);
 doc.particulars.find(x=>x.en==='Company Name').value='TEMP TEST';
 store.save('standalone','blank-1',normalizeDocument(doc));
 assert.equal(store.list('standalone').length,1);
 doc.particulars.find(x=>x.en==='Company Name').value='';
 store.save('standalone','blank-1',normalizeDocument(doc));
 assert.equal(store.load('standalone','blank-1').particulars.find(x=>x.en==='Company Name').value,'');
});
test('damaged storage is never overwritten without warning',()=>{
 const storage=memoryStorage(),store=createDraftStore(storage);
 storage.setItem('zhenli:annual-return:saved-drafts:v1','{not-json}');
 assert.throws(()=>store.save('standalone','draft',normalizeDocument(cloneBlank())),/could not be read/i);
 assert.equal(storage.getItem('zhenli:annual-return:saved-drafts:v1'),'{not-json}');
});
test('Annual Return website and DMS omit the JSON import/export controls and prompts',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const child=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const parent=readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
 assert.ok(html.includes('id="save-draft"'));
 assert.ok(html.includes('id="show-drafts"'));
 assert.ok(!html.includes('id="import-file"'));
 assert.ok(!html.includes('id="export-json"'));
 assert.ok(!child.includes('Export editable JSON'));
 assert.ok(!child.includes('export unfinished JSON'));
 assert.ok(parent.includes("ZHENLI_DMS_AR_WORKSPACE"));
 assert.ok(parent.includes("flushAnnualReturnDraft()"));
 assert.ok(parent.includes('Saved Drafts'));
 assert.ok(!parent.includes('by exporting editable JSON'));
});
