import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildMasterListing,changeListingCell,displayedListingValue,formattedListingCell,
 listingCSV,listingRowsForSearch,isListingConstitutionColumn
} from '../src/master-listing-data.js';
import {createMasterListingTab} from '../src/master-listing-tab.js';

function example(){
 return buildMasterListing([
  ['No.','Company Name','Registration No.','Constitution','Remarks'],
  ['1','FIRST COMPANY SDN BHD','202601234567','b','b'],
  ['2','SECOND COMPANY SDN BHD','202601234568','B','Keep'],
  ['3','THIRD COMPANY SDN BHD','202601234569','', 'Constitution adopted'],
  ['4','FOURTH COMPANY SDN BHD','202601234570','Adopted 2024','b']
 ]);
}

test('only Constitution columns convert meaningless b to N/A on import',()=>{
 const model=example();
 assert.equal(isListingConstitutionColumn('Constitution'),true);
 assert.equal(isListingConstitutionColumn('Company Constitution'),true);
 assert.equal(isListingConstitutionColumn('Constitution Status'),true);
 assert.equal(isListingConstitutionColumn('Constitution Date'),false);
 assert.equal(isListingConstitutionColumn('Constitutional Issues'),false);
 assert.deepEqual(model.rows.map(r=>r.values[3]),['N/A','N/A','N/A','Adopted 2024']);
 assert.deepEqual(model.rows.map(r=>r.values[4]),['b','Keep','Constitution adopted','b']);
 assert.equal(formattedListingCell(model,3,'  b  '),'N/A');
 assert.equal(formattedListingCell(model,3,'N/a'),'N/A');
 assert.equal(formattedListingCell(model,3,'Yes'),'Yes');
 assert.equal(formattedListingCell(model,3,'No'),'No');
 assert.equal(formattedListingCell(model,3,'M&A'),'M&A');
});

test('saved legacy b Constitution entries display N/A in all Master Listing rows, CSV and search',()=>{
 const model=example();
 model.rows[0].values[3]='b';  // Old current.json value.
 model.rows[1].values[3]='B';
 const original=model.rows.map(row=>row.values.slice());
 assert.equal(displayedListingValue(model,3,model.rows[0].values[3]),'N/A');
 assert.equal(displayedListingValue(model,3,model.rows[1].values[3]),'N/A');
 assert.equal(listingRowsForSearch(model,'N/A').length,3);
 const csv=listingCSV(model);
 assert.match(csv,/"FIRST COMPANY SDN BHD","202601234567","N\/A","b"/);
 assert.match(csv,/"SECOND COMPANY SDN BHD","202601234568","N\/A","Keep"/);
 assert(!csv.includes('"202601234567","b","b"'));
 assert.deepEqual(model.rows.map(row=>row.values),original,'display/export must not rewrite source data');
});

test('edit and save normalization permanently stores N/A while meaningful values stay exact',()=>{
 const model=example();
 model.rows[0].values[3]='b';
 changeListingCell(model,0,3,'b');
 assert.equal(model.rows[0].values[3],'N/A');
 changeListingCell(model,0,3,'No');
 assert.equal(model.rows[0].values[3],'No');
 changeListingCell(model,0,3,'  ');
 assert.equal(model.rows[0].values[3],'N/A');
 changeListingCell(model,0,4,'b');
 assert.equal(model.rows[0].values[4],'b');
});

test('previously saved Master Listing JSON immediately displays Constitution N/A',async()=>{
 const legacy=example();
 legacy.rows[0].values[3]='b';
 legacy.rows[1].values[3]='b';
 legacy.rows[2].values[3]='b';
 const current=JSON.stringify(legacy);
 let writes=0;
 const storage={
  download:async()=>({data:new Blob([current]),error:null}),
  upload:async()=>{writes++;return {error:null}}
 };
 const tab=createMasterListingTab({
  db:{storage:{from:()=>storage}},
  getUser:()=>({id:'test-account'}),
  getCompanies:()=>[],
  openCompany:()=>{},
  refreshCompanies:()=>{},
  notify:()=>{}
 });
 await tab.load();
 tab.onClick('ml-fullscreen');
 const html=tab.render();
 assert.match(html,/title="Constitution">Constitution<\/th>/);
 const matches=html.match(/<td class="" title="N\/A">N\/A<\/td>/g)||[];
 assert.equal(matches.length,3);
 assert.match(html,/Adopted 2024/);
 assert(!html.includes('title="b">b</td>'));
 assert.equal(writes,0,'loading must not silently overwrite original cloud JSON');
 assert.equal(tab.state.model.rows[0].values[3],'b','original source remains recoverable');
});
