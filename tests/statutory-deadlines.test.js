import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildMasterListing,changeListingCell} from '../src/master-listing-data.js';
import {findDeadlineColumns,readDeadline,deadlineStatus,statutoryDeadlineData,
 filterStatutoryDeadlines,renderStatutoryDeadlines} from '../src/statutory-deadlines.js';

const headers=['No.','Company Name','Registration No.','Date of Incorporation',
 'Annual Return Lodgement Due Date','Next Annual Return Date',
 'Audited Financial Statement Lodgement Due Date','Financial Year Ended','Subsequent FYE'];
function sample(){
 return buildMasterListing([
  headers,
  ['1','ALPHA SDN. BHD.','202601234567','01/01/2020','20/11/2026','01/01/2027','15/01/2027','31/12/2025','31/12/2026'],
  ['2','BETA SDN. BHD.','202601234568','02/01/2020','10/10/2026','02/01/2027','TBC','31/12/2025','31/12/2026'],
  ['3','GAMMA SDN. BHD.','202601234569','03/01/2020','N/A','03/01/2027','N/A','31/12/2025','31/12/2026']
 ],{nameColumn:1,registrationColumn:2});
}
test('the exact Master Listing AR/AFS due date columns are selected',()=>{
 const cols=findDeadlineColumns(sample());
 assert.deepEqual(cols,{AR:4,AFS:6});
});
test('AR and AFS due dates are not recomputed from FYE or anniversary',()=>{
 const source=statutoryDeadlineData(sample(),'2026-10-22');
 assert.equal(source.rows.length,6);
 assert.equal(source.stats.ar,2);
 assert.equal(source.stats.afs,1);
 assert.equal(source.stats.soon,1);
 assert.equal(source.stats.past,1);
 assert.equal(source.stats.missing,3);
 const alphaAFS=source.rows.find(x=>x.company.startsWith('ALPHA')&&x.kind==='AFS');
 assert.equal(alphaAFS.iso,'2027-01-15');
 assert.equal(alphaAFS.display,'15/01/2027');
 const gammaAR=source.rows.find(x=>x.company.startsWith('GAMMA')&&x.kind==='AR');
 assert.equal(gammaAR.iso,'','no deadline should be calculated from Next AR Date');
});
test('source edits automatically change the rendered deadline date without a second store',()=>{
 const model=sample();
 const arBefore=statutoryDeadlineData(model,'2026-10-22').rows.find(x=>x.rowIndex===0&&x.kind==='AR');
 assert.equal(arBefore.display,'20/11/2026');
 changeListingCell(model,0,4,'25/12/2026');
 const arAfter=statutoryDeadlineData(model,'2026-10-22').rows.find(x=>x.rowIndex===0&&x.kind==='AR');
 assert.equal(arAfter.display,'25/12/2026');
 assert.notEqual(arAfter.iso,arBefore.iso);
});
test('filter search, AR/AFS, next 30 days and missing dates',()=>{
 const items=statutoryDeadlineData(sample(),'2026-10-22').rows;
 assert.deepEqual(filterStatutoryDeadlines(items,{kind:'AR',period:'30'}).map(x=>x.company),['ALPHA SDN. BHD.']);
 assert.equal(filterStatutoryDeadlines(items,{kind:'AFS',period:'missing'}).length,2);
 assert.equal(filterStatutoryDeadlines(items,{query:'202601234568'}).length,2);
 assert.equal(filterStatutoryDeadlines(items,{period:'past'}).length,1);
});
test('legacy Excel serial and date strings are validated, unknown values are not guessed',()=>{
 assert.deepEqual(readDeadline('2026-10-22'),{iso:'2026-10-22',display:'22/10/2026'});
 assert.deepEqual(readDeadline('22.10.2026'),{iso:'2026-10-22',display:'22/10/2026'});
 assert.equal(readDeadline('TBC').display,'TBC');
 assert.equal(readDeadline('garbled date').iso,'');
 assert.equal(readDeadline('31/02/2026').display,'Check date');
 assert.equal(deadlineStatus('2026-10-21','2026-10-22').code,'past');
 assert.equal(deadlineStatus('2026-10-22','2026-10-22').code,'soon');
 assert.equal(deadlineStatus('2026-11-22','2026-10-22').code,'future');
});
test('UI sanitizes source names and warns that past dates are not necessarily unlodged',()=>{
 const model=buildMasterListing([
  ['Company Name','Registration No.','Annual Return Lodgement Due Date','Audited Financial Statement Lodgement Due Date'],
  ['<img src=x onerror=alert(1)> SDN BHD','2345','20/10/2026','TBC']
 ],{nameColumn:0,registrationColumn:1});
 const html=renderStatutoryDeadlines(model,{});
 assert.ok(html.includes('&lt;img'));
 assert.ok(!html.includes('<img'));
 assert.ok(html.includes('Past source date'));
 assert.ok(html.includes('does not confirm non-lodgement'));
 assert.ok(html.includes('Edit source'));
});
test('site includes deadline tab and source sync; bundled Task Hub removes duplicate deadline entry',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const hub=readFileSync(new URL('../public/task-hub/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/task-hub/app.js',import.meta.url),'utf8');
 assert.ok(main.includes("'statutory-deadlines'"));
 assert.ok(main.includes("masterListingUI.load(true)"),'cloud source is re-read');
 assert.ok(main.includes('deadline-refresh'));
 assert.ok(main.includes('deadline-edit'));
 assert.ok(!hub.includes('data-view="deadlines"'));
 assert.ok(app.includes("case'dashboard':html=renderDashboard();break;"));
});
