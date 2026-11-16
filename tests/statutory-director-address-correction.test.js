import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDirectorAddressCorrections} from '../src/statutory-director-address-correction.js';

const correction={fullName:'Sample Director',identificationNo:'1234',
 previousAddress:'NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK',
 newAddress:'NO. 73, JALAN SAMPLE, 30000 IPOH, PERAK, MALAYSIA'};

test('updates matching director residential address only; leaves service and other directors intact',()=>{
 const source={sheets:[{name:'Register of Directors',rows:[
  ['Name','Identification No.','Residential Address','Service Address'],
  ['Sample Director','1234','NO. 75,\nJALAN SAMPLE,\n30000 IPOH,\nPERAK','NO. 75, JALAN SAMPLE'],
  ['Other Director','5678','NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK','']
 ]}]};
 const updated=applyDirectorAddressCorrections(source,[correction]);
 assert.equal(updated.changed,1);
 assert.match(updated.book.sheets[0].rows[1][2],/^NO\. 73,/);
 assert.equal(updated.book.sheets[0].rows[1][3],'NO. 75, JALAN SAMPLE');
 assert.equal(updated.book.sheets[0].rows[2][2],'NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK');
 assert.match(source.sheets[0].rows[1][2],/^NO\. 75,/);
 assert.equal(applyDirectorAddressCorrections(updated.book,[correction]).changed,0);
});

test('refuses a same-named person with a different identity number',()=>{
 const book={sheets:[{name:'Register of Directors',rows:[
  ['Name','Identification No.','Residential Address'],
  ['Sample Director','9999','NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK']
 ]}]};
 assert.equal(applyDirectorAddressCorrections(book,[correction]).changed,0);
});

test('supports labelled field/value layout in legacy registers',()=>{
 const book={sheets:[{name:'Register of Directors',rows:[
  ['Name:','Sample Director'],['NRIC No.:','1234'],
  ['Residential Address:','NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK']
 ]}]};
 const updated=applyDirectorAddressCorrections(book,[correction]);
 assert.equal(updated.changed,1);
 assert.equal(updated.book.sheets[0].rows[2][1],'NO. 73, JALAN SAMPLE, 30000 IPOH, PERAK');
});

test('does not touch non-directors sheets',()=>{
 const book={sheets:[{name:'Register of Members',rows:[
  ['Name','Identification No.','Residential Address'],
  ['Sample Director','1234','NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK']
 ]}]};
 assert.equal(applyDirectorAddressCorrections(book,[correction]).changed,0);
});
