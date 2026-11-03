import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {secretaryFromAnnualReturn,unanimousSecretaryReferences,mergeSecretaryIntoBook} from '../src/statutory-secretary-sync.js';
const draft={particulars:[
 {type:'section',en:'SECTION D - DIRECTORS'},
 {type:'field',en:'Date of Birth',value:'99/99/9999'},
 {type:'heading',en:'COMPANY SECRETARY'},
 {type:'field',en:'Secretary Name',value:'Jane Secretary'},
 {type:'field',en:'Secretary NRIC',value:'780516-14-5295'},
 {type:'field',en:'Professional Membership',value:'MIA27166'},
 {type:'field',en:'Practising Certificate Number',value:'202208000750'},
 {type:'field',en:'Date of Birth',value:'16/05/1978'},
 {type:'field',en:'Gender',value:'FEMALE'},
 {type:'field',en:'Secretary Residential Address',value:'Sample Address'},
 {type:'heading',en:'AUDITOR'},
 {type:'field',en:'Name',value:'Not Secretary'}
]};
const book=()=>({sheets:[{name:'Register of Secretaries',rows:[['Name','SSM Practicing Certificate No.','Membership No.','Date of Birth','Identification No.','Gender','Residential Address','Appointment Date','Cessation Date']]}]});
test('extracts only company-secretary section',()=>{
 const s=secretaryFromAnnualReturn(draft);
 assert.equal(s.Name,'Jane Secretary');assert.equal(s['Date of Birth'],'16/05/1978');
 assert.equal(s['Identification No.'],'780516-14-5295');assert.equal(s['Membership No.'],'MIA27166');
 assert.equal(s['SSM Practicing Certificate No.'],'202208000750');
 assert.ok(!s['Appointment Date']);
});
test('adds one record and then becomes idempotent',()=>{
 const b=book();const s=secretaryFromAnnualReturn(draft);
 const one=mergeSecretaryIntoBook(b,s);assert.equal(one.added,1);assert.equal(b.sheets[0].rows.length,2);
 const two=mergeSecretaryIntoBook(b,s);assert.equal(two.changed,false);assert.equal(b.sheets[0].rows.length,2);
});
test('fills blanks without changing appointment dates or existing differing details',()=>{
 const b=book();b.sheets[0].rows.push(['Jane Secretary','','','31/12/1977','780516145295','','','01/01/2001','']);
 const p=mergeSecretaryIntoBook(b,secretaryFromAnnualReturn(draft));
 assert.equal(p.added,0);assert.ok(p.filled>0);assert.ok(p.conflicts>=1);
 assert.equal(b.sheets[0].rows[1][3],'31/12/1977');assert.equal(b.sheets[0].rows[1][7],'01/01/2001');
});
test('does not invent reappointment for a historical ceased secretary',()=>{
 const b=book();b.sheets[0].rows.push(['Jane Secretary','','','','780516-14-5295','','','','01/01/2019']);
 const p=mergeSecretaryIntoBook(b,secretaryFromAnnualReturn(draft));
 assert.equal(p.changed,false);assert.equal(b.sheets[0].rows.length,2);
 assert.match(p.skipped,/reappointment verification/i);
 assert.equal(b.sheets[0].rows[1][8],'01/01/2019');
});
test('does not invent the cessation of a different current secretary',()=>{
 const b=book();b.sheets[0].rows.push(['Other Secretary','','','','850202140012','','','','']);
 const p=mergeSecretaryIntoBook(b,secretaryFromAnnualReturn(draft));
 assert.equal(p.changed,false);assert.equal(b.sheets[0].rows.length,2);
 assert.match(p.skipped,/verification/i);
});
test('skips unknown secretary register layout',()=>{
 const b={sheets:[{name:'Register of Secretaries',rows:[['Some prose rather than table']]}]};
 const p=mergeSecretaryIntoBook(b,secretaryFromAnnualReturn(draft));
 assert.equal(p.changed,false);assert.match(p.skipped,/unrecognised/i);
});
test('skips ambiguous duplicated secretary identity',()=>{
 const b=book();b.sheets[0].rows.push(['Jane Secretary','','','','780516-14-5295']);
 b.sheets[0].rows.push(['Jane Secretary','','','','780516-14-5295']);
 const p=mergeSecretaryIntoBook(b,secretaryFromAnnualReturn(draft));
 assert.equal(p.changed,false);assert.ok(p.conflicts);
});

test('cross-company import never creates a new secretary appointment',()=>{
 const b=book();
 const r=mergeSecretaryIntoBook(b,secretaryFromAnnualReturn(draft),{matchExistingOnly:true});
 assert.equal(r.changed,false);assert.equal(r.added,0);
 assert.equal(b.sheets[0].rows.length,1);
});
test('cross-company import enriches only the existing matching secretary',()=>{
 const b=book();
 b.sheets[0].rows.push(['Jane Secretary','','','','780516145295','','','02/02/2024','']);
 const r=mergeSecretaryIntoBook(b,secretaryFromAnnualReturn(draft),{matchExistingOnly:true});
 assert.equal(r.changed,true);assert.equal(r.added,0);
 assert.equal(b.sheets[0].rows[1][1],'202208000750');
 assert.equal(b.sheets[0].rows[1][7],'02/02/2024');
});
test('cross-company import ignores another person with a different identity',()=>{
 const b=book();
 b.sheets[0].rows.push(['Different Secretary','','','','760502145422','','','01/03/2021','']);
 const r=mergeSecretaryIntoBook(b,secretaryFromAnnualReturn(draft),{matchExistingOnly:true});
 assert.equal(r.changed,false);assert.equal(r.added,0);
 assert.equal(b.sheets[0].rows[1][0],'Different Secretary');
});
test('consensus excludes conflicting addresses but keeps verified identity and qualifications',()=>{
 const a=structuredClone(draft),b=structuredClone(draft);
 b.particulars.find(p=>p.en==='Secretary Residential Address').value='Other Address';
 const refs=unanimousSecretaryReferences([a,b]);
 assert.equal(refs.length,1);
 assert.equal(refs[0].Name,'Jane Secretary');
 assert.equal(refs[0]['Identification No.'],'780516-14-5295');
 assert.equal(refs[0]['Membership No.'],'MIA27166');
 assert.equal(refs[0]['Residential Address'],undefined);
});
test('consensus does not cross two different identity numbers',()=>{
 const a=structuredClone(draft),b=structuredClone(draft);
 b.particulars.find(p=>p.en==='Secretary NRIC').value='900101145218';
 const refs=unanimousSecretaryReferences([a,b]);
 assert.equal(refs.length,2);
});
test('historical secretary record not modified in cross-company mode',()=>{
 const b=book();
 b.sheets[0].rows.push(['Jane Secretary','','','','780516145295','','','','30/09/2024']);
 const r=mergeSecretaryIntoBook(b,secretaryFromAnnualReturn(draft),{matchExistingOnly:true});
 assert.equal(r.changed,false);
 assert.equal(b.sheets[0].rows[1][1],'');
});
