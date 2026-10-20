import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {
 openOfficeDocument,officeCellValue,officeEditCell,officeEditParagraph,
 exportOfficeDocument,makePreviousVersionName
} from '../src/office-editor.js';

globalThis.DOMParser=DOMParser;
globalThis.XMLSerializer=XMLSerializer;

const S='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const workbook='<workbook xmlns="'+S+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Register" sheetId="1" r:id="rId1"/><sheet name="Details" sheetId="2" r:id="rId2"/></sheets></workbook>';
const rel='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>';
const worksheet='<worksheet xmlns="'+S+'"><sheetData><row r="1"><c r="A1" t="s" s="1"><v>0</v></c><c r="B1"><v>123</v></c><c r="C1"><f>SUM(B1:B1)</f><v>123</v></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>Director</t></is></c></row></sheetData></worksheet>';
const worksheet2='<worksheet xmlns="'+S+'"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>UNTOUCHED</t></is></c></row></sheetData></worksheet>';
function asBlob(files){const z=zipSync(Object.fromEntries(Object.entries(files).map(([p,s])=>[p,strToU8(s)])));return new Blob([z]);}
function excelFixture(){return asBlob({
 'xl/workbook.xml':workbook,'xl/_rels/workbook.xml.rels':rel,
 'xl/sharedStrings.xml':'<sst xmlns="'+S+'"><si><t>Shareholder</t></si></sst>',
 'xl/worksheets/sheet1.xml':worksheet,'xl/worksheets/sheet2.xml':worksheet2,
 'xl/styles.xml':'<styles KEEP="TRUE"/>'
});}
function wordFixture(){return asBlob({
 'word/document.xml':'<w:document xmlns:w="'+W+'"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>HELLO </w:t></w:r><w:r><w:t>WORLD</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>TABLE CELL</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:t>DO NOT EDIT</w:t></w:r></w:p></w:body></w:document>',
 'word/media/image1.png':'placeholder-image-bytes','docProps/core.xml':'<coreFile preserved="yes"/>'
});}
test('XLSX editor reads two sheets, shared strings, numbers and formulas',async()=>{
 const model=await openOfficeDocument(excelFixture(),'company-register.xlsx');
 assert.equal(model.type,'xlsx');assert.deepEqual(model.sheets.map(s=>s.name),['Register','Details']);
 assert.equal(officeCellValue(model,1,0),'Shareholder');
 assert.equal(officeCellValue(model,1,1),'123');
 assert.equal(officeCellValue(model,1,2),'=SUM(B1:B1)');
});
test('XLSX editor changes existing and new cells while preserving unused ZIP components',async()=>{
 const model=await openOfficeDocument(excelFixture(),'company-register.xlsx');
 officeEditCell(model,1,0,'New shareholder');
 officeEditCell(model,2,3,'00400');
 officeEditCell(model,1,1,'145');
 const output=exportOfficeDocument(model);
 const entries=unzipSync(new Uint8Array(await output.arrayBuffer()));
 const xml=strFromU8(entries['xl/worksheets/sheet1.xml']);
 assert.match(xml,/New shareholder/);
 assert.match(xml,/00400/);
 assert.match(xml,/145/);
 assert.match(xml,/s="1"/);
 assert.ok(xml.includes('D2'));
 assert.equal(strFromU8(entries['xl/worksheets/sheet2.xml']),worksheet2);
 assert.equal(strFromU8(entries['xl/styles.xml']),'<styles KEEP="TRUE"/>');
 const reopened=await openOfficeDocument(output,'company-register.xlsx');
 assert.equal(officeCellValue(reopened,1,0),'New shareholder');
 assert.equal(officeCellValue(reopened,2,3),'00400');
});
test('DOCX editor preserves images and untouched paragraphs; changed body text saves',async()=>{
 const model=await openOfficeDocument(wordFixture(),'board-resolution.docx');
 assert.equal(model.type,'docx');
 assert.equal(model.word.paragraphs.length,3);
 assert.equal(model.word.paragraphs[0].text,'HELLO WORLD');
 assert.equal(model.word.paragraphs[2].editable,false);
 officeEditParagraph(model,0,'IT IS HEREBY RESOLVED THAT');
 officeEditParagraph(model,1,'REVISED TABLE CONTENT');
 const output=exportOfficeDocument(model);
 const zip=unzipSync(new Uint8Array(await output.arrayBuffer()));
 const xml=strFromU8(zip['word/document.xml']);
 assert.match(xml,/IT IS HEREBY RESOLVED THAT/);
 assert.match(xml,/REVISED TABLE CONTENT/);
 assert.match(xml,/DO NOT EDIT/);
 assert.match(xml,/w:b/);
 assert.equal(strFromU8(zip['word/media/image1.png']),'placeholder-image-bytes');
 const reopened=await openOfficeDocument(output,'board-resolution.docx');
 assert.equal(reopened.word.paragraphs[0].text,'IT IS HEREBY RESOLVED THAT');
});
test('unsupported Office files and unchanged files cannot be written',async()=>{
 await assert.rejects(openOfficeDocument(wordFixture(),'document.doc'),/supports .xlsx and .docx/);
 const model=await openOfficeDocument(wordFixture(),'document.docx');
 assert.throws(()=>exportOfficeDocument(model),/no edits/i);
 assert.match(makePreviousVersionName('Annual Return.xlsx',new Date('2026-10-20T00:00:00Z')),/previous 20261020-000000/);
});
test('DMS wiring offers edit action and private versioned storage',async()=>{
 const {readFileSync}=await import('node:fs');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/edit-office/);
 assert.match(main,/save-office-replace/);
 assert.match(main,/save-office-copy/);
 assert.match(main,/storage_path:original.storage_path/);
 assert.match(main,/state.officeEditor/);
});
