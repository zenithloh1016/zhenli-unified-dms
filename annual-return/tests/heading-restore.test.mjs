import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloneBlank,insertParticularHeading,restoreRsshAuditorHeading,
 removeParticularHeading,normalizeDocument} from '../src/core.js';
import {createAnnualReturnHistory} from '../src/history.js';
import {saveAnnualReturnDraft,readAnnualReturnDraft} from '../src/drafts.js';

function makeStorage(){
 const files=new Map();
 return {get length(){return files.size;},key:i=>[...files.keys()][i]??null,
  getItem:key=>files.get(key)??null,setItem:(key,val)=>files.set(String(key),String(val)),
  removeItem:key=>files.delete(key)};
}

test('Add Heading inserts bilingual heading in a chosen section and keeps existing records intact',()=>{
 const doc=cloneBlank();
 const director=doc.particulars.findIndex(x=>x.type==='heading'&&x.en==='DIRECTOR 1');
 const original=doc.particulars[director+1];
 original.value='Director Person';
 const section=doc.particulars.findIndex(x=>x.type==='section'&&/PARTICULARS OF MEMBERS/.test(x.en));
 const next=doc.particulars.findIndex((x,i)=>i>section&&x.type==='section');
 const result=insertParticularHeading(doc,section,'ADDITIONAL REVIEW','补充审核');
 assert.equal(result.index,next);
 assert.equal(doc.particulars[next].type,'heading');
 assert.equal(doc.particulars[next].cn,'补充审核');
 assert.equal(doc.particulars.find(x=>x.en==='Full Name'),original);
 assert.equal(original.value,'Director Person');
 const restored=normalizeDocument(doc);
 assert.ok(restored.particulars.some(x=>x.en==='ADDITIONAL REVIEW'&&x.cn==='补充审核'));
 assert.throws(()=>insertParticularHeading(doc,-1,'Invalid'),/valid section/);
 assert.throws(()=>insertParticularHeading(doc,section,'  '),/heading name/);
});

test('RSSH SERVICES Auditor restoration recovers template fields once, without modifying others',()=>{
 const doc=cloneBlank();
 doc.company.name='RSSH SERVICES SDN BHD';
 const audit=doc.particulars.findIndex(x=>x.type==='heading'&&x.en==='AUDITOR');
 const auditorFields=doc.particulars.slice(audit+1,doc.particulars.findIndex((x,i)=>i>audit&&x.type!=='field')).map(x=>x.en);
 const secretary=doc.particulars.find(x=>x.en==='Secretary Name');
 secretary.value='EXISTING SECRETARY';
 removeParticularHeading(doc,audit);
 assert.ok(!doc.particulars.some(x=>x.type==='heading'&&x.en==='AUDITOR'));
 const history=createAnnualReturnHistory(doc);
 const result=restoreRsshAuditorHeading(doc);
 assert.equal(result.restored,true);
 assert.equal(result.addedFields,auditorFields.length);
 const auditorIndex=doc.particulars.findIndex(x=>x.type==='heading'&&x.en==='AUDITOR');
 assert.ok(auditorIndex>=0);
 assert.deepEqual(doc.particulars.slice(auditorIndex+1,auditorIndex+1+auditorFields.length).map(x=>x.en),auditorFields);
 assert.equal(doc.particulars.find(x=>x.en==='Secretary Name').value,'EXISTING SECRETARY');
 const after=doc.particulars.findIndex((x,i)=>i>auditorIndex&&x.type==='section');
 assert.equal(doc.particulars[after].en,'SECTION E - PARTICULARS OF MEMBERS');
 assert.equal(restoreRsshAuditorHeading(doc).restored,false);
 history.capture(doc);
 assert.ok(!history.undo().particulars.some(x=>x.type==='heading'&&x.en==='AUDITOR'));
 assert.ok(history.redo().particulars.some(x=>x.type==='heading'&&x.en==='AUDITOR'));
 const store=makeStorage();
 saveAnnualReturnDraft(store,'dms:tester','company-rssh',doc);
 assert.ok(readAnnualReturnDraft(store,'dms:tester','company-rssh').data.particulars.some(x=>x.type==='heading'&&x.en==='AUDITOR'));
});

test('RSSH recovery is strictly scoped and never overwrites another company',()=>{
 const doc=cloneBlank();
 const auditor=doc.particulars.findIndex(x=>x.type==='heading'&&x.en==='AUDITOR');
 removeParticularHeading(doc,auditor);
 doc.company.name='TOPGEN RESOURCES SDN BHD';
 const before=JSON.stringify(doc);
 assert.deepEqual(restoreRsshAuditorHeading(doc),{restored:false,reason:'different-company'});
 assert.equal(JSON.stringify(doc),before);
 doc.company.name='RSSH SERVICES SDN BHD';
 assert.equal(restoreRsshAuditorHeading(doc).restored,true);
 assert.equal(restoreRsshAuditorHeading(doc).reason,'already-present');
});

test('heading controls and device-local RSSH one-time recovery are exposed in the editor',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="add-heading"/);
 assert.match(main,/data-add-heading-to-section/);
 assert.match(main,/insertParticularHeading\(doc,sectionIndex,en,cn\)/);
 assert.match(main,/addReviewHeading\(Number\(addHeading.dataset.addHeadingToSection\)\)/);
 assert.match(main,/restoreRsshAuditorHeading\(doc\)/);
 assert.match(main,/function restoreRsshSavedDraftOnce\(\)/);
 assert.match(main,/restoreRsshSavedDraftOnce\(\);/);
 assert.match(main,/data-restore-rssh-auditor/);
 assert.match(main,/saveDraftNow\(\{quiet:true\}\)/);
});
