import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {zipSync,strToU8} from 'fflate';
import {openMasterListingWorkbook} from '../src/master-listing-reader.js';

globalThis.DOMParser=DOMParser;
const mainXml=String.raw`<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="inlineStr"><is><t>No</t></is></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
  <row r="2"><c r="A2"><v>1</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" t="inlineStr"><is><t>202601234567 (123456-A)</t></is></c></row>
  <row r="3"><c r="A3"><v>2</v></c><c r="B3" t="inlineStr"><is><t>TEST B SDN. BHD.</t></is></c><c r="C3" t="inlineStr"><is><t>202698765432</t></is></c></row>
</sheetData></worksheet>`;
const workbookXml=String.raw`<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
<sheet name="Master Listing" sheetId="1" r:id="rId1"/>
<sheet name="Sheet1" sheetId="2" r:id="rId2"/>
</sheets></workbook>`;
const relsXml=String.raw`<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Target="worksheets/sheet2.xml"/>
</Relationships>`;
const stringsXml=String.raw`<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>Company Name</t></si><si><t>Registration No.</t></si>
  <si><r><t>EXAMPLE SDN.</t></r><r><t> BHD.</t></r></si>
</sst>`;
function fixture(){
  const data=zipSync({
    'xl/workbook.xml':strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels':strToU8(relsXml),
    'xl/sharedStrings.xml':strToU8(stringsXml),
    'xl/worksheets/sheet1.xml':strToU8(mainXml),
    // This unrelated worksheet should NOT prevent reading Master Listing.
    'xl/worksheets/sheet2.xml':strToU8('<worksheet><invalid>')
  });
  const file=new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  file.name='Master Listing.xlsx';
  return file;
}
test('selects Master Listing and reads shared/inline strings without processing broken other sheets',async()=>{
  const x=await openMasterListingWorkbook(fixture());
  assert.deepEqual(x.sheetNames,['Master Listing','Sheet1']);
  assert.equal(x.preferred,'Master Listing');
  const rows=x.readSheet(x.preferred);
  assert.equal(rows[0][1],'Company Name');
  assert.equal(rows[0][2],'Registration No.');
  assert.equal(rows[1][1],'EXAMPLE SDN. BHD.');
  assert.equal(rows[1][2],'202601234567 (123456-A)');
  assert.equal(rows[2][1],'TEST B SDN. BHD.');
});
test('rejects empty/corrupt and password-protected workbooks',async()=>{
  const blank=new Blob(['invalid']);blank.name='Master Listing.xlsx';
  await assert.rejects(openMasterListingWorkbook(blank),/empty|could not be accessed|valid/i);
});
