import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const contains=(p,text)=>assert(file(p).includes(text),p+' missing '+text);

test('UNICOSEC is used for web title, sign-in, header, footers and embedded modules',()=>{
 contains('index.html','<title>UNICOSEC - Company Secretarial Management System</title>');
 contains('src/main.js','UNICOSEC - Company Secretarial Management System');
 contains('src/main.js','UNICOSEC - Company Secretarial Management System');
 contains('src/main.js','UNICOSEC - Company Secretarial Management System · Web + Android');
 contains('public/task-hub/index.html','UNICOSEC<span> / TASK HUB</span>');
 contains('task-hub-cloud/index.html','<title>UNICOSEC - Company Secretarial Management System | Task Hub</title>');
 contains('sign/index.html','UNICOSEC · Electronic Signing');
 contains('sign/index.html','<title>UNICOSEC - Company Secretarial Management System | Secure Electronic Signing</title>');
 contains('annual-return/index.html','<title>UNICOSEC - Company Secretarial Management System | Annual Return PDF</title>');
 contains('annual-return/index.html','<strong>UNICOSEC</strong>');
 contains('src/signing-supabase.js','Administrator workspace directly inside UNICOSEC');
});

test('UNICOSEC is Android display name; package IDs do not change to preserve existing installations',()=>{
 const main=JSON.parse(file('capacitor.config.json'));
 assert.equal(main.appName,'UNICOSEC');
 assert.equal(main.appId,'com.zhenli.unifieddms');
 const ar=JSON.parse(file('annual-return/capacitor.config.json'));
 assert.equal(ar.appName,'UNICOSEC Annual Return');
 assert.equal(ar.appId,'com.zhenli.annualreturn');
 const workflow=file('.github/workflows/deploy.yml');
 assert.match(workflow,/UNICOSEC\.apk/);
 assert.match(workflow,/name: UNICOSEC-\$\{\{ github\.run_number \}\}/);
});

test('UNICOSEC branding appears in statutory and annual-return generated PDFs',()=>{
 contains('src/statutory-register-pdf.js','UNICOSEC · STATUTORY REGISTERS');
 contains('src/statutory-register-annual-ui.js','UNICOSEC · COMPANY STATUTORY REGISTERS');
 contains('annual-return/src/pdf.js','UNICOSEC · ANNUAL RETURN PARTICULARS');
});

test('technical bridges and legal company identity remain unchanged',()=>{
 const main=file('src/main.js');
 assert.match(main,/ZHENLI_DMS_AR_COMPANY_LIST/);
 assert.match(main,/zhenli:signing:provider/);
 const sign=file('sign/index.html');
 assert.match(sign,/ZHENLI CONSULTANCY SERVICES SDN BHD/);
});
