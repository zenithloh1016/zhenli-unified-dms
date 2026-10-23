import test from 'node:test';
import assert from 'node:assert/strict';
import {createMasterListingTab} from '../src/master-listing-tab.js';

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
