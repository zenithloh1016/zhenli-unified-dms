import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloneBlank,normalizeDocument} from '../src/core.js';
import {BO_CRITERIA_DESCRIPTIONS,selectedBoCriteria} from '../src/bo-criteria.js';

const pdfSource=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
const editorSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('every BO criterion A-F has the same full English description in editor and PDF',()=>{
 assert.deepEqual(Object.keys(BO_CRITERIA_DESCRIPTIONS),['A','B','C','D','E','F']);
 const all=selectedBoCriteria('Criteria A, Criteria B, Criteria C, Criteria D, Criteria E, Criteria F');
 assert.equal(all.length,6);
 for(const {code,label,description} of all){
  assert.equal(label,'Criteria '+code);
  assert.equal(description,BO_CRITERIA_DESCRIPTIONS[code]);
  assert.ok(description.length>50,code+' must have a complete description');
 }
 assert.match(editorSource,/const CRITERIA=BO_CRITERIA_DESCRIPTIONS/);
 assert.match(pdfSource,/import \{selectedBoCriteria\} from '\.\/bo-criteria\.js'/);
});

test('selected, imported and restored BO criteria A-F retain the chosen descriptions only',()=>{
 for(const [value,expected] of [
  ['Criteria A, Criteria C, Criteria E',['A','C','E']],
  ['criteria b; criteria d',['B','D']],
  ['A / C / E',['A','C','E']],
  ['Criteria A, Criteria A, Criteria B',['A','B']],
  ['Criteria E',['E']],
  ['Criteria F',['F']],
  ['Criteria A, Criteria F',['A','F']],
  ['criteria f; criteria d',['D','F']],
  ['F / A / C',['A','C','F']],
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

test('PDF uses ONE left-hand criteria label with selected options on the right',()=>{
 assert.match(pdfSource,/if\(\/\^Criteria of Beneficial Ownership\$\/i\.test\(item\.en\|\|''\)\)/);
 assert.match(pdfSource,/const criteria=selectedBoCriteria\(item\.value\)/);
 assert.match(pdfSource,/appendRow\(tableRow\('criterion',displayParticularLabel\(item\),/);
 assert.match(pdfSource,/displayParticularLabel\(item,'cn'\),criteria\)/);
 assert.match(pdfSource,/else if\(kind==='criterion'\)/);
 assert.match(pdfSource,/const selected=Array\.isArray\(value\)\?value:\[\]/);
 assert.match(pdfSource,/const criteriaHtml=selected\.map\(\(\{label,description\}\)=>/);
 assert.match(pdfSource,/pdf-criterion-item/);
 assert.match(pdfSource,/pageEsc\(label\)/);
 assert.match(pdfSource,/pageEsc\(description\)/);
 assert.match(pdfSource,/pdf-criterion-separator/);
 assert.match(pdfSource,/ — /);
 assert.match(pdfSource,/row\.innerHTML='<th scope="row">/);
 assert.match(pdfSource,/pdf-criterion-cell/);
 assert.doesNotMatch(pdfSource,/tableRow\('field',label,'实益拥有标准 '/);
 assert.match(styles,/\.pdf-criterion-item\{display:block/);
 assert.match(styles,/\.pdf-criterion-item\+\.pdf-criterion-item\{margin-top:/);
 assert.match(styles,/\.pdf-criterion-label\{display:inline/);
 assert.match(styles,/\.pdf-criterion-separator,\.pdf-criterion-description\{display:inline/);
 assert.match(styles,/\.pdf-criterion-row \.pdf-criterion-cell\{/);
});
test('exported A–F options preserve editor descriptions and render selected values only',()=>{
 const selection=selectedBoCriteria('Criteria A, Criteria C, Criteria F');
 const rows=selection.map(({label,description})=>label+' — '+description);
 assert.equal(rows.length,3);
 assert.deepEqual(selection.map(x=>x.code),['A','C','F']);
 for(const row of rows){
  assert.match(row,/^Criteria [ACF] — /);
  assert.ok(row.length>75);
 }
 assert.equal(rows.some(x=>x.startsWith('Criteria B')),false);
 assert.equal(rows.some(x=>x.startsWith('Criteria D')),false);
 assert.match(pdfSource,/appendRow\(tableRow\('criterion'/);
 assert.match(pdfSource,/if\(criteria\.length\)/);
});

test('SSM Criterion F is selectable and its full text sits beside the label in the PDF',()=>{
 const description='Has less than 20% of shares or voting shares but exercises significant control or influence over the company';
 assert.equal(BO_CRITERIA_DESCRIPTIONS.F,description);
 const selected=selectedBoCriteria('Criteria F');
 assert.deepEqual(selected,[{code:'F',label:'Criteria F',description}]);
 assert.deepEqual(selectedBoCriteria('Criteria A and Criteria F').map(x=>x.code),['A','F']);
 const draft=cloneBlank();
 const bo=draft.particulars.find(x=>x.en==='Criteria of Beneficial Ownership');
 assert.ok(bo);
 bo.value='Criteria F';
 const reopened=normalizeDocument(draft);
 assert.deepEqual(
  selectedBoCriteria(reopened.particulars.find(x=>x.en==='Criteria of Beneficial Ownership').value)
   .map(x=>x.description),[description]);
 // The PDF's tableRow('criterion') renders each selected code and
 // description together on the right side of the field's single table row.
 assert.match(pdfSource,/const criteriaHtml=selected\.map\(\(\{label,description\}\)=>/);
 assert.match(pdfSource,/pdf-criterion-label/);
 assert.match(pdfSource,/pdf-criterion-description/);
 assert.match(editorSource,/Object\.entries\(CRITERIA\)/);
});
