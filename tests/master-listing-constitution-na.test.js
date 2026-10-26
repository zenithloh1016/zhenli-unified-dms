import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildMasterListing,changeListingCell,displayedListingValue,formattedListingCell,
 listingCSV,listingRowsForSearch,isListingConstitutionColumn,isUnknownConstitutionValue,
 repairListingConstitutionPlaceholders
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

test('previously saved Master Listing is untouched on load; manual Constitution repair still uses backup',async()=>{
 const legacy=example();
 legacy.rows[0].values[3]='b';
 legacy.rows[1].values[3]='b';
 legacy.rows[2].values[3]='b';
 const current=JSON.stringify(legacy);
 const writes=[];
 const storage={
  download:async()=>({data:new Blob([current]),error:null}),
  upload:async(name,file,opts)=>{
   writes.push({name,contents:JSON.parse(await file.text()),opts});
   return {error:null};
  }
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
 assert.equal(writes.length,0,'automatic Constitution amendment is disabled');
 tab.onClick('ml-fix-constitution');
 for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));
 tab.onClick('ml-fullscreen');
 const html=tab.render();
 assert.match(html,/title="Constitution">Constitution<\/th>/);
 const matches=html.match(/<td class="" title="N\/A">N\/A<\/td>/g)||[];
 assert.equal(matches.length,3);
 assert.match(html,/Adopted 2024/);
 assert.match(html,/title="b">b<\/td>/,'Remarks b remains unchanged');
 assert.equal(writes.length,2,'one backup and one repaired current.json save');
 assert.match(writes[0].name,/master-listing\/history\//);
 assert.match(writes[1].name,/master-listing\/current\.json$/);
 assert.deepEqual(writes[0].contents.rows.slice(0,3).map(r=>r.values[3]),['b','b','b']);
 assert.deepEqual(writes[1].contents.rows.map(r=>r.values[3]),['N/A','N/A','N/A','Adopted 2024']);
 assert.equal(tab.state.model.rows[0].values[3],'N/A');
 assert.equal(tab.state.error,'');
 assert.match(tab.state.status,/Repaired 3 Constitution value/);
});

test('saved Constitution repair is idempotent and never edits unrelated columns',()=>{
 const model=example();
 model.rows[0].values[3]='b';
 model.rows[1].values[3]=' B ';
 model.rows[2].values[3]='  ';
 const info=repairListingConstitutionPlaceholders(model);
 assert.equal(info.count,3);
 assert.deepEqual(info.model.rows.map(r=>r.values[3]),['N/A','N/A','N/A','Adopted 2024']);
 assert.deepEqual(info.model.rows.map(r=>r.values[4]),model.rows.map(r=>r.values[4]));
 assert.equal(model.rows[0].values[3],'b','original is not mutated');
 const again=repairListingConstitutionPlaceholders(info.model);
 assert.equal(again.count,0);
 assert.equal(again.model,info.model);
});

test('Unicode b-like Constitution placeholders normalize without erasing genuine statuses',()=>{
 const m=example();
 for(const v of ['b','B','p','P','þ','Þ','ƀ','ɓ','ᵇ','β',
                 '\u200Bþ\uFEFF',' \u200B b\u200D ','nil','N/A','NA']){
  assert.equal(isUnknownConstitutionValue(v),true,'unknown '+v);
  assert.equal(formattedListingCell(m,3,v),'N/A','Constitution '+v);
  assert.equal(formattedListingCell(m,4,v),v,'Unrelated Remarks '+v);
 }
 for(const [v,expected] of [
  ['Y','Yes'],['N','N'],['A','A'],['Yes','Yes'],['No','No'],
  ['Adopted','Yes'],['Not adopted','Not adopted'],
  ['Memorandum and Articles','Memorandum and Articles'],['2024','2024']
 ]){
  assert.equal(isUnknownConstitutionValue(v),false,'meaningful '+v);
  assert.equal(formattedListingCell(m,3,v),expected);
 }
});
test('explicit repair reloads fresh cloud values and saves a backup before correcting',async()=>{
 const b=example();b.rows[0].values[3]='þ';b.rows[1].values[3]='b';
 let server=JSON.stringify(b),backupCount=0;
 const storage={
  download:async()=>({data:new Blob([server]),error:null}),
  upload:async(path,blob)=>{const data=await blob.text();
   if(path.endsWith('/current.json'))server=data;
   else backupCount++;
   return {error:null};}
 };
 const tab=createMasterListingTab({db:{storage:{from:()=>storage}},
  getUser:()=>({id:'test-account'}),getCompanies:()=>[],openCompany:()=>{},notify:()=>{}});
 await tab.load();
 assert.equal(backupCount,1,'requested þ-to-Yes correction is backed up and saved automatically');
 assert.deepEqual(JSON.parse(server).rows.slice(0,2).map(r=>r.values[3]),['Yes','b']);
 tab.onClick('ml-fix-constitution');
 for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));
 assert.equal(backupCount,2);
 assert.deepEqual(JSON.parse(server).rows.slice(0,2).map(r=>r.values[3]),['Yes','N/A']);
 assert.match(tab.render(),/Fix Constitution N\/A/);
 const old=JSON.parse(server);old.rows[0].values[3]='þ';server=JSON.stringify(old);
 tab.onClick('ml-fix-constitution');
 for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));
 assert.equal(backupCount,3);
 assert.equal(JSON.parse(server).rows[0].values[3],'Yes');
 assert.match(tab.state.status,/Constitution cloud listing checked|Master Listing updated/);
});
