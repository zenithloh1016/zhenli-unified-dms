import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegisterBookTab} from '../src/register-book-tab.js';
import {makeRegisterBook,mergeRegisterBooks,sanitizeSheet,validateRegisterBook} from '../src/statutory-register-data.js';

const companies=[
 {id:'c1',name:'ALPHA SDN BHD',registration_no:'202601234567'},
 {id:'c2',name:'BETA SDN BHD',registration_no:'202609876543'}
];
function fixture(custom=companies){
 const blobs=new Map(),written=[];
 const storage={
  list:async()=>({data:[...blobs.keys()].filter(k=>k.startsWith('u1/statutory-registers/'))
   .map(k=>({id:k,name:k.split('/').at(-1)})),error:null}),
  download:async path=>blobs.has(path)?
   {data:blobs.get(path),error:null}:{data:null,error:{message:'Object not found',statusCode:404}},
  upload:async(path,blob)=>{blobs.set(path,blob);written.push(path);return {error:null};}
 };
 const db={storage:{from:()=>storage},from(table){
  const q={select(){return q;},eq(){return q;},is(){return q;},ilike(){return q;},order(){return q;},
   limit:async()=>({data:[],error:null})};return q;
 }};
 const tab=createRegisterBookTab({db,getUser:()=>({id:'u1'}),getCompanies:()=>custom});
 return {tab,blobs,written};
}
test('Statutory Registers replaces the old file directory',()=>{
 const {tab}=fixture();
 const html=tab.render();
 assert.match(html,/Statutory Registers/);
 assert.match(html,/Import Register Book ZIP/);
 assert.match(html,/data-action="sr-open"/);
 assert.doesNotMatch(html,/Folder not yet created/);
 assert.match(html,/ALPHA SDN BHD/);
});
test('initializes only missing company statutory registers with the same editable DMS layout',async()=>{
 const {tab,blobs,written}=fixture();
 const prior=makeRegisterBook(companies[0],{path:'Existing Registers.xlsx',sheets:[
  {name:'Register of Directors',rows:[['Name','Identification No.','Appointment Date'],['Existing director','ID1','01/01/2026']]}
 ]});
 const original=new Blob([JSON.stringify(prior)],{type:'application/json'});
 blobs.set('u1/statutory-registers/c1.json',original);
 await tab.load();
 assert.equal(tab.state.available.size,2);
 assert.equal(written.filter(p=>p==='u1/statutory-registers/c1.json').length,0,'imported originals must not be overwritten');
 assert.strictEqual(blobs.get('u1/statutory-registers/c1.json'),original);
 assert(written.includes('u1/statutory-registers/c2.json'));
 const created=JSON.parse(await blobs.get('u1/statutory-registers/c2.json').text());
 assert.equal(created.companyId,'c2');
 assert.equal(created.sourceFile,'Manual entry');
 assert.deepEqual(created.sheets.map(s=>s.name),[
  'Register of Directors','Register of Members','Register of Beneficial Owners',
  'Register of Secretaries','Register of Charges',
  'Register of Share Allotments','Register of Share Transfers'
 ]);
 assert(created.sheets.find(s=>s.name==='Register of Charges').rows[0].includes('Date of Discharge'));
 assert(created.sheets.every(s=>s.rows.length===1),'do not invent any statutory particulars');
 await tab.load(true);
 assert.equal(written.filter(p=>p==='u1/statutory-registers/c2.json').length,1,'repeat refresh must be idempotent');
 await tab.openCompany('c2');
 assert.match(tab.render(),/Register of Directors/);
 assert.match(tab.render(),/Export This Register PDF/);
});

test('newly added companies receive templates on the next register-tab visit',async()=>{
 const growing=[companies[0]];
 const {tab,blobs,written}=fixture(growing);
 await tab.load();
 assert(blobs.has('u1/statutory-registers/c1.json'));
 growing.push(companies[1]);
 await tab.load();
 assert(blobs.has('u1/statutory-registers/c2.json'));
 assert.equal(written.filter(p=>p==='u1/statutory-registers/c1.json').length,1);
 assert.equal(written.filter(p=>p==='u1/statutory-registers/c2.json').length,1);
});

