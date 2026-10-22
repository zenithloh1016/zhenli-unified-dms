import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMasterListing} from '../src/master-listing-data.js';
import {extractRegisterParticulars,mergeRegisterParticulars,preserveRegisterParticulars,
 compactRegisterColumns,REGISTER_PARTICULARS_COLUMNS} from '../src/master-listing-register-particulars.js';

const sample={
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
test('extract only active names; no percentages, former people or zero holdings',()=>{
 const found=extractRegisterParticulars(sample);
 assert.deepEqual(found.directors,['ACTIVE DIRECTOR']);
 assert.deepEqual(found.members,['ACTIVE MEMBER']);
 assert.deepEqual(found.beneficialOwners,['ACTIVE BO']);
});
test('append three current-person columns and keep every original business field',()=>{
 const original=buildMasterListing([
  ['No.','Company Name','Registration No.','Notes'],
  ['1','ALPHA SDN. BHD.','202601234567','Keep this note'],
  ['2','BETA SDN. BHD.','202601234568','Another note']
 ],{nameColumn:1,registrationColumn:2});
 const {model,matchedRows,missing,removed}=mergeRegisterParticulars(original,[{
  company:'ALPHA SDN. BHD.',directors:['ACTIVE DIRECTOR'],members:['ACTIVE MEMBER'],
  beneficialOwners:['ACTIVE BO (60%)']
 }]);
 assert.deepEqual(REGISTER_PARTICULARS_COLUMNS,['Current Directors','Current Members','Current Beneficial Owners']);
 assert.equal(matchedRows,1);
 assert.equal(removed,0);
 assert.deepEqual(missing,['BETA SDN. BHD.']);
 assert.equal(model.columns.length,7);
 assert.equal(model.rows[0].values[3],'Keep this note');
 assert.deepEqual(model.rows[0].values.slice(4),['ACTIVE DIRECTOR','ACTIVE MEMBER','ACTIVE BO']);
 assert.deepEqual(model.rows[1].values.slice(4),['N/A','N/A','N/A']);
 assert.equal(original.columns.length,4,'input object is untouched');
});
test('legacy combined fields are split into three columns then removed',()=>{
 const legacy=buildMasterListing([
  ['Company Name','Registration No.','Directors & Members','Beneficial Owners','Notes'],
  ['ALPHA SDN BHD','202601234567','Directors: TAN\nMembers: CHONG','LEE (42%)','Preserve']
 ],{nameColumn:0,registrationColumn:1});
 const {model,removed}=compactRegisterColumns(legacy);
 assert.equal(removed,2);
 assert.deepEqual(model.columns.map(c=>c.label),[
  'Company Name','Registration No.','Notes','Current Directors','Current Members','Current Beneficial Owners'
 ]);
 assert.deepEqual(model.rows[0].values.slice(2),['Preserve','TAN','CHONG','LEE (42%)']);
});
test('simplify earlier 42-column consolidation without removing original columns',()=>{
 const model=buildMasterListing([
  ['No.','Company Name','Registration No.','TIN','Current Directors','Director Count',
  'Current Members','Member Count','Member Shareholdings (Register)',
  'Current Beneficial Owners','BO Count','Current Secretaries','Register Source / Status','Bank Account'],
  ['1','ALPHA SDN BHD','202601234567','C123','DIRECTOR','1',
   'MEMBER','1','MEMBER: 100 SHARES','BO','1','SECRETARY','source.xlsx','CIMB']
 ],{nameColumn:1,registrationColumn:2});
 const {model:cleaned,removed}=compactRegisterColumns(model);
 assert.equal(removed,6);
 assert.deepEqual(cleaned.columns.map(c=>c.label),[
  'No.','Company Name','Registration No.','TIN','Current Directors',
  'Current Members','Current Beneficial Owners','Bank Account'
 ]);
 assert.deepEqual(cleaned.rows[0].values,[
  '1','ALPHA SDN BHD','202601234567','C123','DIRECTOR','MEMBER','BO','CIMB'
 ]);
 const after=mergeRegisterParticulars(cleaned,[{company:'ALPHA SDN BHD',
  directors:['NEW DIRECTOR'],members:['NEW MEMBER'],beneficialOwners:['NEW BO']}]);
 assert.deepEqual(after.model.rows[0].values.slice(4,7),['NEW DIRECTOR','NEW MEMBER','NEW BO']);
 assert.equal(after.model.columns.length,8);
});
test('importing another Excel preserves current-person data without restoring old extra columns',()=>{
 const original=buildMasterListing([
  ['Company Name','Registration No.','Current Directors','Current Members','Current Beneficial Owners','Director Count'],
  ['ALPHA SDN BHD','202601234567','X','Y','Z','1']
 ],{nameColumn:0,registrationColumn:1});
 const fresh=buildMasterListing([
  ['Company Name','Registration No.','Notes'],
  ['ALPHA SDN BHD','202601234567','Updated note']
 ],{nameColumn:0,registrationColumn:1});
 const merged=preserveRegisterParticulars(original,fresh);
 assert.deepEqual(merged.columns.map(c=>c.label),[
  'Company Name','Registration No.','Notes','Current Directors','Current Members','Current Beneficial Owners'
 ]);
 assert.deepEqual(merged.rows[0].values.slice(2),['Updated note','X','Y','Z']);
});
test('ambiguous duplicate company names are not copied from stale old Excel entries',()=>{
 const original=buildMasterListing([
  ['Company Name','Current Directors','Current Members','Current Beneficial Owners'],
  ['SILVERSPOONS SDN. BHD.','A','B','C'],
  ['SILVERSPOONS SDN. BHD.','D','E','F']
 ],{nameColumn:0,registrationColumn:-1});
 const next=buildMasterListing([
  ['Company Name','Notes'],['SILVERSPOONS SDN. BHD.','Keep']
 ],{nameColumn:0,registrationColumn:-1});
 const merged=preserveRegisterParticulars(original,next);
 assert.deepEqual(merged.rows[0].values,['SILVERSPOONS SDN. BHD.','Keep','N/A','N/A','N/A']);
});
