import test from 'node:test';
import assert from 'node:assert/strict';
import {createMasterListingTab} from '../src/master-listing-tab.js';
import {removeDeletedDocumentCompany,sortMasterListingCompanies,reconcileDeletedDocumentRows} from '../src/master-listing-data.js';
import {readFileSync} from 'node:fs';

function makeWorkspace({documentsError=null}={}){
 let saved=null;
 const uploads=[];
 const rpcs=[];
 const companies=[];
 const store={
  download:async()=>saved?{data:new Blob([JSON.stringify(saved)]),error:null}:{data:null,error:{message:'Object not found'}},
  upload:async(path,blob)=>{
   const data=JSON.parse(await blob.text());
   uploads.push({path,data});
   if(path.endsWith('/master-listing/current.json'))saved=data;
   return {error:null};
  }
 };
 const db={
  storage:{from:()=>store},
  rpc:async(method,args)=>{
   rpcs.push({method,args});
   if(documentsError)return {error:{message:documentsError}};
   companies.push({id:'doc-'+companies.length,name:args.p_name,registration_no:args.p_registration_no});
   return {error:null};
  }
 };
 const ui=createMasterListingTab({
  db,getUser:()=>({id:'test-user'}),getCompanies:()=>companies,
  refreshCompanies:async()=>{},notify:()=>{},openCompany:()=>{}
 });
 ui.afterRender(()=>{});
 const form=(fields,createFolders=true)=>({
  id:'ml-add-form',
  elements:{namedItem:key=>{
   if(key==='ml-create-documents')return {checked:createFolders};
   if(!key.startsWith('ml-new-'))return null;
   const index=Number(key.slice(7));
   return Object.hasOwn(fields,index)?{value:fields[index]}:null;
  }}
 });
 return {ui,form,uploads,rpcs,companies,get saved(){return saved;}};
}
async function submitAndDrain(ui,form){
 assert.equal(ui.onSubmit(form),true);
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
}

test('Add Company without a prior Excel import creates listing and documents folders',async()=>{
 const x=makeWorkspace();
 await x.ui.load();
 x.ui.onClick('ml-add');
 assert.match(x.ui.render(),/Save New Company/);
 await submitAndDrain(x.ui,x.form({1:'NEW SAMPLE SDN BHD',2:'202601234567',3:'21\/10\/2026',4:'31\/12\/2026'}));
 assert.equal(x.ui.state.error,'');
 assert.equal(x.ui.model.rows.length,1);
 assert.equal(x.ui.model.columns[0].label,'No.');
 assert.equal(x.ui.model.rows[0].values[0],'1');
 assert.equal(x.ui.model.rows[0].values[1],'NEW SAMPLE SDN BHD');
 assert.equal(x.ui.model.rows[0].values[3],'21/10/2026');
 assert.equal(x.rpcs.length,1);
 assert.equal(x.rpcs[0].method,'create_company_with_folders');
 assert.equal(x.rpcs[0].args.p_registration_no,'202601234567');
 assert.equal(x.saved.rows.length,1);
});

test('Reject a duplicate company name without overwriting saved rows',async()=>{
 const x=makeWorkspace();
 await x.ui.load();x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'DUPLICATE SDN BHD',2:'202501234567'},false));
 assert.equal(x.ui.model.rows.length,1);
 x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'duplicate   sdn bhd',2:'202699999999'},false));
 assert.match(x.ui.state.error,/already exists/);
 assert.equal(x.ui.model.rows.length,1);
 assert.equal(x.saved.rows.length,1);
 assert.equal(x.rpcs.length,0);
});

test('Optional folder creation can be disabled while listing still saves and numbers rows',async()=>{
 const x=makeWorkspace();
 await x.ui.load();x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'FIRST SDN BHD'},false));
 x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'SECOND SDN BHD'},false));
 assert.deepEqual(x.ui.model.rows.map(row=>row.values[0]),['1','2']);
 assert.equal(x.rpcs.length,0);
 assert.equal(x.saved.rows.length,2);
 assert.ok(x.uploads.some(entry=>entry.path.includes('/history/')),'previous listing backed up');
});

