import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMasterListing,displayedListingValue} from '../src/master-listing-data.js';
import {applyUploadedConstitutionStatuses} from '../src/master-listing-constitution-source.js';
import {createMasterListingTab} from '../src/master-listing-tab.js';

const statusMap={
 '202601234567':'Yes','202601234568':'N/A','202601234569':'Yes'
};
function listing(){
 const m=buildMasterListing([
  ['No.','Company Name','Registration No.','Constitution','Remarks'],
  ['1','ONE SDN BHD','202601234567 (12345-X)','þ','Preserve 1'],
  ['2','TWO SDN BHD','202601234568 (12346-X)','Adopted','Preserve 2'],
  ['3','THREE SDN BHD','202601234569','N/A','Preserve 3'],
  ['4','FOUR SDN BHD','202699999999','No','Preserve 4']
 ]);
 // Simulate saved pre-amendment source values before the importer normalizes the cells.
 m.rows[0].values[3]='þ';
 m.rows[1].values[3]='Adopted';
 m.restoredPreAmendment={source:'original-history.json'};
 return m;
}

test('uploaded mapping updates Yes and N/A exclusively by SSM registration number',()=>{
 const original=listing();
 const prior=JSON.stringify(original);
 const {model,updated,matched,unmatched}=applyUploadedConstitutionStatuses(
  original,statusMap,'sha256:private-test');
 assert.equal(updated,3);
 assert.equal(matched,3);
 assert.equal(unmatched,0);
 assert.deepEqual(model.rows.map(r=>r.values[3]),['Yes','N/A','Yes','No']);
 assert.deepEqual(model.rows.map(r=>r.values[4]),[
  'Preserve 1','Preserve 2','Preserve 3','Preserve 4'
 ]);
 assert.deepEqual(model.rows.map(r=>r.values[1]),original.rows.map(r=>r.values[1]));
 assert.equal(model.restoredPreAmendment.source,original.restoredPreAmendment.source);
 assert.equal(model.constitutionSourceVersion,'sha256:private-test');
 assert.equal(JSON.stringify(original),prior,'must not mutate original before backup');
 assert.equal(displayedListingValue(model,3,'Yes'),'Yes');
 assert.equal(displayedListingValue(model,3,'N/A'),'N/A');
 const second=applyUploadedConstitutionStatuses(model,statusMap,'sha256:private-test');
 assert.strictEqual(second.model,model);
 assert.equal(second.alreadyApplied,true);
});

test('invalid or missing mapping cannot blank a Master Listing',()=>{
 const m=listing();
 assert.throws(()=>applyUploadedConstitutionStatuses(m,{'202601234567':'Unknown'},'ver1'),/Invalid Constitution status/);
 assert.throws(()=>applyUploadedConstitutionStatuses(m,statusMap,''),/Invalid Constitution source/);
 const none=applyUploadedConstitutionStatuses(m,{'000000000000':'Yes'},'ver1');
 assert.equal(none.matched,0);
 assert.equal(none.updated,0);
});

test('loading DMS updates only private Constitution statuses, backs up first, then leaves later edits unchanged',async()=>{
 let current=JSON.stringify(listing());
 const writes=[],queries=[];
 const store={
  download:async()=>({data:new Blob([current]),error:null}),
  upload:async(path,blob)=>{
   const data=JSON.parse(await blob.text());
   writes.push({path,data});
   if(path.endsWith('/current.json'))current=JSON.stringify(data);
   return {error:null};
  }
 };
 const db={
  storage:{from:()=>store},
  from:table=>{
   queries.push(table);
   return {select:cols=>({eq:(column,user)=>({
    maybeSingle:async()=>({data:{source_version:'sha256:private-test',statuses:statusMap},error:null})
   })})};
  }
 };
 const ui=createMasterListingTab({db,getUser:()=>({id:'test-account'}),
  getCompanies:()=>[],notify:()=>{}});
 await ui.load();
 assert.equal(writes.length,2);
 assert.match(writes[0].path,/master-listing\/history/);
 assert.deepEqual(writes[0].data.rows.map(r=>r.values[3]),['þ','Adopted','N/A','No']);
 assert.equal(writes[1].path.endsWith('/current.json'),true);
 assert.deepEqual(JSON.parse(current).rows.map(r=>r.values[3]),['Yes','N/A','Yes','No']);
 assert.match(ui.state.status,/Constitution updated from uploaded Master Listing/);
 assert.match(ui.render(),/Apply Uploaded Constitution List/);
 await ui.load(true);
 assert.equal(writes.length,2,'same source must not overwrite or back up twice');
 assert(queries.includes('dms_master_listing_constitution_imports'));
});

test('private source is inaccessible or empty: no Master Listing changes',async()=>{
 const m=listing(),baseline=JSON.stringify(m);
 let writes=0;
 const db={
  storage:{from:()=>({
   download:async()=>({data:new Blob([baseline]),error:null}),
   upload:async()=>{writes++;return {error:null}}
  })},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})
 };
 const ui=createMasterListingTab({db,getUser:()=>({id:'test-account'}),getCompanies:()=>[],notify:()=>{}});
 await ui.load();
 assert.equal(writes,0);
 assert.deepEqual(ui.state.model.rows,m.rows);
});
