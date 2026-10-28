import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSheet,validateRegisterBook,makeRegisterBook} from '../src/statutory-register-data.js';

const company={id:'test-company',name:'TEST SDN BHD',registration_no:'202601234567'};

test('Register of Secretaries cell I11 preserves values and fills missing Excel cell gaps',()=>{
 const rows=Array.from({length:11},()=>[]);
 rows[10][0]='Example Secretary';
 rows[10][8]='01/10/2026';
 const book={version:1,companyId:company.id,sheets:[{name:'Register of Secretaries',rows}]};
 assert.equal(1 in rows[10],false);
 assert.equal(validateRegisterBook(book),book);
 assert.deepEqual(rows[10],['Example Secretary','','','','','','','','01/10/2026']);
 assert.doesNotThrow(()=>validateRegisterBook(JSON.parse(JSON.stringify(book))));
});

test('legacy saved JSON safely recovers null blanks, rows, numbers and booleans',()=>{
 const book={version:1,sheets:[{name:'Register of Secretaries',rows:[
  null,['Example Secretary',null,0,true,'PC-1234']
 ]}]};
 validateRegisterBook(book);
 assert.deepEqual(book.sheets[0].rows[0],[]);
 assert.deepEqual(book.sheets[0].rows[1],['Example Secretary','','0','true','PC-1234']);
});

test('sparse Excel import retains the correct column indexes',()=>{
 const rows=[[]];
 rows[0][0]='Example Secretary';
 rows[0][8]='01/10/2026';
 const sheet=sanitizeSheet('Register of Secretaries',rows);
 const book=makeRegisterBook(company,{path:'Register Book.xlsx',sheets:[sheet]});
 assert.equal(book.sheets[0].rows[0].length,9);
 assert.equal(book.sheets[0].rows[0][7],'');
 assert.equal(book.sheets[0].rows[0][8],'01/10/2026');
});

test('unsupported objects still fail validation instead of silently losing data',()=>{
 const book={version:1,sheets:[{name:'Register of Secretaries',rows:[['Example Secretary',{unrecognized:'value'}]]}]};
 assert.throws(()=>validateRegisterBook(book),/row 1, column 2/);
});
