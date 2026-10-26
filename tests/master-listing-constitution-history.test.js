import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMasterListing} from '../src/master-listing-data.js';
import {restoreHistoricalConstitutionStatuses} from '../src/master-listing-constitution-history.js';
import {createMasterListingTab} from '../src/master-listing-tab.js';

const fixture=(statuses,names=['ALPHA SDN BHD','BETA SDN BHD','GAMMA SDN BHD','DELTA SDN BHD'])=>
 buildMasterListing([
  ['No.','Company Name','Registration No.','Constitution','Latest AFS Deadline'],
  ...statuses.map((status,i)=>[
   String(i+1),names[i],'20260000000'+String(i+1),status,
   '15/'+String(i+1).padStart(2,'0')+'/2027'
  ])
 ]);
const file=(t,id)=>({
 name:t+'-'+id+'.json',created_at:'2026-10-20T00:00:00Z'
});
const stamp=(d,t)=>String(d).padStart(8,'0')+String(t).padStart(6,'0');

test('recovers only prior confirmed Constitution Yes and never alters other company fields',()=>{
 const current=fixture(['N/A','No','N/A','Yes']);
 const old=fixture(['Yes','Yes','N/A','Yes']);
 const history=restoreHistoricalConstitutionStatuses(current,[old]);
 assert.equal(history.count,1);
 assert.deepEqual(history.model.rows.map(r=>r.values[3]),['Yes','No','N/A','Yes']);
 assert.equal(history.model.rows[0].values[4],current.rows[0].values[4]);
 assert.equal(current.rows[0].values[3],'N/A');
 assert.equal(restoreHistoricalConstitutionStatuses(history.model,[old]).count,0);
});

test('newest explicit No in history overrides still older Yes, without changing current N/A',()=>{
 const now=fixture(['N/A','N/A','N/A','N/A']);
 const latest=fixture(['No','N/A','N/A','N/A']);
 const old=fixture(['Yes','Yes','N/A','N/A']);
 const info=restoreHistoricalConstitutionStatuses(now,[latest,old]);
 assert.equal(info.count,1);
 assert.equal(info.blocked,1);
 assert.deepEqual(info.model.rows.map(r=>r.values[3]),['N/A','Yes','N/A','N/A']);
});
test('matching across backups uses unique registration numbers, never array order',()=>{
 const original=fixture(['Yes','No','Yes','No']);
 const current=fixture(['N/A','N/A','N/A','N/A'],
  ['CHANGED COMPANY NAME','BETA SDN BHD','GAMMA SDN BHD','DELTA SDN BHD']);
 const result=restoreHistoricalConstitutionStatuses(current,[original]);
 assert.equal(result.count,2);
 assert.deepEqual(result.model.rows.map(r=>r.values[3]),['Yes','N/A','Yes','N/A']);
});
test('legacy b, missing or blank history is never treated as evidence of a Constitution',()=>{
 const model=fixture(['N/A','N/A','N/A','N/A']);
 const source=fixture(['b','N/A','Draft','b']);
 const result=restoreHistoricalConstitutionStatuses(model,[source]);
 assert.equal(result.count,0);
 assert.equal(result.model,model);
});
test('automatic recovery loads real private history files and saves backup before restoring only Yes',async()=>{
 const current=fixture(['N/A','No','N/A','N/A']);
 const older=fixture(['Yes','Yes','Yes','N/A']);
 const newer=fixture(['N/A','No','N/A','N/A']);
 const archives=[
  {name:'20261026073527-3813392a-9ed1-47df-9955-1cedeb79e481.json',model:newer},
  {name:'20261024015109-56a20f71-f9f0-448e-b4b1-a24e92f10ace.json',model:older}
 ];
 let latest=JSON.stringify(current);
 const uploaded=[],downloaded=[],listing=[];
 const storage={
  list:async(prefix,options)=>{
   listing.push({prefix,options});
   return {data:archives.map(s=>({name:s.name,metadata:{size:128}})),error:null};
  },
  download:async path=>{
   downloaded.push(path);
   if(path.endsWith('/current.json'))return {data:new Blob([latest]),error:null};
   const file=archives.find(x=>path.endsWith('/'+x.name));
   return file?{data:new Blob([JSON.stringify(file.model)]),error:null}
    :{data:null,error:{message:'Not found'}};
  },
  upload:async(path,blob,options)=>{
   const data=JSON.parse(await blob.text());
   uploaded.push({path,data,options});
   if(path.endsWith('/current.json'))latest=JSON.stringify(data);
   return {error:null};
  }
 };
 const user={id:'user-123'};
 const tab=createMasterListingTab({
  db:{storage:{from:()=>storage}},
  getUser:()=>user,getCompanies:()=>[],notify:()=>{}
 });
 await tab.load();
 assert.equal(listing.length,1,'load only checks presence of the pinned pre-amendment backup');
 tab.onClick('ml-restore-constitution');
 for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));
 assert.equal(downloaded.filter(x=>x.includes('/history/')).length,2);
 assert.equal(uploaded.length,2,'backup is uploaded before corrected listing');
 assert.match(uploaded[0].path,/\/history\//);
 assert.match(uploaded[1].path,/\/current\.json$/);
 assert.deepEqual(JSON.parse(latest).rows.map(x=>x.values[3]),['Yes','No','Yes','N/A']);
 assert.match(tab.state.status,/Restored 2 confirmed Constitution status/);
 assert.match(tab.render(),/Restore Constitution History/);
 await tab.load(true);
 assert.equal(listing.length,4,'later refresh only checks pinned restore point, not selective history');
 assert.equal(uploaded.length,2,'manual selective restoration is not repeated automatically');
});
