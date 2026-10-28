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

test('PDF puts each BO criterion immediately beside its full description, matching the editor',()=>{
 assert.match(pdfSource,/if\(\/\^Criteria of Beneficial Ownership\$\/i\.test\(item\.en\|\|''\)\)/);
 assert.match(pdfSource,/const criteria=selectedBoCriteria\(item\.value\)/);
 assert.match(pdfSource,/for\(const \{label,description\} of criteria\)/);
 assert.match(pdfSource,/tableRow\('criterion',displayParticularLabel\(item\),/);
 assert.match(pdfSource,/displayParticularLabel\(item,'cn'\),description,label\)/);
 assert.match(pdfSource,/else if\(kind==='criterion'\)/);
 const cellStart=pdfSource.indexOf("'<strong class=\"pdf-criterion-label\">'");
 const cellEnd=pdfSource.indexOf("</span></span></td>'",cellStart);
 assert.ok(cellStart>=0&&cellEnd>cellStart,'criteria inline cell must be present');
 const cell=pdfSource.slice(cellStart,cellEnd);
 assert.match(cell,/pageEsc\(continuation\)/);
 assert.match(cell,/pdf-criterion-separator/);
 assert.match(cell,/ — /);
 assert.match(cell,/pageEsc\(value\)/);
 assert.ok(cell.indexOf('pageEsc(continuation)')<cell.indexOf('pageEsc(value)'),'label precedes description');
 assert.doesNotMatch(pdfSource,/tableRow\('field',label,'实益拥有标准 '/);
 assert.match(styles,/\.pdf-criterion-label\{display:inline/);
 assert.match(styles,/\.pdf-criterion-separator,\.pdf-criterion-description\{display:inline\}/);
 assert.match(styles,/\.pdf-criterion-row \.pdf-criterion-cell\{/);
 assert.match(pdfSource,/for\(const \[index,item\] of \(doc\.particulars\|\|\[\]\)\.entries\(\)\)/);
});

test('exported A–E options preserve editor descriptions and render selected values only',()=>{
 const selection=selectedBoCriteria('Criteria A, Criteria C, Criteria E');
 const rows=selection.map(({label,description})=>label+' — '+description);
 assert.equal(rows.length,3);
 assert.deepEqual(selection.map(x=>x.code),['A','C','E']);
 for(const row of rows){
  assert.match(row,/^Criteria [ACE] — /);
  assert.ok(row.length>75);
 }
 assert.equal(rows.some(x=>x.startsWith('Criteria B')),false);
 assert.equal(rows.some(x=>x.startsWith('Criteria D')),false);
 assert.match(pdfSource,/appendRow\(tableRow\('criterion'/);
 assert.match(pdfSource,/if\(criteria\.length\)/);
});
