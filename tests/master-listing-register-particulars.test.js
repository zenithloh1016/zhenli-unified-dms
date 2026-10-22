import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMasterListing} from '../src/master-listing-data.js';
import {extractRegisterParticulars,mergeRegisterParticulars,preserveRegisterParticulars} from '../src/master-listing-register-particulars.js';

const data={
 'Register of Directors':[
  ['Director Name','','','','','','','','','Date of Appointment','Date of Cessation'],
  ['ACTIVE DIRECTOR','','','','','','','','','01/01/2025','-'],
  ['FORMER DIRECTOR','','','','','','','','','01/01/2023','01/01/2026']
 ],
 'Register of Members 001':[
  ['Name:','ACTIVE MEMBER'],
  ['','','','','','','Date Ceased to be A Member:','-'],
  ['','','','','','','Total Shares Held:','100'],
  ['Name:','FORMER MEMBER'],
  ['','','','','','','Date Ceased to be A Member:','01/01/2026'],
  ['','','','','','','Total Shares Held:','100'],
  ['Name:','ZERO-HOLDING MEMBER'],
  ['','','','','','','Date Ceased to be A Member:','-'],
  ['','','','','','','Total Shares Held:','0']
 ],
 'Register of BO':[
  ['Full Name','','','','','','','','','Date a Person Becomes / Cease to Become BO'],
  ['ACTIVE BO','','','','','',60,'','', 'Date becoming BO: 01/01/2025\nDate ceased: -'],
  ['FORMER BO','','','','','',40,'','', 'Date becoming BO: 01/01/2024\nDate ceased: 01/01/2026']
 ]
};
test('Register Book parsing excludes ceased directors, ceased members and ceased BOs',()=>{
 const found=extractRegisterParticulars(data);
 assert.deepEqual(found.directors,['ACTIVE DIRECTOR']);
 assert.deepEqual(found.members,['ACTIVE MEMBER']);
 assert.deepEqual(found.beneficialOwners,['ACTIVE BO (60%)']);
});
test('two new columns merge without overwriting other Master Listing cells',()=>{
 const old=buildMasterListing([
  ['No.','Company Name','Registration No.','Notes'],
  ['1','ALPHA SDN. BHD.','202601234567','Keep this private note'],
  ['2','BETA SDN. BHD.','202601234568','Another note']
 ],{nameColumn:1,registrationColumn:2});
 const {model,matchedRows,missing}=mergeRegisterParticulars(old,[{company:'ALPHA SDN. BHD.',
  directors:['ACTIVE DIRECTOR'],members:['ACTIVE MEMBER'],beneficialOwners:['ACTIVE BO (60%)']}]);
 assert.equal(matchedRows,1);
 assert.deepEqual(missing,['BETA SDN. BHD.']);
 assert.equal(model.columns.length,6);
 assert.equal(model.rows[0].values[3],'Keep this private note');
 assert.match(model.rows[0].values[4],/Directors: ACTIVE DIRECTOR\nMembers: ACTIVE MEMBER/);
 assert.equal(model.rows[0].values[5],'ACTIVE BO (60%)');
 assert.equal(model.rows[1].values[4],'N/A');
 assert.equal(old.columns.length,4,'original object is not mutated');
});
test('Excel re-import retains register fields when absent from replacement workbook',()=>{
 const original=buildMasterListing([
  ['Company Name','Registration No.','Directors & Members','Beneficial Owners'],
  ['ALPHA SDN BHD','202601234567','Directors: X\nMembers: Y','Z (30%)']
 ],{nameColumn:0,registrationColumn:1});
 const fresh=buildMasterListing([
  ['Company Name','Registration No.','Notes'],
  ['ALPHA SDN BHD','202601234567','Updated data']
 ],{nameColumn:0,registrationColumn:1});
 const merged=preserveRegisterParticulars(original,fresh);
 assert.equal(merged.rows[0].values[2],'Updated data');
 assert.equal(merged.rows[0].values[3],'Directors: X\nMembers: Y');
 assert.equal(merged.rows[0].values[4],'Z (30%)');
});

test('full consolidation columns stay separate on import and ZIP updates',()=>{
 const legacy=buildMasterListing([
  ['Company Name','Directors & Members','Beneficial Owners'],
  ['ALPHA SDN BHD','Directors: OLD\\nMembers: OLD','OLD']
 ],{nameColumn:0,registrationColumn:-1});
 const imported=buildMasterListing([
  ['Company Name','Current Directors','Director Count','Current Members','Member Count','Current Beneficial Owners','BO Count'],
  ['ALPHA SDN BHD','NEW DIRECTOR','1','NEW MEMBER','1','NEW OWNER','1']
 ],{nameColumn:0,registrationColumn:-1});
 const preserved=preserveRegisterParticulars(legacy,imported);
 assert.equal(preserved.columns.length,7,'old combined columns must not be restored');
 const changed=mergeRegisterParticulars(preserved,[{company:'ALPHA SDN BHD',
  directors:['ACTIVE DIRECTOR'],members:['ACTIVE MEMBER'],beneficialOwners:['BO NAME']}]);
 assert.equal(changed.model.columns.length,7);
 assert.deepEqual(changed.model.rows[0].values.slice(1),[
  'ACTIVE DIRECTOR','1','ACTIVE MEMBER','1','BO NAME','1'
 ]);
});
