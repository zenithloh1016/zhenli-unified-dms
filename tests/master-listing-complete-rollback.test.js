import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMasterListing,displayedListingValue} from '../src/master-listing-data.js';
import {createMasterListingTab} from '../src/master-listing-tab.js';
import {PRE_AMENDMENT_MASTER_LISTING,isMasterListingRestored} from '../src/master-listing-pre-amendment.js';

const original=()=>{const model=buildMasterListing([
 ['No.','Company Name','Registration No.','Constitution','Date of Registration','Previous Status'],
 ['1','ORIGINAL ALPHA SDN BHD','202001234567','b','01/01/2020','PRE-CHANGE'],
 ['2','ORIGINAL BETA SDN BHD','202002234567','Adopted','02/02/2020','PRE-CHANGE']
]);model.rows[0].values[3]='b';model.rows[1].values[3]='Adopted';return model;};
const newer=()=>buildMasterListing([
 ['No.','Company Name','Registration No.','Constitution','Date of Registration','Previous Status'],
 ['1','UPDATED ALPHA SDN BHD','202001234567','N/A','01/01/2020','LATER EDIT'],
 ['2','UPDATED BETA SDN BHD','202002234567','Yes','02/02/2020','LATER EDIT'],
 ['3','NEW COMPANY SDN BHD','202603234567','No','03/03/2026','NEW']
]);
const copy=model=>JSON.parse(JSON.stringify(model));

function harness({includeBackup=true,listError=null,failBackup=false}={}){
 let current=JSON.stringify(newer());
 const hist=JSON.stringify(original());
 const uploaded=[],reads=[],lists=[];
 const user={id:'test-user'};
 const storage={
  list:async (path,opts)=>{
   lists.push({path,opts});
   return listError?{data:null,error:{message:listError}}:
    {data:includeBackup?[{name:PRE_AMENDMENT_MASTER_LISTING}]:[],error:null};
  },
  download:async path=>{
   reads.push(path);
   if(path.endsWith('/current.json'))return {data:new Blob([current]),error:null};
   if(includeBackup&&path.endsWith('/'+PRE_AMENDMENT_MASTER_LISTING))
    return {data:new Blob([hist]),error:null};
   return {data:null,error:{message:'Object not found',statusCode:404}};
  },
  upload:async (path,blob,opts)=>{
   if(failBackup&&path.includes('/history/'))return {error:{message:'Backup write blocked'}};
   const data=JSON.parse(await blob.text());
   uploaded.push({path,data,opts});
   if(path.endsWith('/current.json'))current=JSON.stringify(data);
   return {error:null};
  }
 };
 const tab=createMasterListingTab({
  db:{storage:{from:()=>storage}},
  getUser:()=>user,getCompanies:()=>[],notify:()=>{},
  openCompany:()=>{}
 });
 return {tab,reads,lists,uploaded,getCurrent:()=>JSON.parse(current)};
}

test('rollback uses exact pre-amendment 24 October backup, never reconstruction or inferred Constitution',async()=>{
 const h=harness();
 const before=copy(newer()),historical=copy(original());
 await h.tab.load();
 assert.equal(h.lists.length,1);
 assert.equal(h.lists[0].path,'test-user/master-listing/history');
 assert(h.reads.includes('test-user/master-listing/history/'+PRE_AMENDMENT_MASTER_LISTING));
 assert.equal(h.uploaded.length,2,'first write preserves current, second restores historical');
 assert.match(h.uploaded[0].path,/\/history\//);
 assert.match(h.uploaded[1].path,/\/current\.json$/);
 assert.deepEqual(h.uploaded[0].data.rows,before.rows,
  'newer/current source backed up byte-for-byte at data level');
 const restored=h.getCurrent();
 assert.deepEqual(restored.columns,historical.columns);
 assert.deepEqual(restored.rows,historical.rows);
 assert.deepEqual(restored.rows.map(x=>x.values[3]),['b','Adopted']);
 assert.equal(displayedListingValue(restored,3,restored.rows[0].values[3]),'b');
 assert.equal(displayedListingValue(restored,3,restored.rows[1].values[3]),'Adopted');
 assert.equal(restored.rows.length,2,'newer company rows are not merged into original');
 assert(isMasterListingRestored(restored));
 assert.match(h.tab.state.status,/Restored original Master Listing from 24 October 2026/);
 assert(!h.tab.render().includes('Fix Constitution N/A'));
 assert(!h.tab.render().includes('Sync Constitution Status'));
 assert(!h.tab.render().includes('Restore Constitution History'));
 await h.tab.load(true);
 assert.equal(h.uploaded.length,2,'reload does not repeat rollback');
 assert.equal(h.lists.length,1,'reload does not consult backup a second time');
});

test('without the exact private historical file, cloud listing is never overwritten',async()=>{
 const h=harness({includeBackup:false});
 await h.tab.load();
 assert.equal(h.uploaded.length,0);
 assert.deepEqual(h.getCurrent().rows,copy(newer()).rows);
 assert.match(h.tab.state.status,/backup not present/);
});

test('backup upload error prevents changing current.json',async()=>{
 const h=harness({failBackup:true});
 await h.tab.load();
 assert.equal(h.uploaded.length,0);
 assert(!isMasterListingRestored(h.getCurrent()));
 assert.match(h.tab.state.error,/Existing cloud listing was left unchanged/);
});

test('restore never trusts unverified inaccessible historical backup locations',async()=>{
 const h=harness({listError:'Forbidden'});
 await h.tab.load();
 assert.equal(h.uploaded.length,0);
 assert.equal(h.reads.length,1,'only existing current.json was read');
 assert.match(h.tab.state.error,/Cannot verify pre-amendment/);
});
