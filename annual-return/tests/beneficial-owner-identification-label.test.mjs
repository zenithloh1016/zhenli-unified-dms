import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank,normalizeDocument,displayParticularLabel} from '../src/core.js';
import legacySchema from '../../annual-return-app/schema.json' with {type:'json'};

test('new Annual Return templates show NRIC / Passport No. in Beneficial Owners only',()=>{
  for(const records of [cloneBlank().particulars,legacySchema.fields]){
    let inBo=false,seen=0;
    for(const row of records){
      if(row.type==='section')inBo=/PARTICULARS OF (?:CURRENT )?BENEFICIAL OWNERS/i.test(row.en);
      if(inBo&&row.type==='field'&&/NRIC|Passport/.test(row.en)){
        assert.equal(row.en,'NRIC / Passport No.');
        assert.equal(row.cn,'身份证 / 护照号码');
        seen++;
      }
    }
    assert.ok(seen>0);
  }
});

test('older and cached Annual Return drafts normalize BO label without altering identification values',()=>{
  const draft=cloneBlank();
  const boSection=draft.particulars.findIndex(x=>x.type==='section'&&/CURRENT BENEFICIAL OWNERS/.test(x.en));
  const boField=draft.particulars.find((x,i)=>i>boSection&&x.type==='field'&&x.en==='NRIC / Passport No.');
  assert.ok(boField);
  boField.en='NRIC No.';
  boField.cn='身份证号码';
  boField.value='PASSPORT-TEST-ABC';
  boField.displayEn='Passport No.';
  boField.displayCn='护照号码';
  draft.particulars.splice(boSection,0,{type:'field',en:'NRIC No.',cn:'身份证号码',value:'MEMBER-TEST-XYZ'});
  const normalized=normalizeDocument(draft);
  const updated=normalized.particulars.find(x=>x.value==='PASSPORT-TEST-ABC');
  assert.equal(updated.en,'NRIC / Passport No.');
  assert.equal(updated.cn,'身份证 / 护照号码');
  assert.equal(displayParticularLabel(updated),'NRIC / Passport No.');
  assert.equal(displayParticularLabel(updated,'cn'),'身份证 / 护照号码');
  assert.equal(updated.displayEn,undefined);
  assert.equal(updated.displayCn,undefined);
  const separateField=normalized.particulars.find(x=>x.value==='MEMBER-TEST-XYZ');
  assert.equal(separateField.en,'NRIC No.');
  assert.equal(separateField.cn,'身份证号码');
});
