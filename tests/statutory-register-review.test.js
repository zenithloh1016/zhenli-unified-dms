import test from 'node:test';
import assert from 'node:assert/strict';
import {
 describeStatutorySheet,summaryForReview,filterReviewRecords,registerLabel
} from '../src/statutory-register-review.js';
import {renderReadableRegister} from '../src/statutory-register-review-ui.js';

const blank=()=>Array.from({length:7},()=>[]);
const directorRows=blank();
directorRows.push(['Director Name','Date of Birth','NRIC No.','Nationality','Date of Appointment','Date of Cessation']);
directorRows.push(['CURRENT DIRECTOR','','990123-12-3456','Malaysian','01/01/2026','-']);
directorRows.push(['FORMER DIRECTOR','','900123-12-3456','Malaysian','01/01/2020','31/12/2025']);
const directors={name:'Register of Directors',rows:directorRows};
const master={name:'Master',rows:[
 [],[],[],
 ['Company Name:','EXAMPLE SDN BHD'],
 ['Company No.:','202601234567'],
 ['Registered Office:','No. 6A'],
 ['','Ipoh, Perak']
]};
const members={name:'Register of Members 001',rows:[
 [],[],[],[],[],[],
 ['Name:','EXAMPLE MEMBER',,,,, 'Date of Birth:','01/01/1980'],
 ['ID Type:','NRIC',,,,, 'Nationality/Origin:','MALAYSIA'],
 ['Address:','No. 6A',,,,, 'Date Ceased to be A Member:','-'],
 ['','Ipoh, Perak'],
 ['SHARES ACQUIRED',,,,,,,'SHARES TRANSFERRED'],
 ['Date','No. Of Share Certificate','Allotment or Transfer No.','Folio','Class of Shares','No. of Shares','Consideration'],
 ['01/01/2026','-','A1','1','Ordinary','100','100']
]};
const owner={name:'Register of BO',rows:[
 [],[],[],[],[],[],
 ['Full Name','NRIC No.','Type of Beneficial Ownership','Criteria of BO'],
 ['EXAMPLE OWNER','990123-12-3456','Direct','Criteria A']
]};
const book={sheets:[master,directors,members,owner]};
const uiState=()=>({reviewQuery:'',reviewStatus:'all',reviewPage:0,reviewExpanded:'',showBlankFields:false});

test('review labels and company profile show all important facts as editable fields',()=>{
 assert.equal(registerLabel('Master'),'Company Details');
 assert.equal(registerLabel('Register of Members 001'),'Register of Members 001');
 assert.equal(registerLabel('Register of BO'),'Register of Beneficial Owners');
 const info=describeStatutorySheet(master);
 assert.equal(info.kind,'profile');
 assert(info.fields.some(f=>f.label==='Registered Office'&&f.row===5&&f.col===1));
 assert(info.fields.some(f=>f.label==='Registered Office · continued'&&f.row===6));
 const html=renderReadableRegister(book,0,uiState());
 assert.match(html,/Company particulars/);
 assert.match(html,/sr-field-label/);
 assert.match(html,/Registered Office/);
 assert.match(html,/data-r="5" data-c="1"/);
 assert.doesNotMatch(html,/<table/);
});

test('directors become readable active and former records with coordinates preserved',()=>{
 const data=describeStatutorySheet(directors);
 assert.equal(data.kind,'table');
 assert.equal(data.headerRow,7);
 assert.equal(data.records.length,2);
 assert.equal(data.records[0].status,'current');
 assert.equal(data.records[1].status,'former');
 assert.equal(data.records[1].fields.find(f=>f.label==='Date of Cessation').row,9);
 assert.equal(filterReviewRecords(data.records,{status:'former'}).length,1);
 const state=uiState();
 const html=renderReadableRegister(book,1,state);
 assert.match(html,/Current \/ Active/);
 assert.match(html,/Former \/ Ceased/);
 assert.match(html,/Review \/ Edit details/);
 assert.doesNotMatch(html,/class="rb-grid"/);
 state.reviewExpanded='main:8';
 assert.match(renderReadableRegister(book,1,state),/data-r="8" data-c="2"/);
});

test('members folio becomes labelled member details and share movement history',()=>{
 const parsed=describeStatutorySheet(members);
 assert.equal(parsed.kind,'member');
 assert.equal(parsed.records.length,1);
 assert.equal(parsed.records[0].status,'current');
 assert.equal(parsed.ledger.records.length,1);
 const html=renderReadableRegister(book,2,uiState());
 assert.match(html,/Member particulars/);
 assert.match(html,/Share(?:s)? acquired \/ transferred|Shares acquired \/ transferred/);
 assert.match(html,/EXAMPLE MEMBER/);
 assert.match(html,/No. 6A/);
 assert.match(html,/data-r="8" data-c="7"/);
});

test('register summary counts from the saved model and filters safely',()=>{
 const summary=summaryForReview(book);
 assert.equal(summary.directors,2);
 assert.equal(summary.members,1);
 assert.equal(summary.beneficialOwners,1);
 const state=uiState();state.reviewQuery='example owner';
 const html=renderReadableRegister(book,3,state);
 assert.match(html,/EXAMPLE OWNER/);
 assert.match(html,/1 of 1 entries/);
 state.reviewQuery='unknown';
 assert.match(renderReadableRegister(book,3,state),/No matching entries/);
});

test('all user-supplied values are escaped in readable HTML, with no JSON rewriting',()=>{
 const special={name:'Register of Directors',rows:[
 ['Full Name','NRIC No.','Date of Cessation'],
 ['<img src=x onerror=alert(1)>','xx','']
 ]};
 const mock={sheets:[special]};
 const html=renderReadableRegister(mock,0,uiState());
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/&lt;img/);
 assert.deepEqual(special.rows[1],['<img src=x onerror=alert(1)>','xx','']);
});
