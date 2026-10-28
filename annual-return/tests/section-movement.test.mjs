import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloneBlank,moveParticularSection,normalizeDocument} from '../src/core.js';
import {createAnnualReturnHistory} from '../src/history.js';
import {readAnnualReturnDraft,saveAnnualReturnDraft} from '../src/drafts.js';

const sections=doc=>doc.particulars.map((item,index)=>({item,index}))
 .filter(x=>x.item.type==='section');
const sectionContents=(doc,title)=>{
 const headers=sections(doc),start=headers.find(x=>x.item.en===title)?.index;
 assert.notEqual(start,undefined,'section must exist');
 const end=headers.find(x=>x.index>start)?.index??doc.particulars.length;
 return doc.particulars.slice(start,end);
};
const sectionNames=doc=>sections(doc).map(x=>x.item.en);
const store=()=>{
 const m=new Map();
 return {
  get length(){return m.size;},
  key:i=>[...m.keys()][i]??null,
  getItem:key=>m.get(key)??null,
  setItem:(key,value)=>m.set(String(key),String(value)),
  removeItem:key=>m.delete(String(key))
 };
};

test('drag section before another: headings, fields, labels and values move as one block',()=>{
 const doc=cloneBlank(),headers=sections(doc);
 const from=headers.find(x=>/REGISTERED CHARGES/i.test(x.item.en)).index;
 const to=headers.find(x=>/COMPANY DETAILS/i.test(x.item.en)).index;
 const title=doc.particulars[from].en;
 const original=sectionContents(doc,title);
 original.find(x=>x.type==='field').value='SAVED-CHARGE-DETAIL';
 const count=doc.particulars.length;
 const result=moveParticularSection(doc,from,to);
 assert.equal(result.moved,true);
 assert.equal(doc.particulars.length,count);
 assert.equal(sectionNames(doc)[0],title);
 const after=sectionContents(doc,title);
 assert.equal(after.length,original.length);
 assert.deepEqual(after,original);
 assert.ok(after.some(x=>x.type==='heading'&&x.en==='REGISTERED CHARGE 1'));
 assert.ok(after.some(x=>x.value==='SAVED-CHARGE-DETAIL'));
 assert.deepEqual(normalizeDocument(doc).particulars.slice(0,after.length),original);
});

test('move last section after another and back using distinct drop positions',()=>{
 const doc=cloneBlank(),original=sectionNames(doc);
 assert.ok(original.length>=5);
 let headers=sections(doc);
 const last=headers.at(-1),first=headers[0];
 const result=moveParticularSection(doc,last.index,first.index,{after:true});
 assert.equal(result.moved,true);
 assert.equal(sectionNames(doc)[1],last.item.en);
 assert.equal(sectionNames(doc).at(-1),original.at(-2));
 headers=sections(doc);
 const moved=headers.find(x=>x.item.en===last.item.en),previousLast=headers.at(-1);
 assert.equal(moveParticularSection(doc,moved.index,previousLast.index,{after:true}).moved,true);
 assert.deepEqual(sectionNames(doc),original);
});

test('no-op and invalid section moves preserve all original particulars',()=>{
 const doc=cloneBlank(),before=JSON.stringify(doc);
 const headers=sections(doc);
 assert.equal(moveParticularSection(doc,headers[0].index,headers[0].index).moved,false);
 assert.equal(moveParticularSection(doc,headers[0].index,headers[1].index).moved,false);
 assert.equal(moveParticularSection(doc,headers[1].index,headers[0].index,{after:true}).moved,false);
 assert.equal(JSON.stringify(doc),before);
 const fieldIndex=doc.particulars.findIndex(x=>x.type==='field');
 assert.throws(()=>moveParticularSection(doc,fieldIndex,headers[1].index),/Select a section/);
 assert.throws(()=>moveParticularSection(doc,headers[0].index,fieldIndex),/Drop onto another section/);
 assert.equal(JSON.stringify(doc),before);
});

test('section rearrangement persists in a draft and is Undo/Redo-able',()=>{
 const doc=cloneBlank();
 const startOrder=sectionNames(doc);
 const history=createAnnualReturnHistory(doc);
 const first=sections(doc)[0].index,last=sections(doc).at(-1).index;
 assert.equal(moveParticularSection(doc,first,last,{after:true}).moved,true);
 history.capture(doc);
 const changed=sectionNames(doc);
 assert.notDeepEqual(changed,startOrder);
 assert.deepEqual(sectionNames(history.undo()),startOrder);
 assert.deepEqual(sectionNames(history.redo()),changed);
 const local=store();
 doc.company.name='RSSH SERVICES SDN BHD';
 saveAnnualReturnDraft(local,'dms:test-user','rssh',doc);
 const restored=readAnnualReturnDraft(local,'dms:test-user','rssh').data;
 assert.deepEqual(sectionNames(restored),changed);
});

test('browser editor offers touch drag and up/down, keeps section PDF order',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 const pdf=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
 assert.match(main,/data-drag-section/);
 assert.match(main,/data-shift-section/);
 assert.match(main,/function commitSectionMove/);
 assert.match(main,/moveParticularSection\(doc,from,target,\{after\}\)/);
 assert.match(main,/setPointerCapture\(event\.pointerId\)/);
 assert.match(main,/pointercancel/);
 assert.match(main,/renderSections\(\);queueDraftSave\(\)/);
 assert.match(css,/ar-section-drag-handle/);
 assert.match(css,/touch-action:none/);
 assert.match(css,/ar-section-drop-before/);
 assert.match(css,/ar-section-drop-after/);
 assert.match(pdf,/for\(const \[index,item\] of \(doc\.particulars\|\|\[\]\)\.entries\(\)\)/);
});
