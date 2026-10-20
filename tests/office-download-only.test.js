import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('Office file rows use existing download workflow only',()=>{
 assert.match(main,/const office=\/\\.\(\?:doc\|docx\|docm\|xls\|xlsx\|xlsm\)\$\/i\.test\(doc\.name\)/);
 assert.match(main,/data-action="\$\{office\?'download-file':'view-file'\}"/);
 assert.match(main,/action\('Download','download-file',doc\.id\)/);
 assert.match(main,/action\('Rename','rename-file',doc\.id\)/);
 assert.match(main,/action\('Delete','delete-file',doc\.id\)/);
});

test('DMS no longer includes Office editing or installed-app launch integration',()=>{
 const removed=['edit-office','open-office','share-office-file','save-office-now','launch-office-app','office-save-copy','createOfficeAutoSaver','openOfficeDocument','officeViewUri','openOfficeOnAndroid','renderOfficeModal'];
 for(const name of removed)assert.ok(!main.includes(name),'Unexpected Office integration: '+name);
 assert.equal(pkg.dependencies['@capacitor-community/file-opener'],undefined);
});

test('Other modules and document features remain available',()=>{
 for(const action of ['view-file','download-file','upload-trigger','register-zip','tab-annual-return','tab-signing','tab-tasks'])assert.ok(main.includes(action),'Missing '+action);
});
