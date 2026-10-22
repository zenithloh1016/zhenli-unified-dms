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


function styledDatesFixture(date1904=false){
 const serial1900=(Date.UTC(2026,9,20)-Date.UTC(1899,11,30))/86400000;
 const serial1904=(Date.UTC(2026,9,20)-Date.UTC(1904,0,1))/86400000;
 const serial=date1904?serial1904:serial1900;
 const dateSheet=[
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
 '<row r="1"><c r="A1" t="inlineStr"><is><t>Company Name</t></is></c>',
 '<c r="B1" t="inlineStr"><is><t>AR Due Date</t></is></c>',
 '<c r="C1" t="inlineStr"><is><t>FYE</t></is></c>',
 '<c r="D1" t="inlineStr"><is><t>Company number</t></is></c>',
 '<c r="E1" t="inlineStr"><is><t>Custom long date</t></is></c>',
 '<c r="F1" t="inlineStr"><is><t>Built-in date</t></is></c>',
 '<c r="G1" t="inlineStr"><is><t>Excel date type</t></is></c></row>',
 '<row r="2"><c r="A2" t="inlineStr"><is><t>TEST COMPANY SDN BHD</t></is></c>',
 '<c r="B2" s="1"><v>'+serial+'</v></c>',
 '<c r="C2" s="2"><v>'+serial+'</v></c>',
 '<c r="D2"><v>123456789012</v></c>',
 '<c r="E2" s="3"><v>'+serial+'</v></c>',
 '<c r="F2" s="4"><v>'+serial+'</v></c>',
 '<c r="G2" s="1" t="d"><v>2026-10-20T00:00:00</v></c>',
 '</row></sheetData></worksheet>'
 ].join('');
 const styles=[
 '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
 '<numFmts count="3">',
 '<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>',
 '<numFmt numFmtId="165" formatCode="dd.mm.yyyy"/>',
 '<numFmt numFmtId="166" formatCode="dd-mmm-yyyy"/>',
 '</numFmts>',
 '<cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/>',
 '<xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="166" applyNumberFormat="1"/>',
 '<xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>'
 ].join('');
 const wb='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
  '<workbookPr date1904="'+(date1904?'1':'0')+'"/><sheets><sheet name="Master Listing" sheetId="1" r:id="rId1"/></sheets></workbook>';
 const bytes=zipSync({
  'xl/workbook.xml':strToU8(wb),
  'xl/_rels/workbook.xml.rels':strToU8(relsXml),
  'xl/styles.xml':strToU8(styles),
  'xl/worksheets/sheet1.xml':strToU8(dateSheet)
 });
 const file=new Blob([bytes]);file.name='Styled Master Listing.xlsx';return file;
}
test('keeps Excel displayed DD/MM/YYYY, DD.MM.YYYY, month text and built-in date style',async()=>{
 const book=await openMasterListingWorkbook(styledDatesFixture());
 const values=book.readSheet(book.preferred)[1];
 assert.equal(values[1],'20/10/2026');
 assert.equal(values[2],'20.10.2026');
 assert.equal(values[3],'123456789012');
 assert.equal(values[4],'20-Oct-2026');
 assert.equal(values[5],'10/20/26');
 assert.equal(values[6],'20/10/2026');
});
test('converts styled Excel dates correctly for the 1904 calendar system',async()=>{
 const book=await openMasterListingWorkbook(styledDatesFixture(true));
 const values=book.readSheet(book.preferred)[1];
 assert.equal(values[1],'20/10/2026');
 assert.equal(values[2],'20.10.2026');
 assert.equal(values[6],'20/10/2026');
});


test('sparse statutory reader avoids thousands of style-only blank cells while retaining row positions',async()=>{
 const empty=Array.from({length:1000},(_,index)=>{
  const n=index+1;
  if(n===4)return '<row r="4"><c r="A4" t="inlineStr"><is><t>Company Name:</t></is></c><c r="B4" t="inlineStr"><is><t>BCS TEAM SDN BHD</t></is></c></row>';
  if(n===1000)return '<row r="1000"><c r="A1000" t="inlineStr"><is><t>Last entry</t></is></c></row>';
  return '<row r="'+n+'">'+Array.from({length:27},(_,c)=>'<c r="'+String.fromCharCode(65+c%26)+n+'" s="1"/>').join('')+'</row>';
 }).join('');
 const workbook=workbookXml.replace('Master Listing','Master');
 const bytes=zipSync({
  'xl/workbook.xml':strToU8(workbook),
  'xl/_rels/workbook.xml.rels':strToU8(relsXml),
  'xl/worksheets/sheet1.xml':strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+empty+'</sheetData></worksheet>'),
  'xl/worksheets/sheet2.xml':strToU8('<worksheet/>')
 });
 const file=new Blob([bytes]);file.name='Register Book_BCS TEAM SDN BHD.xlsx';
 const parsed=await openMasterListingWorkbook(file);
 const normal=parsed.readSheet('Master');
 const sparse=parsed.readSheet('Master',{sparse:true});
 assert.equal(normal[3][0],'Company Name:');
 assert.equal(sparse[3][0],'Company Name:');
 assert.equal(sparse[3][1],'BCS TEAM SDN BHD');
 assert.equal(sparse[999][0],'Last entry');
 assert.deepEqual(sparse[0],[]);
 assert.equal(sparse.length,normal.length);
});
