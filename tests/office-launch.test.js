import test from 'node:test';
import assert from 'node:assert/strict';
import {officeType,officeViewUri,supportsOfficeFileShare} from '../src/office-launch.js';

test('Word/Excel formats open using Microsoft Office viewing URI schemes',()=>{
 assert.deepEqual([officeType('Register Book.xlsx')?.kind,officeType('DRW.docx')?.kind],['Excel','Word']);
 assert.equal(officeViewUri('register.xlsx','https://example.com/private/report'),
  'ms-excel:ofv|u|https://example.com/private/report');
 assert.equal(officeViewUri('board.docx','https://example.com/private/board'),
  'ms-word:ofv|u|https://example.com/private/board');
 for(const extension of ['xls','xlsx','xlsm','doc','docx','docm'])assert.ok(officeType('document.'+extension));
 assert.equal(officeType('document.pdf'),null);
 assert.throws(()=>officeViewUri('document.xlsx','http://example.com'),/HTTPS/);
});
test('mobile browser shares genuine Office files and leaves fallback when unavailable',()=>{
 const file={name:'register.xlsx'};
 assert.equal(supportsOfficeFileShare(file,{share:()=>{},canShare:()=>true}),true);
 assert.equal(supportsOfficeFileShare(file,{share:()=>{},canShare:()=>false}),false);
 assert.equal(supportsOfficeFileShare(file,{canShare:()=>true}),false);
});
test('DMS keeps external Office handoff as an alternative to in-website editing',async()=>{
 const {readFileSync}=await import('node:fs');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.match(main,/action\('Open in '\+office.kind,'open-office'/);
 assert.match(main,/officeViewUri\(d.name,data.signedUrl\)/);
 assert.match(main,/navigator.share\(\{files:\[f\]/);
 assert.match(main,/office-save-copy/);
 assert.match(main,/openOfficeOnAndroid\(data,d.name\)/);
 assert.match(main,/officeType\(doc.name\)/);
 assert.match(main,/edit-office/);
 assert.match(main,/createOfficeAutoSaver/);
 assert.doesNotMatch(main,/save-office-replace|startOfficeEditing/);
 assert.match(main,/action\('Download','download-file'/);
 assert.equal(pkg.dependencies['@capacitor-community/file-opener'],'^8.0.1');
});
