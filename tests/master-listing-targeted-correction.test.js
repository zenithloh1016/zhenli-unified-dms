import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMasterListing,applyRequestedMasterListingCorrections,mergeDocumentCompanies}
 from '../src/master-listing-data.js';
import {createMasterListingTab} from '../src/master-listing-tab.js';

function model(){
 const m=buildMasterListing([
  ['No.','Company Name','Registration No.','Constitution','Remarks'],
  ['1','ABC SDN BHD','202600000001','No','ABC special'],
  ['2','ABC SDN BHD HOLDINGS','202600000002','No','Keep'],
  ['3','BETA SDN BHD','202600000003','Yes','Keep'],
  ['4','CHARLIE SDN BHD','202600000004','Yes','Keep']
 ]);
 m.rows[2].values[3]='þ';
 m.rows[3].values[3]='Þ';
 m.restoredPreAmendment={source:'20261024015246-1a9063a5-8a51-4ab7-aebe-2e5ce30823d6.json',restoredAt:'2026-10-26T00:00:00Z'};
 return m;
}
test('only ABC SDN BHD is removed; only thorn Constitution values become Yes',()=>{
 const original=model(),before=JSON.stringify(original);
 const x=applyRequestedMasterListingCorrections(original);
 assert.equal(x.removed,1);
 assert.equal(x.changed,2);
 assert.equal(x.model.rows.length,3);
 assert.deepEqual(x.model.rows.map(r=>r.values[1]),[
  'ABC SDN BHD HOLDINGS','BETA SDN BHD','CHARLIE SDN BHD']);
 assert.deepEqual(x.model.rows.map(r=>r.values[3]),['No','Yes','Yes']);
 assert.deepEqual(x.model.rows.map(r=>r.values[4]),['Keep','Keep','Keep']);
 assert.deepEqual(x.model.rows.map(r=>r.values[0]),['1','2','3']);
 assert.equal(JSON.stringify(original),before,'never mutate source before backup');
 assert.equal(x.model.restoredPreAmendment.source,original.restoredPreAmendment.source);
 assert.deepEqual(x.model.excludedMasterListingCompanies,['ABC SDN BHD']);
 const again=applyRequestedMasterListingCorrections(x.model);
 assert.strictEqual(again.model,x.model);
 assert.equal(again.removed,0);assert.equal(again.changed,0);
});

test('Documents sync does not re-add removed ABC, but retains other companies',()=>{
 const m=applyRequestedMasterListingCorrections(model()).model;
 const result=mergeDocumentCompanies(m,[
  {name:'ABC SDN. BHD.',registration_no:'202600000001'},
  {name:'NEW COMPANY SDN BHD',registration_no:'202600000005'}
 ]);
 assert.equal(result.added,1);
 assert(!result.model.rows.some(r=>r.values[1]==='ABC SDN BHD'));
 assert(result.model.rows.some(r=>r.values[1]==='NEW COMPANY SDN BHD'));
});

test('duplicate ABC names cause no deletion or conversion',()=>{
 const m=model();
 m.rows.push({...m.rows[0],id:'duplicate-company',values:[...m.rows[0].values]});
 const before=JSON.stringify(m);
 assert.throws(()=>applyRequestedMasterListingCorrections(m),/Multiple ABC SDN BHD/);
 assert.equal(JSON.stringify(m),before);
});

test('loading the saved Master Listing performs backup first, updates cloud and does not repeat',async()=>{
 const m=model();let cloud=JSON.stringify(m),uploads=[];
 const store={
  download:async()=>({data:new Blob([cloud]),error:null}),
  upload:async(path,blob)=>{
   const data=JSON.parse(await blob.text());
   uploads.push({path,data});
   if(path.endsWith('/current.json'))cloud=JSON.stringify(data);
   return {error:null};
  }
 };
 const ui=createMasterListingTab({
  db:{storage:{from:()=>store}},getUser:()=>({id:'test-account'}),
  getCompanies:()=>[{name:'ABC SDN BHD'}],notify:()=>{}
 });
 await ui.load();
 assert.equal(uploads.length,2);
 assert.match(uploads[0].path,/\/master-listing\/history\//);
 assert.deepEqual(uploads[0].data.rows,m.rows);
 assert.deepEqual(JSON.parse(cloud).rows.map(r=>r.values[1]),[
  'ABC SDN BHD HOLDINGS','BETA SDN BHD','CHARLIE SDN BHD']);
 assert.match(ui.state.status,/1 ABC SDN BHD row removed, 2 Constitution/);
 await ui.load(true);
 assert.equal(uploads.length,2,'no repeat changes or backups on reload');
});
