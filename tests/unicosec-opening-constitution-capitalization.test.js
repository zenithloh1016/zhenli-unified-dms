import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 buildMasterListing,displayedListingValue,listingCSV,changeListingCell
} from '../src/master-listing-data.js';
import {createMasterListingTab} from '../src/master-listing-tab.js';

const opening=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function original(){
 const m=buildMasterListing([
  ['No.','Company Name','Registration No.','Constitution','Remarks'],
  ['1','ALPHA SDN BHD','202601234567','Yes','Preserve'],
  ['2','BETA SDN BHD','202601234568','No','Preserve'],
  ['3','GAMMA SDN BHD','202601234569','N/A','Preserve']
 ]);
 m.rows[0].values[3]='þ';
 m.restoredPreAmendment={source:'pre-amendment-saved.xlsx'};
 return m;
}

test('opening screen says Opening UNICOSEC instead of Opening Document Management',()=>{
 assert.match(opening,/Opening UNICOSEC…/);
 assert.doesNotMatch(opening,/Opening Document Management/i);
 assert.match(opening,/<title>UNICOSEC - Company Secretarial Management System<\/title>/);
});

test('Constitution YES is uppercase for imported, existing, and old þ records, with other columns unchanged',()=>{
 const model=original();
 const before=JSON.stringify(model);
 for(const affirmative of ['Yes','YES','yes','Y','Adopted','þ','Þ']){
  assert.equal(displayedListingValue(model,3,affirmative),'YES',affirmative);
 }
 for(const value of ['N/A','No']){
  assert.equal(displayedListingValue(model,3,value),value);
 }
 assert.equal(displayedListingValue(model,4,'Yes'),'Yes',
  'other Master Listing columns are not reformatted');
 assert.equal(displayedListingValue(model,3,model.rows[0].values[3]),'YES');
 assert.deepEqual(model.rows.map(r=>r.values[4]),['Preserve','Preserve','Preserve']);
 assert.equal(JSON.stringify(model),before,'rendering must not mutate stored records');
 const csv=listingCSV(model);
 assert.match(csv,/"ALPHA SDN BHD","202601234567","YES","Preserve"/);
 assert.doesNotMatch(csv,/"ALPHA SDN BHD","202601234567","þ"/);
});

test('UNICOSEC Master Listing table and editor display uppercase YES',async()=>{
 const model=original();
 const json=JSON.stringify(model);
 const storage={
  download:async()=>({data:new Blob([json]),error:null}),
  upload:async()=>({error:null})
 };
 const ui=createMasterListingTab({
  db:{storage:{from:()=>storage}},getUser:()=>({id:'test-user'}),
  getCompanies:()=>[],notify:()=>{}
 });
 await ui.load();
 ui.onClick('ml-fullscreen');
 const html=ui.render();
 assert.match(html,/title="YES">YES<\/td>/);
 assert(!html.includes('title="þ">þ</td>'));
 assert.match(html,/title="N\/A">N\/A<\/td>/);
});
