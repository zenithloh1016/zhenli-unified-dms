import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank,normalizeDocument,removeAnnualReturnRecord} from '../src/core.js';
import {saveAnnualReturnDraft,readAnnualReturnDraft,listAnnualReturnDrafts,removeAnnualReturnDraft,draftIdOfKey} from '../src/drafts.js';

function memoryStorage(){
 const m=new Map();
 return {get length(){return m.size;},key:i=>[...m.keys()][i]??null,
  getItem:key=>m.has(key)?m.get(key):null,
  setItem:(key,val)=>m.set(String(key),String(val)),
  removeItem:key=>m.delete(String(key))};
}
const headers=(doc,pattern)=>doc.particulars.map((x,i)=>({x,i}))
 .filter(({x})=>x.type==='heading'&&pattern.test(x.en||''));
test('removing extra directors keeps secretary and auditor untouched and renumbers directors',()=>{
 const doc=cloneBlank();
 assert.equal(headers(doc,/^DIRECTOR \d+$/).length,4);
 const secretaryBefore=doc.particulars.find(x=>x.en==='Secretary Name')?.value??'';
 const auditorBefore=doc.particulars.find(x=>x.en==='Audit Firm Name')?.value??'';
 const second=headers(doc,/^DIRECTOR \d+$/)[1].i;
 const out=removeAnnualReturnRecord(doc,second);
 assert.equal(out.kind,'director');
 assert.equal(out.remaining,3);
 assert.deepEqual(headers(doc,/^DIRECTOR \d+$/).map(x=>x.x.en),['DIRECTOR 1','DIRECTOR 2','DIRECTOR 3']);
 assert.equal(doc.particulars.find(x=>x.en==='Secretary Name')?.value,secretaryBefore);
 assert.equal(doc.particulars.find(x=>x.en==='Audit Firm Name')?.value,auditorBefore);
 removeAnnualReturnRecord(doc,headers(doc,/^DIRECTOR \d+$/)[2].i);
 removeAnnualReturnRecord(doc,headers(doc,/^DIRECTOR \d+$/)[1].i);
 assert.equal(headers(doc,/^DIRECTOR \d+$/).length,1);
 assert.throws(()=>removeAnnualReturnRecord(doc,headers(doc,/^DIRECTOR \d+$/)[0].i),/At least one director/);
});
test('removing excess Members retains other member and BO blocks',()=>{
 const doc=cloneBlank();
 const members=headers(doc,/^MEMBER \d+$/);
 assert.equal(members.length,2);
 const remaining=removeAnnualReturnRecord(doc,members[0].i);
 assert.equal(remaining.remaining,1);
 assert.deepEqual(headers(doc,/^MEMBER \d+$/).map(x=>x.x.en),['MEMBER 1']);
 assert.equal(headers(doc,/^BENEFICIAL OWNER \d+$/).length,1);
 assert.throws(()=>removeAnnualReturnRecord(doc,headers(doc,/^MEMBER \d+$/)[0].i),/At least one member/);
});
test('zero BO entries is supported in saved draft without recreating a removed record',()=>{
 const doc=cloneBlank();const first=headers(doc,/^BENEFICIAL OWNER \d+$/)[0];
 assert.ok(first);
 const out=removeAnnualReturnRecord(doc,first.i);
 assert.equal(out.remaining,0);
 assert.equal(headers(doc,/^BENEFICIAL OWNER \d+$/).length,0);
 assert.equal(headers(normalizeDocument(doc),/^BENEFICIAL OWNER \d+$/).length,0);
});
test('device draft save and resume is segregated by DMS account and company',()=>{
 const storage=memoryStorage(),doc=cloneBlank();
 const first=doc.particulars.find(x=>x.en==='Company Name');
 first.value='DEMO ONE SDN. BHD.';doc.company.name=first.value;doc.company.no='202601111111';
 doc.particulars.find(x=>x.en==='Company Registration No.').value=doc.company.no;
 const saved=saveAnnualReturnDraft(storage,'dms:user-A','company-A',doc);
 assert.equal(listAnnualReturnDrafts(storage,'dms:user-A').length,1);
 assert.equal(listAnnualReturnDrafts(storage,'dms:user-B').length,0);
 assert.equal(readAnnualReturnDraft(storage,'dms:user-A','company-A').data.company.name,'DEMO ONE SDN. BHD.');
 assert.equal(readAnnualReturnDraft(storage,'dms:user-A','company-B'),null);
 assert.equal(draftIdOfKey(saved.key,'dms:user-A'),'company-A');
 assert.throws(()=>removeAnnualReturnDraft(storage,saved.key,'dms:user-B'),/outside this user workspace/);
 removeAnnualReturnDraft(storage,saved.key,'dms:user-A');
 assert.equal(listAnnualReturnDrafts(storage,'dms:user-A').length,0);
});
test('saved draft preserves reduced company records without TIN, review notes or signing date',()=>{
 const storage=memoryStorage(),draft=cloneBlank();
 removeAnnualReturnRecord(draft,headers(draft,/^DIRECTOR \d+$/)[3].i);
 removeAnnualReturnRecord(draft,headers(draft,/^MEMBER \d+$/)[1].i);
 removeAnnualReturnRecord(draft,headers(draft,/^BENEFICIAL OWNER \d+$/)[0].i);
 draft.company.name='TEST COMPANY SDN. BHD.';
 draft.signatureDirector={name:'Demo Director',nric:'TEST-ONLY',designation:'Director',date:'2026-10-18',acknowledgement:'legacy field'};
 saveAnnualReturnDraft(storage,'standalone','draft-1',draft);
 const recovered=readAnnualReturnDraft(storage,'standalone','draft-1').data;
 assert.equal(headers(recovered,/^DIRECTOR \d+$/).length,3);
 assert.equal(headers(recovered,/^MEMBER \d+$/).length,1);
 assert.equal(headers(recovered,/^BENEFICIAL OWNER \d+$/).length,0);
 assert.equal(recovered.particulars.some(x=>/^(?:TIN|Tax Identification Number|COMPANY REVIEW AND VERIFICATION)/i.test(x.en||'')),false);
 assert.equal('date' in recovered.signatureDirector,false);
 assert.equal('acknowledgement' in recovered.signatureDirector,false);
});
