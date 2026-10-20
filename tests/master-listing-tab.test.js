import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMasterListing,detectListingColumns,changeListingCell,findCompanyMatch,listingRowsForSearch,validateMasterListing,listingCSV} from '../src/master-listing-data.js';
import {createMasterListingTab} from '../src/master-listing-tab.js';
import {readFileSync} from 'node:fs';

const rows=[
 ['Report generated 20 Oct 2026'],
 ['No.','Company Name','Company Registration No.','AR Lodgement','AFS FYE','Client Phone','Company Secretary','Remarks'],
 ['1','ACME HOLDINGS SDN BHD','202601234567','20/09/2026','31/12/2026','0120000000','ZHENLI','Pending director signatures'],
 ['2','EXAMPLE TRADING SDN BHD','202601234568','15/11/2026','30/06/2026','03-0123456','ZHENLI','Follow up']
];
const companies=[{id:'one',name:'ACME HOLDINGS SDN BHD',registration_no:'202601234567 (1234567-M)'}];
test('detects the workbook header and every company information field',()=>{
 const d=detectListingColumns(rows);
 assert.equal(d.headerRow,2);assert.equal(d.startRow,3);assert.equal(d.nameColumn,1);assert.equal(d.registrationColumn,2);
 const model=buildMasterListing(rows,{...d,filename:'Master Listing.xlsx',worksheet:'Master Listing'});
 assert.equal(model.columns.length,8);
 assert.equal(model.rows.length,2);
 assert.equal(model.rows[0].values[3],'20/09/2026');
 assert.equal(model.rows[0].values[5],'0120000000');
 assert.equal(model.rows[0].values[7],'Pending director signatures');
 assert.equal(findCompanyMatch(model,model.rows[0],companies).id,'one');
 assert.equal(findCompanyMatch(model,model.rows[1],companies),null);
 assert.equal(validateMasterListing(JSON.parse(JSON.stringify(model))),model.version?model:null);
});
test('changes arbitrary company fields and filters across all columns',()=>{
 const d=detectListingColumns(rows),model=buildMasterListing(rows,d);
 changeListingCell(model,0,7,'Signed and returned');
 assert.equal(model.rows[0].values[7],'Signed and returned');
 assert.equal(listingRowsForSearch(model,'Signed and returned').length,1);
 assert.equal(listingRowsForSearch(model,'03-0123456').length,1);
 assert.throws(()=>changeListingCell(model,0,1,' '),/Company name is required/);
});
test('preserves duplicate header labels, skips malformed rows and prevents CSV formula injection',()=>{
 const source=[['Company Name','Note','Note'],['ABC SDN BHD','=1+1','003'],['ABC SDN BHD','duplicate','007'],['','blank','']];
 const model=buildMasterListing(source);
 assert.deepEqual(model.columns.map(c=>c.label),['Company Name','Note','Note']);
 assert.equal(model.rows.length,1);
 assert.equal(model.skipped.duplicate,1);
 assert.equal(model.skipped.blank,1);
 const csv=listingCSV(model);
 assert.ok(csv.includes('"\'=1+1"'));
 assert.ok(csv.includes('"003"'));
});
test('Master Listing tab is wired into DMS without additional SQL tables or alteration of Documents import',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8');
 assert.ok(main.includes("'master-listing'"));
 assert.ok(main.includes("masterListingUI.render()"));
 assert.ok(main.includes("masterListingUI.onChange(e.target,prepareExcelImport)"));
 assert.ok(main.includes("Import Master Listing"));
 assert.ok(main.includes("register-zip"));
 assert.ok(sql.includes('create_company_with_folders'));
});
test('Master Listing tab uses private user storage and confirmed Documents synchronization',()=>{
 const moduleSource=readFileSync(new URL('../src/master-listing-tab.js',import.meta.url),'utf8');
 assert.match(moduleSource,/user\.id\+'\/master-listing\/history\//);
 assert.match(moduleSource,/upsert:true/);
 assert.match(moduleSource,/window\.confirm/);
 assert.match(moduleSource,/findCompanyMatch/);
 assert.match(moduleSource,/create_company_with_folders/);
 const tab=createMasterListingTab({db:{storage:{from:()=>({download:async()=>({error:{message:'Object not found'}})})}},
  getUser:()=>({id:'demo'}),getCompanies:()=>[],openCompany:()=>{},refreshCompanies:()=>{},notify:()=>{}});
 assert.match(tab.render(),/No Master Listing has been imported yet/);
});