test('Documents RPC failure does not remove a successfully saved Master Listing row',async()=>{
 const x=makeWorkspace({documentsError:'simulated database error'});
 await x.ui.load();x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'SAVED EVEN IF FOLDERS FAIL SDN BHD'},true));
 assert.equal(x.ui.model.rows.length,1);
 assert.equal(x.saved.rows.length,1);
 assert.match(x.ui.state.error,/Documents company creation failed/);
 assert.equal(x.ui.state.addOpen,false);
});


test('New Documents company is appended to the Master Listing on creation',async()=>{
 const x=makeWorkspace();
 const result=await x.ui.syncDocumentCompanies([{name:'AUTOMATIC DOCS SDN BHD',registration_no:'202601234567'}]);
 assert.equal(result.added,1);
 assert.equal(x.saved.rows.length,1);
 assert.deepEqual(x.saved.rows[0].values,['1','AUTOMATIC DOCS SDN BHD','202601234567','N/A','N/A']);
 assert.equal(x.rpcs.length,0,'listing sync must not recreate Documents folders');
});

test('Repeat Documents sync skips duplicates and keeps existing statutory fields',async()=>{
 const x=makeWorkspace();
 await x.ui.load();x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'EXISTING SDN BHD',2:'202601234500',3:'21/10/2026',4:'31/12/2026'},false));
 const before=JSON.stringify(x.saved.rows[0]);
 const result=await x.ui.syncDocumentCompanies([
  {name:'Existing Sdn Bhd',registration_no:'202601234500'},
  {name:'SECOND DOCS SDN BHD',registration_no:'202602345678'},
  {name:'second docs sdn bhd',registration_no:'202602345678'}
 ]);
 assert.equal(result.added,1);
 assert.equal(result.existing,2);
 assert.equal(x.saved.rows.length,2);
 assert.equal(JSON.stringify(x.saved.rows[0]),before);
 assert.equal(x.saved.rows[1].values[0],'2');
 const again=await x.ui.syncDocumentCompanies([{name:'SECOND DOCS SDN BHD',registration_no:'202602345678'}]);
 assert.equal(again.added,0);
 assert.equal(x.saved.rows.length,2);
 assert.ok(x.uploads.some(u=>u.path.includes('/history/')),'private backup created before updating imported listing');
});

test('Reconcile Documents portfolio via new manual recovery action',async()=>{
 const x=makeWorkspace();
 x.companies.push({name:'RECOVERED SDN BHD',registration_no:'202601299999'});
 const result=await x.ui.syncDocumentCompanies(x.companies);
 assert.equal(result.added,1);
 assert.match(x.ui.render(),/Sync from Documents/);
});


test('Deleting Documents company also removes one matching Master Listing row with backup',async()=>{
 const x=makeWorkspace();
 await x.ui.syncDocumentCompanies([{name:'KEEP SDN BHD',registration_no:'202501234567'},{name:'REMOVE SDN BHD',registration_no:'202601234567'}]);
 const before=x.uploads.length;
 const done=await x.ui.removeDeletedCompany({name:'REMOVE SDN BHD',registration_no:'202601234567'},[{name:'KEEP SDN BHD',registration_no:'202501234567'}]);
 assert.equal(done.removed,1);
 assert.equal(x.saved.rows.length,1);
 assert.equal(x.saved.rows[0].values[1],'KEEP SDN BHD');
 assert.equal(x.saved.rows[0].values[0],'1');
 assert.ok(x.uploads.slice(before).some(u=>u.path.includes('/history/')));
});

test('Do not remove unrelated or ambiguously identified listing rows',async()=>{
 const x=makeWorkspace();
 await x.ui.syncDocumentCompanies([{name:'UNRELATED SDN BHD',registration_no:'202601111111'}]);
 const miss=await x.ui.removeDeletedCompany({name:'UNRELATED SDN BHD',registration_no:'202609999999'},[]);
 assert.equal(miss.removed,0);
 assert.equal(x.saved.rows.length,1);
 const protectedEntry=removeDeletedDocumentCompany(x.ui.model,{name:'UNRELATED SDN BHD',registration_no:'202601111111'},[{name:'UNRELATED SDN BHD',registration_no:'202601111111'}]);
 assert.equal(protectedEntry.removed,0);
});

