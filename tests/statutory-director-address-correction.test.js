import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDirectorAddressCorrections,proposeDirectorAddressCorrections,applyPersonResidentialAddressUpdates,planPersonResidentialAddressUpdates,directorAddressesFromAnnualReturnDrafts} from '../src/statutory-director-address-correction.js';

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


test('proposes only a Director whose NRIC and street match the saved Annual Return',()=>{
 const book={sheets:[{name:'Register of Directors',rows:[
  ['Director Name','Identification No.','Residential Address','Service Address'],
  ['Sample Director','1234','NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK','PLOT 1, ROAD']
 ]}]};
 const draft={particulars:[{en:'DIRECTOR 1',value:''},
  {en:'Full Name',value:'Sample Director'},
  {en:'NRIC / Passport No.',value:'1234'},
  {en:'Residential Address',value:'NO. 73, JALAN SAMPLE, 30000 IPOH, PERAK, MALAYSIA'},
  {en:'COMPANY SECRETARY',value:''}]};
 const proposals=proposeDirectorAddressCorrections(book,draft);
 assert.equal(proposals.length,1);
 assert.equal(proposals[0].fullName,'Sample Director');
 assert.equal(applyDirectorAddressCorrections(book,proposals).changed,1);
 const otherStreet={particulars:draft.particulars.map(x=>x.en==='Residential Address'?
  {...x,value:'NO. 73, DIFFERENT ROAD, 30000 IPOH, PERAK'}:x)};
 assert.equal(proposeDirectorAddressCorrections(book,otherStreet).length,0);
});


test('synchronizes exact-identity residential address in Directors, Members, BO and Secretaries registers',()=>{
 const previous='NO. 75,\nJALAN SAMPLE,\n30000 IPOH,\nPERAK';
 const next='NO. 73, JALAN SAMPLE, 30000 IPOH, PERAK, MALAYSIA';
 const candidate={fullName:'Sample Director',identificationNo:'1234',newAddress:next};
 const book={sheets:[
  {name:'Register of Directors',rows:[
   ['Name','Identification No.','Residential Address','Service Address'],
   ['Sample Director','1234',previous,previous],
   ['Sample Director','9999',previous,previous]]},
  {name:'Register of Beneficial Owners',rows:[
   ['Full Name','Identification No.','Residential Address'],
   ['Sample Director','1234',previous]]},
  {name:'Register of Members',rows:[
   ['Name','Identification No.','Address'],
   ['Sample Director','1234',previous]]},
  {name:'Register of Members 001',rows:[
   ['Name:','Sample Director'],['NRIC No.:','1234'],
   ['Address:','NO. 75,'],['','JALAN SAMPLE,'],['','30000 IPOH,'],['','PERAK'],
   ['SHARES ACQUIRED']]},
  {name:'Register of Secretaries',rows:[
   ['Name','Identification No.','Residential Address'],
   ['Sample Director','1234',previous]]},
  {name:'Register of Transfers',rows:[
   ['Name','Identification No.','Address'],['Sample Director','1234',previous]]}
 ]};
 const preview=planPersonResidentialAddressUpdates(book,[candidate]);
 assert.equal(preview.length,5);
 const output=applyPersonResidentialAddressUpdates(book,[candidate]);
 assert.equal(output.changed,5);
 assert.equal(output.book.sheets[0].rows[1][2].startsWith('NO. 73,'),true);
 assert.equal(output.book.sheets[0].rows[1][3],previous);
 assert.equal(output.book.sheets[0].rows[2][2],previous);
 assert.equal(output.book.sheets[3].rows[2][1],'NO. 73,');
 assert.equal(output.book.sheets[5].rows[1][2],previous);
 assert.equal(book.sheets[0].rows[1][2],previous); // source unchanged
 assert.equal(applyPersonResidentialAddressUpdates(output.book,[candidate]).changed,0);
});

test('rejects differing streets, different identifiers and unrelated service-only addresses',()=>{
 const candidate={fullName:'Sample Director',identificationNo:'1234',
  newAddress:'NO. 73, JALAN SAMPLE, 30000 IPOH, PERAK'};
 const book={sheets:[
  {name:'Register of Directors',rows:[
   ['Name','Identification No.','Residential Address','Service Address'],
   ['Sample Director','1234','NO. 75, OTHER STREET, 30000 IPOH, PERAK','NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK'],
   ['Sample Director','9999','NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK','']]},
  {name:'Register of Charges',rows:[
   ['Name','Identification No.','Residential Address'],
   ['Sample Director','1234','NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK']]}
 ]};
 assert.equal(applyPersonResidentialAddressUpdates(book,[candidate]).changed,0);
});

test('uses consistent Annual Return Director particulars and refuses conflicting saved addresses',()=>{
 const base=[
  {en:'DIRECTOR 1',type:'heading',value:''},
  {en:'Full Name',type:'field',value:'Sample Director'},
  {en:'NRIC / Passport No.',type:'field',value:'1234'},
  {en:'Residential Address',type:'field',value:'NO. 73, JALAN SAMPLE, 30000 IPOH, PERAK'},
  {en:'COMPANY SECRETARY',type:'heading',value:''}
 ];
 const proposal=directorAddressesFromAnnualReturnDrafts([
  {payload:{particulars:base}},
  {payload:{particulars:base.map(x=>x.en==='Residential Address'?
   {...x,value:x.value+', MALAYSIA'}:x)}}],'Sample Director');
 assert.equal(proposal.candidates.length,1);
 assert.equal(proposal.conflicts.length,0);
 const rejected=directorAddressesFromAnnualReturnDrafts([
  {payload:{particulars:base}},
  {payload:{particulars:base.map(x=>x.en==='Residential Address'?
   {...x,value:'NO. 75, JALAN SAMPLE, 30000 IPOH, PERAK'}:x)}}],'Sample Director');
 assert.equal(rejected.candidates.length,0);
 assert.equal(rejected.conflicts.length,1);
 assert.equal(directorAddressesFromAnnualReturnDrafts([
  {payload:{particulars:base}}],'Different Name').candidates.length,0);
});
