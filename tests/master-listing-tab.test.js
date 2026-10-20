import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMasterListing,detectListingColumns,changeListingCell,findCompanyMatch,listingRowsForSearch,validateMasterListing,listingCSV,isListingDateColumn,excelSerialToDateString,displayedListingValue,countLegacyDateSerials,repairLegacyDateSerials} from '../src/master-listing-data.js';
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
 assert.deepEqual(validateMasterListing(JSON.parse(JSON.stringify(model))),model);
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
 assert.match(tab.render(),/No Master Listing imported yet/);
});


test('full screen shows every imported Master Listing column and can be exited',()=>{
 const tab=createMasterListingTab({db:{storage:{from:()=>({})}},
  getUser:()=>({id:'demo'}),getCompanies:()=>[],openCompany:()=>{},
  refreshCompanies:()=>{},notify:()=>{}});
 const data=[
  ['Company Name','Registration Number','AR Date','FYE','Phone','Secretary','Director','Extra notes'],
  ['TEST COMPANY SDN BHD','202600000001','20/10/2026','20.10.2026','0121234567','ZHENLI','Director A','Notes']
 ];
 tab.state.model=buildMasterListing(data);
 let html=tab.render();
 assert.match(html,/Full screen/);
 assert.ok(!html.includes('<th title="Extra notes">'));
 assert.equal(tab.onClick('ml-fullscreen',''),true);
 html=tab.render();
 assert.match(html,/ml-workspace-fullscreen/);
 assert.match(html,/Exit full screen/);
 assert.ok(html.includes('<th title="Extra notes">'));
 assert.ok(html.includes('20/10/2026'));
 assert.ok(!html.includes('20.10.2026'));
 assert.ok(html.includes('20/10/2026'));
 assert.ok(!html.includes('<th>#</th>'));
 assert.ok(!html.includes('>1</td><td><strong>TEST COMPANY'));
 assert.equal(tab.exitFullscreen(),true);
 assert.equal(tab.exitFullscreen(),false);
 assert.ok(!tab.render().includes('ml-workspace-fullscreen'));
});


test('numeric date cells are shown and imported as dates, leaving company registration and shares untouched',()=>{
 const excelSerial=(Date.UTC(2026,9,20)-Date.UTC(1899,11,30))/86400000;
 const source=[
 ['Company Name','Registration No.','Date of Incorporation','FYE','AR Due Date','Issued Share Capital','Amount','Phone'],
 ['TEST SDN BHD','202601234567',String(excelSerial),String(excelSerial),String(excelSerial),'46000','46000','0161234567']
 ];
 const model=buildMasterListing(source);
 assert.equal(isListingDateColumn('AR Due Date'),true);
 assert.equal(isListingDateColumn('Registration No.'),false);
 assert.equal(isListingDateColumn('Share Capital'),false);
 assert.equal(excelSerialToDateString(String(excelSerial)),'20/10/2026');
 assert.deepEqual(model.rows[0].values.slice(2,5),['20/10/2026','20/10/2026','20/10/2026']);
 assert.equal(model.rows[0].values[1],'202601234567');
 assert.equal(model.rows[0].values[5],'46000');
 assert.equal(model.rows[0].values[6],'46000');
});
test('previously saved date serials display as dates and can be safely repaired with a backup',()=>{
 const serial=(Date.UTC(2026,9,20)-Date.UTC(1899,11,30))/86400000;
 const model=buildMasterListing([
 ['Company Name','Date of Incorporation','Company Reg No.','Share Capital','AFS FYE'],
 ['MY COMPANY SDN BHD','20/10/2026','202612345678','46000','20/10/2026']
 ]);
 model.rows[0].values[1]=String(serial);
 model.rows[0].values[4]=String(serial);
 assert.equal(countLegacyDateSerials(model),2);
 assert.equal(displayedListingValue(model,1,model.rows[0].values[1]),'20/10/2026');
 assert.equal(displayedListingValue(model,2,model.rows[0].values[2]),'202612345678');
 const {model:fixed,count}=repairLegacyDateSerials(model);
 assert.equal(count,2);
 assert.equal(model.rows[0].values[1],String(serial),'original state retained for backup');
 assert.equal(fixed.rows[0].values[1],'20/10/2026');
 assert.equal(fixed.rows[0].values[4],'20/10/2026');
 assert.equal(fixed.rows[0].values[3],'46000');
 assert.equal(countLegacyDateSerials(fixed),0);
});
test('legacy date serials display correctly in the full-screen saved listing',()=>{
 const serial=(Date.UTC(2026,9,20)-Date.UTC(1899,11,30))/86400000;
 const tab=createMasterListingTab({db:{storage:{from:()=>({})}},
  getUser:()=>({id:'demo'}),getCompanies:()=>[],openCompany:()=>{},
  refreshCompanies:()=>{},notify:()=>{}});
 tab.state.model=buildMasterListing([['Company Name','AR Date'],['MY COMPANY SDN BHD','20/10/2026']]);
 tab.state.model.rows[0].values[1]=String(serial);
 tab.state.legacyDateCount=countLegacyDateSerials(tab.state.model);
 tab.onClick('ml-fullscreen','');
 const html=tab.render();
 assert.match(html,/20\/10\/2026/);
 assert.match(html,/Save corrected dates/);
 assert.match(html,/saved date serial/);
});

