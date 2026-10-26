import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildMasterListing,formattedListingCell,isAffirmativeConstitutionValue,
 repairListingConstitutionPlaceholders
} from '../src/master-listing-data.js';
import {
 isConstitutionDocumentFilename,companiesWithConstitutionDocuments,
 applyConstitutionDocumentEvidence
} from '../src/master-listing-constitution-sync.js';
import {createMasterListingTab} from '../src/master-listing-tab.js';

const companies=[
 {id:'a',name:'ALPHA COMPANY SDN BHD',registration_no:'202600000001'},
 {id:'b',name:'BETA COMPANY SDN BHD',registration_no:'202600000002'},
 {id:'c',name:'CHARLIE COMPANY SDN BHD',registration_no:'202600000003'},
 {id:'d',name:'DELTA COMPANY SDN BHD',registration_no:'202600000004'}
];
function sample(){
 return buildMasterListing([
  ['No.','Company Name','Registration No.','Constitution'],
  ['1',companies[0].name,companies[0].registration_no,'N/A'],
  ['2',companies[1].name,companies[1].registration_no,'No'],
  ['3',companies[2].name,companies[2].registration_no,'N/A'],
  ['4',companies[3].name,companies[3].registration_no,'Adopted']
 ]);
}
const folders=[
 {id:'fa',company_id:'a',parent_id:null,name:'Constitution'},
 {id:'fa-nested',company_id:'a',parent_id:'fa',name:'Amendments'},
 {id:'fb',company_id:'b',parent_id:null,name:'Memorandum & Articles of Association'},
 {id:'fc',company_id:'c',parent_id:null,name:'Constitution'},
 {id:'fd',company_id:'d',parent_id:null,name:'Constitution'}
];
test('confirmed Constitution, adoption and Yes normalize to Yes on import and cloud migration',()=>{
 const model=sample();
 for(const value of ['Yes','Y','Adopted','Constitution adopted','Has Constitution','Available','True']){
  assert(isAffirmativeConstitutionValue(value),value);
  assert.equal(formattedListingCell(model,3,value),'Yes',value);
 }
 for(const value of ['No','N/A','Unconfirmed','Adopted 2024','Not adopted']){
  assert.equal(isAffirmativeConstitutionValue(value),false,value);
 }
 assert.equal(model.rows[3].values[3],'Yes');
 model.rows[0].values[3]='has constitution';
 const repaired=repairListingConstitutionPlaceholders(model);
 assert.equal(repaired.count,1);
 assert.equal(repaired.model.rows[0].values[3],'Yes');
 assert.equal(repaired.model.rows[1].values[3],'No');
});

test('empty Constitution folder is never evidence; actual uploaded document is',()=>{
 assert.equal(companiesWithConstitutionDocuments(folders,[]).size,0);
 assert(!isConstitutionDocumentFilename('sample-constitution-template.pdf'));
 assert(!isConstitutionDocumentFilename('Board Resolution.pdf'));
 assert(isConstitutionDocumentFilename('Company Constitution (signed).pdf'));
 const docs=[
  {company_id:'a',folder_id:'fa-nested',name:'signed-version.pdf'},
  {company_id:'b',folder_id:'fb',name:'M&A executed.pdf'},
  {company_id:'c',folder_id:'missing-folder',name:'Certificate of Constitution.pdf'},
  {company_id:'d',folder_id:'fd',name:'draft-sample.pdf'}
 ];
 const ids=companiesWithConstitutionDocuments(folders,docs);
 assert.deepEqual([...ids].sort(),['a','b','c'],
  'drafts in Constitution folders are not evidence of an adopted Constitution');
 const res=applyConstitutionDocumentEvidence(sample(),companies,folders,docs);
 assert.equal(res.count,2);
 assert.equal(res.conflicts,1,'explicit No is never silently overwritten');
 assert.deepEqual(res.model.rows.map(x=>x.values[3]),['Yes','No','Yes','Yes']);
 assert.deepEqual(sample().rows.map(x=>x.values[3]),['N/A','No','N/A','Yes']);
 assert.equal(applyConstitutionDocumentEvidence(res.model,companies,folders,docs).count,0);
});
test('ambiguous templates in unrelated folders do not count as Constitution',()=>{
 const records=[
  {company_id:'a',folder_id:'missing',name:'Draft Constitution Template.docx'},
  {company_id:'b',folder_id:'missing',name:'Board Resolution.pdf'},
  {company_id:'c',folder_id:'fa',name:'normal.pdf'}
 ];
 assert.equal(companiesWithConstitutionDocuments(folders,records).size,0);
});

test('authenticated Master Listing sync stores Yes with private backup and supports editor selection',async()=>{
 const model=sample(),remote={value:JSON.stringify(model)};
 const uploads=[];
 const db={
  storage:{from:()=>({
   download:async()=>({data:new Blob([remote.value]),error:null}),
   upload:async(path,blob,opts)=>{
    const value=JSON.parse(await blob.text());
    uploads.push({path,value,opts});
    if(path.endsWith('/current.json'))remote.value=JSON.stringify(value);
    return {error:null};
   }
  })},
  from:table=>({
   select:()=>({
    eq:()=>({
     range:async()=>({data:table==='folders'?folders:[
      {company_id:'a',folder_id:'fa',name:'Constitution.pdf'}
     ],error:null})
    })
   })
  })
 };
 const tab=createMasterListingTab({
  db,getUser:()=>({id:'test-account'}),getCompanies:()=>companies,
  openCompany:()=>{},notify:()=>{}
 });
 await tab.load();
 const res=await tab.syncConstitutionDocuments({reload:false});
 assert.equal(res.count,1);
 assert.equal(uploads.length,2);
 assert.match(uploads[0].path,/master-listing\/history\//);
 assert.match(uploads[1].path,/master-listing\/current\.json/);
 assert.deepEqual(JSON.parse(remote.value).rows.map(x=>x.values[3]),['Yes','No','N/A','Yes']);
 assert.match(tab.render(),/Sync Constitution Status/);
 assert.match(tab.state.status,/1 Constitution value.*Yes/);
 tab.onClick('ml-edit','0');
 const html=tab.render();
 assert.match(html,/<select name="ml-col-3">/);
 assert.match(html,/<option value="YES" selected>YES<\/option>/);
});