test('each statutory register opens independently without Annual Return or Excel layout',async()=>{
 const {tab}=fixture();
 await tab.openCompany('c1');
 assert.equal(tab.state.book.companyId,'c1');
 let html=tab.render();
 assert.match(html,/Register of Directors|Directors/);
 assert.match(html,/Export This Register PDF/);
 assert.match(html,/Add Entry/);
 assert.match(html,/Add Field/);
 assert.match(html,/data-action="sr-sheet"/);
 assert.match(html,/data-action="sr-save"/);
 assert.match(html,/sr-ar-paper/);
 assert.doesNotMatch(html,/Annual Return Layout|Original Worksheet|sr-mode-worksheet|rb-grid-scroll/);
 tab.command('sr-sheet','2');
 html=tab.render();
 assert.match(html,/Beneficial Owners/);
 assert.equal(tab.state.sheetIndex,2);
 assert.doesNotMatch(html,/Annual Return Layout|Original Worksheet|rb-grid/);
});
test('add statutory entries and fields using register controls',async()=>{
 const {tab}=fixture();
 await tab.openCompany('c1');
 const previousPrompt=globalThis.window;
 globalThis.window={prompt:()=> 'NEW DIRECTOR'};
 try{
  const starting=tab.state.book.sheets[0].rows.length;
  tab.command('sr-add-row');
  assert.equal(tab.state.book.sheets[0].rows.length,starting+1);
  assert.match(tab.render(),/NEW DIRECTOR/);
  globalThis.window.prompt=()=> 'Passport No.';
  tab.command('sr-add-col');
  assert.match(tab.render(),/Passport No./);
  assert.equal(tab.state.dirty,true);
 }finally{globalThis.window=previousPrompt;}
});
test('saves edited register privately and reloads it',async()=>{
 const {tab,blobs,written}=fixture();
 await tab.openCompany('c1');
 globalThis.document={getElementById:()=>null};
 assert.equal(tab.updateCell({dataset:{r:'0',c:'0'},value:'Director Name (Revised)'}),true);
 assert.equal(tab.state.dirty,true);
 await tab.save();
 assert.equal(tab.state.dirty,false);
 assert(written.some(path=>path==='u1/statutory-registers/c1.json'));
 assert(blobs.has('u1/statutory-registers/c1.json'));
 tab.closeCompany();
 await tab.openCompany('c1');
 assert.equal(tab.state.book.sheets[0].rows[0][0],'Director Name (Revised)');
});
test('directory filters companies and escapes names',()=>{
 const data=[{id:'x',name:'<script>alert(1)</script>',registration_no:'12'},...companies];
 const {tab}=fixture(data);
 let html=tab.render();
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 tab.search('202609876543');
 html=tab.render();
 assert.match(html,/BETA SDN BHD/);
 assert.doesNotMatch(html,/ALPHA SDN BHD/);
});
test('directory pagination and worksheet data validations',()=>{
 const data=Array.from({length:26},(_,i)=>({id:'c'+i,name:'COMPANY '+String(i).padStart(2,'0')}));
 const {tab}=fixture(data);
 assert.match(tab.render(),/COMPANY 00/);
 assert.doesNotMatch(tab.render(),/COMPANY 25/);
 tab.command('rb-next');
 assert.match(tab.render(),/COMPANY 25/);
 const book=makeRegisterBook(companies[0]);
 assert.equal(book.version,1);
 assert(validateRegisterBook(book));
 assert.deepEqual(sanitizeSheet(' Directors ',[['Name','Date'],['Alice','01/01/2026'],['','']]).rows,
  [['Name','Date'],['Alice','01/01/2026']]);
});