test('Imported row without registration is removed on matched Documents deletion',async()=>{
 const x=makeWorkspace();
 await x.ui.load();x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'LEGACY SDN BHD',3:'21/10/2026'},false));
 const done=await x.ui.removeDeletedCompany({name:'LEGACY SDN BHD',registration_no:'202501234567'},[]);
 assert.equal(done.removed,1);
 assert.equal(x.saved.rows.length,0);
});

test('Deleting ordinary subfolders never changes Master Listing, and company deletion automatically synchronizes',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  // The company deletion uses an atomic Supabase RPC and a durable
  // cleanup queue to finish Master Listing and company storage deletion.
  assert.match(source,/delete_dms_company_cascade/);
  assert.match(source,/await finishPendingCompanyDeletions\(\)/);
  assert.match(source,/masterListingUI\.removeDeletedCompany\(\{/);
  assert.match(source,/await removeDeletedCompanyStorage\(/);
  assert.match(source,/await waitForHubWrites\(\)/);
 const tab=readFileSync(new URL('../src/master-listing-tab.js',import.meta.url),'utf8');
 assert.doesNotMatch(tab,/action==='ml-remove'/);
 assert.doesNotMatch(tab,/act\('Remove row','ml-remove'/);
 assert.doesNotMatch(tab,/async function removeListingCompany\(/);
 assert.match(source,/db\.from\('folders'\)\.delete\(\)\.eq\('id',m\.id\)/);
});


test('New Documents companies are placed alphabetically and No. is sequential',async()=>{
 const x=makeWorkspace();
 await x.ui.syncDocumentCompanies([
  {name:'ZENITH SDN BHD',registration_no:'202601000003'},
  {name:'ALPHA SDN BHD',registration_no:'202601000001'},
  {name:'BRAVO SDN BHD',registration_no:'202601000002'}
 ]);
 assert.deepEqual(x.saved.rows.map(r=>r.values[1]),['ALPHA SDN BHD','BRAVO SDN BHD','ZENITH SDN BHD']);
 assert.deepEqual(x.saved.rows.map(r=>r.values[0]),['1','2','3']);
 assert.deepEqual(x.saved.rows.map(r=>r.values[2]),['202601000001','202601000002','202601000003']);
 assert.equal(x.rpcs.length,0);
});

test('Alphabetical insert retains existing company dates and imported particulars',async()=>{
 const x=makeWorkspace();
 await x.ui.load();x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'ZULU SDN BHD',2:'202611111111',3:'21/10/2026',4:'31/12/2026'},false));
 const original=x.ui.model.rows[0];
 const result=await x.ui.syncDocumentCompanies([{name:'ALPHA SDN BHD',registration_no:'202622222222'}]);
 assert.equal(result.added,1);
 assert.deepEqual(x.saved.rows.map(r=>r.values[1]),['ALPHA SDN BHD','ZULU SDN BHD']);
 assert.deepEqual(x.saved.rows.map(r=>r.values[0]),['1','2']);
 assert.equal(x.saved.rows[1].id,original.id);
 assert.equal(x.saved.rows[1].values[3],'21/10/2026');
 assert.equal(x.saved.rows[1].values[4],'31/12/2026');
 assert.ok(x.uploads.some(u=>u.path.includes('/history/')));
});

test('Manual Master Listing Add Company also inserts alphabetically',async()=>{
 const x=makeWorkspace();
 await x.ui.load();x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'YELLOW SDN BHD',2:'202601234567'},false));
 x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'BLUE SDN BHD',2:'202609876543'},false));
 assert.deepEqual(x.saved.rows.map(r=>r.values[1]),['BLUE SDN BHD','YELLOW SDN BHD']);
 assert.deepEqual(x.saved.rows.map(r=>r.values[0]),['1','2']);
 assert.equal(x.ui.state.page,0);
});

