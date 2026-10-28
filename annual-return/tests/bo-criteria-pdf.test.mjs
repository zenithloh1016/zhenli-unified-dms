import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloneBlank,normalizeDocument} from '../src/core.js';
import {BO_CRITERIA_DESCRIPTIONS,selectedBoCriteria} from '../src/bo-criteria.js';

const pdfSource=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
const editorSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('every BO criterion A-E has the same full English description in editor and PDF',()=>{
 assert.deepEqual(Object.keys(BO_CRITERIA_DESCRIPTIONS),['A','B','C','D','E']);
 const all=selectedBoCriteria('Criteria A, Criteria B, Criteria C, Criteria D, Criteria E');
 assert.equal(all.length,5);
 for(const {code,label,description} of all){
  assert.equal(label,'Criteria '+code);
  assert.equal(description,BO_CRITERIA_DESCRIPTIONS[code]);
  assert.ok(description.length>50,code+' must have a complete description');
 }
 assert.match(editorSource,/const CRITERIA=BO_CRITERIA_DESCRIPTIONS/);
 assert.match(pdfSource,/import \{selectedBoCriteria\} from '\.\/bo-criteria\.js'/);
});

test('selected, imported and restored BO criteria A-E retain the chosen descriptions only',()=>{
 for(const [value,expected] of [
  ['Criteria A, Criteria C, Criteria E',['A','C','E']],
  ['criteria b; criteria d',['B','D']],
  ['A / C / E',['A','C','E']],
  ['Criteria A, Criteria A, Criteria B',['A','B']],
  ['Criteria E',['E']],
  ['A and D',['A','D']],
  ['',[]],
  ['Not provided',[]],
  ['N/A',[]]
 ]){
  assert.deepEqual(selectedBoCriteria(value).map(item=>item.code),expected,value);
 }
 const doc=cloneBlank();
 const target=doc.particulars.find(x=>x.en==='Criteria of Beneficial Ownership');
 assert.ok(target);
 target.value='Criteria B, Criteria D';
 const restored=normalizeDocument(doc);
 assert.equal(restored.particulars.find(x=>x.en==='Criteria of Beneficial Ownership').value,'Criteria B, Criteria D');
 assert.deepEqual(selectedBoCriteria(restored.particulars.find(x=>x.en==='Criteria of Beneficial Ownership').value).map(item=>item.description),
  [BO_CRITERIA_DESCRIPTIONS.B,BO_CRITERIA_DESCRIPTIONS.D]);
});

test('PDF prints original BO selection followed by each selected full explanation in a table row',()=>{
 assert.match(pdfSource,/if\(\/\^Criteria of Beneficial Ownership\$\/i\.test\(item\.en\|\|''\)\)/);
 assert.match(pdfSource,/const criteria=selectedBoCriteria\(item\.value\)/);
 assert.match(pdfSource,/appendRow\(tableRow\('field',displayParticularLabel\(item\),displayParticularLabel\(item,'cn'\),blank\(item\.value\)\)\)/);
 assert.match(pdfSource,/for\(const \{label,description\} of criteria\)/);
 assert.match(pdfSource,/tableRow\('field',label,'实益拥有标准 '\+label\.slice\(-1\),description\)/);
 assert.match(pdfSource,/row\.classList\.add\('pdf-criteria-row'\)/);
 assert.match(pdfSource,/appendRow\(row\)/);
 assert.match(styles,/\.pdf-criteria-row td\{background:#fbfdff/);
 assert.match(pdfSource,/for\(const \[index,item\] of \(doc\.particulars\|\|\[\]\)\.entries\(\)\)/);
});
