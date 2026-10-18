import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('standalone Android PDF uses real Save As document picker, not cache-only Share',()=>{
 const src=read('../../native/AnnualReturnSaver.java');
 const save=read('../../src/native-pdf-save.js');
 const pdf=read('../src/pdf.js');
 assert.match(src,/Intent\.ACTION_CREATE_DOCUMENT/);
 assert.match(src,/getContentResolver\(\)\.openOutputStream\(destination/);
 assert.match(src,/call\.resolve\(response\)/);
 assert.match(src,/getCacheDir\(\)/);
 assert.match(save,/registerPlugin\('AnnualReturnSaver'\)/);
 assert.match(save,/savePdfToAndroidFiles/);
 assert.match(pdf,/await savePdfToAndroidFiles\(blob,name\)/);
 assert.match(pdf,/window\.parent\.postMessage\(\{type:'ZHENLI_DMS_AR_SAVE_PDF'/);
});
test('DMS bridge checks same-origin editor before saving PDFs',()=>{
 const parent=read('../../src/main.js');
 assert.match(parent,/event\.source!==frame\.contentWindow/);
 assert.match(parent,/event\.origin!==window\.location\.origin/);
 assert.match(parent,/event\.data\.type==='ZHENLI_DMS_AR_SAVE_PDF'/);
 assert.match(parent,/savePdfToAndroidFiles\(blob,name\)/);
});
test('builds both APKs with Android Save As plugin registered',()=>{
 const workflow=read('../../.github/workflows/deploy.yml');
 const ar=read('../../.github/workflows/annual-return-apk.yml');
 assert.match(workflow,/install-native-pdf-saver\.mjs \./);
 assert.match(workflow,/install-native-pdf-saver\.mjs annual-return/);
 assert.match(ar,/install-native-pdf-saver\.mjs annual-return/);
});