test('Sorting existing ordered rows is stable and does not mutate particulars',()=>{
 const model={version:1,nameColumn:1,registrationColumn:2,
  columns:[{label:'No.'},{label:'Company Name'},{label:'Registration No.'},{label:'Financial Year End'}],
  rows:[{id:'a',values:['1','Alpha Sdn Bhd','202601234567','31/12/2026']},
        {id:'b',values:['2','Bravo Sdn Bhd','202607654321','30/09/2026']}]};
 const result=sortMasterListingCompanies(model);
 assert.equal(result.changed,false);
 assert.equal(result.model,model);
 assert.deepEqual(model.rows.map(r=>r.values[3]),['31/12/2026','30/09/2026']);
});


test('Opening Master Listing removes the previously deleted mmm company without touching Documents',async()=>{
 const x=makeWorkspace();
 await x.ui.load();
 x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'mmm',2:'202602300001'},false));
 x.ui.onClick('ml-add');
 await submitAndDrain(x.ui,x.form({1:'RETAINED SDN BHD',2:'202602300002',3:'23/10/2026'},false));
 const retained=x.saved.rows.find(r=>r.values[1]==='RETAINED SDN BHD');
 const result=await x.ui.reconcileOrphanedCompanies([{name:'RETAINED SDN BHD',registration_no:'202602300002'}]);
 assert.equal(result.removed,1);
 assert.deepEqual(result.names,['mmm']);
 assert.equal(x.saved.rows.length,1);
 assert.equal(x.saved.rows[0].id,retained.id);
 assert.equal(x.saved.rows[0].values[0],'1');
 assert.equal(x.saved.rows[0].values[3],'23/10/2026');
});

test('Previously auto-added Documents-only company is cleaned when company is absent from register',async()=>{
 const x=makeWorkspace();
 await x.ui.syncDocumentCompanies([{name:'ORPHAN SDN BHD',registration_no:'202611111111'},
  {name:'VALID SDN BHD',registration_no:'202622222222'}]);
 const clean=await x.ui.reconcileOrphanedCompanies([{name:'VALID SDN BHD',registration_no:'202622222222'}]);
 assert.equal(clean.removed,1);
 assert.deepEqual(x.saved.rows.map(r=>r.values[1]),['VALID SDN BHD']);
 assert.deepEqual(x.saved.rows.map(r=>r.values[0]),['1']);
 assert.ok(x.uploads.some(u=>u.path.includes('/history/')));
});

test('Imported-only records remain even when no Documents company folder exists',()=>{
 const model={version:1,nameColumn:1,registrationColumn:2,
  columns:[{label:'No.'},{label:'Company Name'},{label:'Registration No.'}],
  rows:[{id:'r0',values:['1','IMPORTED ONLY SDN BHD','202501234567']},
        {id:'doc-123',values:['2','OLD FOLDER SDN BHD','202601234567']}]};
 const result=reconcileDeletedDocumentRows(model,[]);
 assert.equal(result.removed,1);
 assert.deepEqual(result.model.rows.map(r=>r.values[1]),['IMPORTED ONLY SDN BHD']);
 assert.equal(model.rows.length,2,'original model not mutated');
});

test('Current Documents company and missing registration remain matched after reconciliation',()=>{
 const model={version:1,nameColumn:1,registrationColumn:2,
  columns:[{label:'No.'},{label:'Company Name'},{label:'Registration No.'}],
  rows:[{id:'doc-a',values:['1','CURRENT SDN BHD','N/A']}]};
 const result=reconcileDeletedDocumentRows(model,[{name:'current sdn bhd',registration_no:''}]);
 assert.equal(result.removed,0);
 assert.equal(result.model,model);
});

test('No manual Remove row button remains, and entering Master Listing refreshes company sync',()=>{
 const s=readFileSync(new URL('../src/master-listing-tab.js',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.doesNotMatch(s,/act\('Remove row'/);
 assert.doesNotMatch(s,/action==='ml-remove'/);
 assert.match(main,/await masterListingUI\.reconcileOrphanedCompanies\(state\.companies\)/);
});
