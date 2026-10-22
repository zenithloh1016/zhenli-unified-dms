import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {
 REGISTER_BOOK_FOLDER_NAME,REGISTER_BOOK_FOLDER_SORT_ORDER,STANDARD_FOLDER_COUNT,
 isExistingRegisterBookFolder,missingRegisterBookFolders
} from '../src/register-book-folders.js';
import {matchRegisterBook,previewRegisterZip,safeRegisterFilename} from '../src/register-book-zip.js';

const companies=[
 {id:'a',name:'FENG YUAN AGRICULTURE (M) SDN. BHD.',registration_no:'202001030621 (1386941-U)'},
 {id:'b',name:'SILVERSPOONS SDN. BHD.',registration_no:'202401051906 (1597749-U)'},
 {id:'c',name:'ACE CORPORATION (M) SDN BHD',registration_no:'202401000001'},
 {id:'d',name:'ACE CORPORATION SDN BHD',registration_no:'202301999999'}
];
test('16th root is exactly Register Book and missing folders are determined safely',()=>{
 assert.equal(REGISTER_BOOK_FOLDER_NAME,'Register Book');
 assert.equal(REGISTER_BOOK_FOLDER_SORT_ORDER,16);
 assert.equal(STANDARD_FOLDER_COUNT,15);
 assert.equal(isExistingRegisterBookFolder({name:' REGISTER BOOK ',parent_id:null}),true);
 assert.equal(isExistingRegisterBookFolder({name:'Register Book',parent_id:'nested'}),false);
 const missing=missingRegisterBookFolders(companies,[
  {company_id:'a',name:'Register Book',parent_id:null},
  {company_id:'b',name:'Register Book',parent_id:'nested'}
 ]);
 assert.deepEqual(missing.map(x=>x.id),['b','c','d']);
});
test('matches full names, normalized legal suffixes and registration numbers',()=>{
 assert.equal(matchRegisterBook('Register Book_FENG YUAN AGRICULTURE (M) SDN BHD.pdf',companies).company?.id,'a');
 assert.equal(matchRegisterBook('SILVERSPOONS SDN BHD/Register Book.pdf',companies).company?.id,'b');
 assert.equal(matchRegisterBook('202401051906_Register Book.pdf',companies).company?.id,'b');
 assert.equal(matchRegisterBook('ACE CORPORATION SDN BHD.pdf',companies).company?.id,'d');
 assert.equal(matchRegisterBook('Register Book_ACE CORPORATION.pdf',companies).company,null);
 assert.equal(matchRegisterBook('Unknown client/Register Book.pdf',companies).company,null);
 assert.equal(matchRegisterBook('Register Book.pdf',companies,{headerName:'SILVERSPOONS SDN. BHD.',headerNumber:'202401051906'}).company?.id,'b');
 assert.equal(matchRegisterBook('FENG YUAN AGRICULTURE (M) SDN BHD.pdf',companies,{headerNumber:'202401051906'}).company,null);
 assert.equal(matchRegisterBook('Register Book_ACE CORPORATION (M) SDN BHD.xlsx',companies,{
   headerName:'ACE CORPORATION (M) SDN. BHD. (F.K.A. ACE CORPORATION SDN. BHD.)',
   headerNumber:'202401000001'
 }).company?.id,'c');
 assert.equal(matchRegisterBook('Register Book_ACE CORPORATION (M) SDN BHD.xlsx',companies,{
   headerName:'ACE CORPORATION (M) SDN. BHD. (F.K.A. ACE CORPORATION SDN. BHD.)',
   headerNumber:'202301999999'
 }).company,null);
});
test('preview ZIP matches known companies and leaves unrelated files untouched',async()=>{
 const zip=zipSync({
  'FENG YUAN AGRICULTURE (M) SDN BHD/Register Book.xlsx':strToU8('test workbook'),
  'Register Book_SILVERSPOONS SDN BHD.docx':strToU8('test word file'),
  'no matching company.pdf':strToU8('not a PDF'),
  'misc/readme.txt':strToU8('not a statutory document')
 });
 const file={name:'register books.zip',size:zip.length,arrayBuffer:async()=>zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength)};
 const result=await previewRegisterZip(file,companies);
 assert.equal(result.matched,2);
 assert.equal(result.unmatched,1);
 assert.equal(result.ignored,1);
 assert.deepEqual(result.rows.filter(x=>x.company).map(x=>x.company.id),['a','b']);
 assert.ok(result.rows.every(x=>x.bytes instanceof Uint8Array));
});
test('file names and ZIP input validation',async()=>{
 assert.equal(safeRegisterFilename('../Some Company/Register Book.pdf'),'Register Book.pdf');
 await assert.rejects(previewRegisterZip({name:'myfile.pdf',size:500},companies),/ZIP archive/);
});
test('the generator does not have the former Register Book import control',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../annual-return/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../annual-return/src/main.js',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8');
 const dms=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(!html.includes('register-book-file'));
 assert.ok(!js.includes('loadRegisterBook'));
 assert.ok(dms.includes('Statutory Registers'));
 assert.ok(!dms.includes('ensureRegisterBookFolders'));
 assert.ok(!sql.includes("('Register Book', 16)"));
 assert.ok(sql.includes("('Charges', 15)"));
});
