import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank,importAnnualReturnText,normalizeDocument,outputFilename,emptyCount,populatedCount,SELECT_OPTIONS,BENEFICIAL_OWNER_CRITERIA,criteriaString,selectedCriteria,selectKind,addRepeatGroup,removeRepeatGroup} from '../src/core.js';
test('blank bilingual template has all current structural fields without real client values',()=>{
  const blank=cloneBlank();
  assert.equal(blank.particulars.length,139);
  assert.equal(blank.particulars.filter(x=>x.type==='field').length,121);
  assert.equal(populatedCount(blank),0);
  assert.equal(emptyCount(blank),121);
  assert.ok(blank.particulars.some(x=>x.cn.includes('股权')));
  assert.equal(blank.company.name,'');
  assert.equal(blank.signatureDirector.nric,'');
  assert.ok(!JSON.stringify(blank).includes('CHANG AI NEE'));
});
test('imports JSON-compatible Google Apps Script without executing arbitrary JS',()=>{
  const script='const AR_SINGLE_COMPANY = '+JSON.stringify({
    company:{name:'EXAMPLE TEST SDN. BHD.',no:'202601000001',arYear:'2027',arDate:'01/02/2027'},
    particulars:[{type:'section',en:'COMPANY INFORMATION',cn:'公司资料'},
      {type:'field',en:'Registered Office',cn:'注册办事处',value:'Test address'}]
  },null,2)+';\nconst AR_SIGNATURE_DIRECTOR = '+JSON.stringify({name:'TEST DIRECTOR',nric:'TEST-ONLY'})+';\n';
  const actual=importAnnualReturnText(script,'test.gs');
  assert.equal(actual.company.name,'EXAMPLE TEST SDN. BHD.');
  assert.equal(actual.signatureDirector.name,'TEST DIRECTOR');
  assert.equal(actual.particulars[1].value,'Test address');
  assert.equal(outputFilename(actual),'EXAMPLE TEST SDN. BHD. - Annual Return 2027 Review.pdf');
});
test('rejects malformed or unsafe scripts and maintains editable draft JSON',()=>{
  assert.throws(()=>importAnnualReturnText('const AR_SINGLE_COMPANY = {}; alert(1);','bad.gs'),/Expected/);
  const draft=cloneBlank();draft.company.name='SAMPLE SDN. BHD.';draft.particulars[1].value='Test';
  const recovered=importAnnualReturnText(JSON.stringify(draft),'save.json');
  assert.equal(recovered.company.name,'SAMPLE SDN. BHD.');
  assert.equal(recovered.particulars[1].value,'Test');
  assert.equal(normalizeDocument(draft).particulars.length,139);
});

test('select choices and multi-select beneficial owner criteria A–D retain statutory descriptions',()=>{
 assert.deepEqual(SELECT_OPTIONS.shareConsideration,['Cash','Otherwise than cash','Cash & otherwise than cash']);
 assert.deepEqual(SELECT_OPTIONS.shareClass,['Ordinary','Preference','Ordinary & Preference']);
 assert.deepEqual(SELECT_OPTIONS.ownershipType,['Direct','Indirect','Direct & Indirect']);
 assert.equal(BENEFICIAL_OWNER_CRITERIA.length,4);
 assert.ok(BENEFICIAL_OWNER_CRITERIA.find(x=>x.code==='A').description.includes('20%'));
 assert.equal(selectKind('Class of Shares'),'shareClass');
 assert.equal(selectKind('Criteria of Beneficial Ownership'),'criteria');
 const selected=criteriaString(['A','C','D']);
 assert.deepEqual(selectedCriteria(selected),['A','C','D']);
 assert.deepEqual(selectedCriteria('Criteria A, Criteria B'),['A','B']);
 assert.deepEqual(selectedCriteria(''),[]);
});
test('adds charges, directors, members and BOs under correct sections without destroying other entries',()=>{
 const doc=cloneBlank();
 for(const [kind,heading,after] of [
   ['charge','REGISTERED CHARGE 2','Number of Registered Charges'],
   ['director','DIRECTOR 5','COMPANY SECRETARY'],
   ['member','MEMBER 3','PARTICULARS OF CURRENT BENEFICIAL OWNERS'],
   ['beneficialOwner','BENEFICIAL OWNER 2','COMPANY REVIEW AND VERIFICATION NOTES']
 ]){
   const before=doc.particulars.length;
   const next=addRepeatGroup(doc,kind);
   const at=doc.particulars.findIndex(x=>x.en===heading);
   const later=doc.particulars.findIndex(x=>x.en===after);
   assert.ok(at>=0,heading);
   assert.ok(at<later,kind+' inserted after boundary');
   assert.equal(doc.particulars[at].generated,true);
   assert.equal(doc.particulars[at+1].value,'');
   assert.ok(doc.particulars.length>before);
   assert.equal(next.number,Number(heading.match(/\d+$/)[0]));
 }
 const director=doc.particulars.findIndex(x=>x.en==='DIRECTOR 5');
 const count=doc.particulars.length;
 removeRepeatGroup(doc,director);
 assert.equal(doc.particulars.length<count,true);
 assert.equal(doc.particulars.some(x=>x.en==='DIRECTOR 5'),false);
 assert.throws(()=>removeRepeatGroup(doc,doc.particulars.findIndex(x=>x.en==='DIRECTOR 1')),/Only added/);
});
test('new entries and signing acknowledgement round-trip in JSON backup and old GS',()=>{
 const doc=cloneBlank();
 addRepeatGroup(doc,'beneficialOwner');
 const bo=doc.particulars.findIndex(x=>x.en==='BENEFICIAL OWNER 2');
 doc.particulars[bo+1].value='TEST BENEFICIAL OWNER';
 doc.signatureDirector.acknowledged=true;
 const restored=importAnnualReturnText(JSON.stringify(doc),'test.json');
 assert.equal(restored.particulars[bo].generated,true);
 assert.equal(restored.particulars[bo+1].value,'TEST BENEFICIAL OWNER');
 assert.equal(restored.signatureDirector.acknowledged,true);
 const old=importAnnualReturnText('const AR_SINGLE_COMPANY = '+JSON.stringify({
  company:{name:'TEST SDN BHD'},particulars:[
   {type:'section',en:'SECTION B - SHARE CAPITAL AND SHAREHOLDING',cn:''},
   {type:'field',en:'Classes of Shares Issued',cn:'',value:'Ordinary'}
  ]})+';','old.gs');
 assert.ok(old.particulars.some(x=>x.en==='Type of Shares (Consideration)'));
 assert.equal(old.particulars.find(x=>x.en==='Classes of Shares Issued').value,'Ordinary');
});
