import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAnnualReturnHistory} from '../src/history.js';
import {cloneBlank,deleteParticularField,removeAnnualReturnRecord,removeParticularHeading,
 normalizeDocument,displayParticularLabel} from '../src/core.js';

test('undo and redo restore removed field, heading, and values in order',()=>{
 let form=cloneBlank();
 const history=createAnnualReturnHistory(form);
 const member=form.particulars.findIndex(x=>x.type==='heading'&&x.en==='MEMBER 1');
 const field=form.particulars.findIndex((x,i)=>i>member&&x.type==='field');
 const valueName=form.particulars[field].en;
 form.particulars[field].value='RETAIN THIS VALUE';
 history.capture(form);
 deleteParticularField(form,field);
 history.capture(form);
 assert.equal(form.particulars.some(x=>x.en===valueName&&x.value==='RETAIN THIS VALUE'),false);
 form=history.undo();
 assert.equal(form.particulars[field].value,'RETAIN THIS VALUE');
 form=history.undo();
 assert.equal(form.particulars[field].value,'');
 form=history.redo();
 assert.equal(form.particulars[field].value,'RETAIN THIS VALUE');
 form=history.redo();
 assert.ok(!form.particulars.some(x=>x.en===valueName&&x.value==='RETAIN THIS VALUE'));
 assert.equal(history.state.canRedo,false);
});

test('undo/redo chain is truncated by new edits and resets between companies',()=>{
 let doc=cloneBlank();
 const history=createAnnualReturnHistory(doc,{limit:4});
 for(let i=1;i<=7;i++){
  doc.particulars[1].value=String(i);
  history.capture(doc);
 }
 assert.equal(history.state.length,4);
 assert.equal(history.undo().particulars[1].value,'6');
 assert.equal(history.redo().particulars[1].value,'7');
 const prior=history.undo();
 prior.particulars[1].value='CHANGED';
 history.capture(prior);
 assert.equal(history.state.canRedo,false);
 history.reset(cloneBlank());
 assert.equal(history.state.canUndo,false);
});

test('all Director, Member, and BO record headings can be removed, including their last one',()=>{
 for(const kind of ['DIRECTOR','MEMBER','BENEFICIAL OWNER']){
  const doc=cloneBlank();
  let removed=0;
  while(true){
   const index=doc.particulars.findIndex(x=>x.type==='heading'&&new RegExp('^'+kind+' \\d+$').test(x.en));
   if(index<0)break;
   removeAnnualReturnRecord(doc,index);
   removed++;
  }
  assert.ok(removed>=1);
  assert.ok(!doc.particulars.some(x=>x.type==='heading'&&new RegExp('^'+kind+' \\d+$').test(x.en)));
  assert.ok(normalizeDocument(doc));
 }
});

test('Auditor and Company Secretary headings and member fields remain deleted after draft normalization',()=>{
 const doc=cloneBlank();
 for(const title of ['AUDITOR','COMPANY SECRETARY']){
  const i=doc.particulars.findIndex(x=>x.type==='heading'&&x.en===title);
  assert.ok(i>=0);
  removeParticularHeading(doc,i);
 }
 const fieldIndex=doc.particulars.findIndex(x=>x.type==='field'&&x.en==='Individual NRIC / Passport No.');
 assert.ok(fieldIndex>=0);
 deleteParticularField(doc,fieldIndex);
 const restored=normalizeDocument(doc);
 assert.equal(restored.particulars.some(x=>x.type==='heading'&&x.en==='AUDITOR'),false);
 assert.equal(restored.particulars.some(x=>x.type==='heading'&&x.en==='COMPANY SECRETARY'),false);
 const member=restored.particulars.findIndex(x=>x.type==='heading'&&x.en==='MEMBER 1');
 const next=restored.particulars.findIndex((x,i)=>i>member&&x.type==='heading');
 assert.ok(!restored.particulars.slice(member+1,next).some(x=>x.en==='Individual NRIC / Passport No.'));
});

test('officer sections expand by default and removal uses in-app dialog, not browser confirm',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(main,/startsExpanded=i===0\|\|\/DIRECTORS, COMPANY SECRETARY\|PARTICULARS OF MEMBERS\|CURRENT BENEFICIAL OWNERS/);
 assert.match(main,/const shouldOpen=openSection===group.index/);
 assert.match(main,/function confirmRemoval\(message,action\)/);
 assert.match(main,/modal\.showModal\(\)/);
 assert.match(main,/function applyHistoryChange\(direction\)/);
 assert.match(main,/history\.capture\(doc\)/);
 assert.match(html,/id="undo-ar"/);
 assert.match(html,/id="redo-ar"/);
 assert.match(main,/data-remove-record/);
 assert.match(main,/data-delete-field/);
});
