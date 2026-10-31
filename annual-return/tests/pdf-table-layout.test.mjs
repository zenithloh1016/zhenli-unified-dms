import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloneBlank} from '../src/core.js';

const pdf=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('Annual Return uses a consistent real table with matching label/value columns on each A4 page',()=>{
 assert.match(pdf,/createElement\('table'\)|class="pdf-particulars-table"/);
 assert.match(pdf,/<thead><tr><th scope="col">/);
 assert.match(pdf,/<tbody><\/tbody><\/table>/);
 assert.match(pdf,/createPage\(true\)/);
 assert.match(pdf,/getBoundingClientRect\(\)/);
 assert.match(pdf,/const TABLE_BOTTOM=1033/);
 assert.match(pdf,/if\(!fitsRow\(row\)\)throw Error/);
 assert.match(css,/\.pdf-particulars-table\{[^}]*border-collapse:collapse/);
 assert.match(css,/\.pdf-particulars-table \.pdf-label-column\{width:41%\}/);
 assert.match(css,/\.pdf-particulars-table \.pdf-value-column\{width:59%\}/);
 assert.match(css,/\.pdf-sheet\{[^}]*height:1123px/);
});
test('Sections and headings span both columns and fields retain bilingual labels in their chosen order',()=>{
 assert.match(pdf,/item\.type==='section'\|\|item\.type==='heading'/);
 assert.match(pdf,/tableRow\(item\.type,displayParticularLabel\(item\),displayParticularLabel\(item,'cn'\)\)/);
 assert.match(pdf,/row\.innerHTML='<th colspan="2" scope="colgroup">/);
 assert.match(pdf,/<th scope="row">/);
 assert.match(pdf,/doc\.particulars\|\|\[\]\)\.entries\(\)/);
 assert.match(pdf,/if\(isRetiredAnnualReturnField\(item\)\|\|!showMemberField\(doc\.particulars,index\)\)continue/);
 assert.match(pdf,/parts\.forEach\(\(part,i\)=>/);
 const doc=cloneBlank();
 const heads=doc.particulars.filter(x=>x.type==='heading').map(x=>x.en);
 for(const name of ['DIRECTOR 1','COMPANY SECRETARY','AUDITOR','MEMBER 1','BENEFICIAL OWNER 1'])
  assert.ok(heads.includes(name));
});
test('Long field values, printed continuation headings and director signature fit table pagination',()=>{
 assert.match(pdf,/function divideValue\(value,max=230\)/);
 assert.match(pdf,/while\(remaining\.length>max\)/);
 assert.match(pdf,/const continued=parts\.length>1/);
 assert.match(pdf,/appendRow\(tableRow\('section','DIRECTOR CONFIRMATION','董事确认'\),75\)/);
 assert.match(pdf,/appendRow\(tableRow\('note'/);
 assert.match(css,/\.pdf-signature-line\{/);
 assert.match(css,/\.pdf-brand-name\{/);
 assert.match(pdf,/number\.textContent='PAGE '\+\(i\+1\)\+' \/ '\+pages\.length/);
 assert.ok(!pdf.includes("function block(cls,html)"),'old loose-block rendering must be removed');
 assert.ok(!pdf.includes("flow.scrollHeight>938"),'old overflow-prone pagination must be removed');
});