test('repeat ZIP conversion preserves manually edited worksheets and skips identical originals',()=>{
 const old=makeRegisterBook(companies[0]);
 old.sheets[0].rows.push(['Changed by secretary','ID 123']);
 const incoming=makeRegisterBook(companies[0],{path:'Register Book_ALP.xlsx',
   sheets:[{name:'Register of Directors',rows:[['Name','ID'],['New Director','ID 888']]}]});
 const merged=mergeRegisterBooks(old,incoming);
 assert.equal(merged.added,1);
 assert.equal(merged.skipped,0);
 assert.equal(merged.book.sheets.length,old.sheets.length+1);
 assert.deepEqual(merged.book.sheets[0].rows.at(-1),['Changed by secretary','ID 123']);
 assert.match(merged.book.sheets.at(-1).name,/Imported/);
 const repeated=mergeRegisterBooks(merged.book,incoming);
 // Identical changed content must be recognized by original or imported section title.
 assert.equal(repeated.book.sheets.length,merged.book.sheets.length);
});
test('preserved original files panel remains available in Statutory Registers',async()=>{
 const {tab}=fixture();
 await tab.openCompany('c1');
 assert.equal(Array.isArray(tab.state.originalDocs),true);
 assert.match(tab.render(),/Statutory Registers|Register of Directors/);
});


test('sparse source cells become empty strings without moving statutory columns',()=>{
 const source=[];
 source[0]='Director name';
 source[3]='Appointment date';
 source[6]='Cessation date';
 const rows=[source,['ALPHA DIRECTOR',,,'20/10/2026',,,'']];
 const sheet=sanitizeSheet('Register of Directors',rows);
 assert.deepEqual(sheet.rows[0],['Director name','','','Appointment date','','','Cessation date']);
 assert.deepEqual(sheet.rows[1],['ALPHA DIRECTOR','','','20/10/2026','','','']);
 assert.equal(Object.hasOwn(sheet.rows[0],1),true);
 const book=makeRegisterBook(companies[0],{path:'Register Book_ALPHA SDN BHD.xlsx',sheets:[sheet]});
 assert.doesNotThrow(()=>validateRegisterBook(book));
 assert.equal(book.sheets[0].rows[1][3],'20/10/2026');
});

test('ZIP preview validates an actual Excel workbook with sparse populated cells',async()=>{
 const {zipSync,strToU8}=await import('fflate');
 const {DOMParser}=await import('@xmldom/xmldom');
 const oldParser=globalThis.DOMParser;globalThis.DOMParser=DOMParser;
 try{
  const x='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
   '<row r="1"><c r="A1" t="inlineStr"><is><t>Company Name:</t></is></c>'+
   '<c r="B1" t="inlineStr"><is><t>ALPHA SDN BHD</t></is></c></row>'+
   '<row r="2"><c r="A2" t="inlineStr"><is><t>Company No.:</t></is></c>'+
   '<c r="B2" t="inlineStr"><is><t>202601234567</t></is></c></row>'+
   '</sheetData></worksheet>';
  const reg='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
   '<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="E1" t="inlineStr"><is><t>Date of Appointment</t></is></c></row>'+
   '<row r="2"><c r="A2" t="inlineStr"><is><t>Example Director</t></is></c><c r="E2" t="inlineStr"><is><t>20/10/2026</t></is></c></row>'+
   '<row r="3"><c r="A3" s="1"/><c r="B3" s="1"/></row>'+
   '</sheetData></worksheet>';
  const wb='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+
   '<sheet name="Master" sheetId="1" r:id="rId1"/>'+
   '<sheet name="Register of Directors" sheetId="2" r:id="rId2"/></sheets></workbook>';
  const rel='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
   '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'+
   '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>';
  const bookBytes=zipSync({
   'xl/workbook.xml':strToU8(wb),
   'xl/_rels/workbook.xml.rels':strToU8(rel),
   'xl/worksheets/sheet1.xml':strToU8(x),
   'xl/worksheets/sheet2.xml':strToU8(reg)
  });
  const outer=zipSync({'Register Book_ALPHA SDN BHD.xlsx':bookBytes});
  const file=new Blob([outer]);file.name='Company Register Books.zip';
  const {previewStatutoryZip}=await import('../src/statutory-register-data.js');
  const result=await previewStatutoryZip(file,companies);
  assert.equal(result.matched,1,JSON.stringify(result.rows.map(r=>r.error)));
  const data=result.rows[0].sheets.find(s=>s.name==='Register of Directors');
  assert.deepEqual(data.rows[1],['Example Director','','','','20/10/2026']);
  assert.equal(result.unmatched,0);
 }finally{globalThis.DOMParser=oldParser;}
});