test('legacy numbering is hidden, blank cells are N/A, and ALL dates show DD/MM/YYYY',()=>{
 const rows=[
 ['No.','Company Name','Company Registration No.','AR Lodgement','AFS FYE','Date of Incorporation','Note','Share Capital','Other Date'],
 ['1','ALPHA SDN BHD','202601234567','20.10.2026','2026-10-20','20-Oct-2026','','45000','10/20/2026'],
 ['2','BETA SDN BHD','','20/10/2026','20/10/2026','','','46000','']
 ];
 const model=buildMasterListing(rows);
 assert.deepEqual(model.rows[0].values.slice(3,6),['20/10/2026','20/10/2026','20/10/2026']);
 assert.equal(model.rows[0].values[6],'N/A');
 assert.equal(model.rows[0].values[7],'45000');
 assert.equal(model.rows[0].values[8],'20/10/2026');
 assert.equal(model.rows[1].values[2],'N/A');
 assert.equal(model.rows[1].values[5],'N/A');
 assert.ok(listingCSV(model).includes('"N/A"'));
 const tab=createMasterListingTab({db:{storage:{from:()=>({})}},
  getUser:()=>({id:'demo'}),getCompanies:()=>[],openCompany:()=>{},
  refreshCompanies:()=>{},notify:()=>{}});
 tab.state.model=model;
 tab.onClick('ml-fullscreen','');
 const html=tab.render();
 assert.ok(!html.includes('<th>#</th>'));
 assert.ok(!html.includes('<th title="No.">'));
 assert.ok(html.includes('<th title="AR Lodgement">'));
 assert.ok(!html.includes('20.10.2026'));
 assert.ok(html.includes('20/10/2026'));
 assert.ok(html.includes('N/A'));
 assert.ok(html.includes('<th title="Other Date">'));
 assert.ok(!html.includes('<tr><td>1</td><td><strong>ALPHA'));
});
test('editing blank Master Listing cells saves N/A and leaves existing nondate IDs unchanged',()=>{
 const model=buildMasterListing([['Company Name','Registration No.','Remarks','FYE'],['ALPHA SDN BHD','202601234567','','20.10.2026']]);
 changeListingCell(model,0,2,'   ');
 assert.equal(model.rows[0].values[2],'N/A');
 changeListingCell(model,0,3,'2026/10/20');
 assert.equal(model.rows[0].values[3],'20/10/2026');
 assert.equal(model.rows[0].values[1],'202601234567');
});
