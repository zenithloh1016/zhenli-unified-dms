import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloneBlank,normalizeDocument,displayParticularLabel,updateParticularLabel} from '../src/core.js';

test('existing drafts receive clarified bilingual labels without changing saved canonical fields or values',()=>{
 const original=cloneBlank();
 const index=original.particulars.findIndex(x=>x.en==='Type of Shares Issued');
 original.particulars[index].value='Both cash and otherwise than in cash';
 const stored=JSON.stringify(original);
 const saved=normalizeDocument(original);
 assert.equal(displayParticularLabel(saved.particulars[index]),'Basis of Share Issue (Cash / Non-cash)');
 assert.equal(displayParticularLabel(saved.particulars[index],'cn'),'股份发行对价方式（现金／非现金）');
 assert.equal(saved.particulars[index].en,'Type of Shares Issued');
 assert.equal(saved.particulars[index].value,'Both cash and otherwise than in cash');
 assert.equal(JSON.stringify(original),stored,'source draft must not be mutated by rendering');
});

test('new drafts show clearer labels in the editor and in exported PDF rendering',()=>{
 const fresh=cloneBlank();
 const field=fresh.particulars.find(x=>x.en==='Anniversary Date');
 assert.equal(displayParticularLabel(field),'Annual Return Anniversary Date');
 assert.equal(displayParticularLabel(field,'cn'),'周年申报基准日');
 const section=fresh.particulars.find(x=>x.type==='section');
 assert.equal(displayParticularLabel(section),section.en,'section names are preserved');
});

test('user-edited bilingual labels override default wording, including for old cloud drafts',()=>{
 const old=normalizeDocument(cloneBlank());
 const index=old.particulars.findIndex(x=>x.en==='Member Type');
 updateParticularLabel(old,index,'Member Category (custom)','股东类型（自订）');
 const loaded=normalizeDocument(JSON.parse(JSON.stringify(old)));
 assert.equal(displayParticularLabel(loaded.particulars[index]),'Member Category (custom)');
 assert.equal(displayParticularLabel(loaded.particulars[index],'cn'),'股东类型（自订）');
 assert.equal(loaded.particulars[index].en,'Member Type','member logic stays bound to canonical key');
});

test('unknown or custom fields keep their own English and Chinese wording',()=>{
 const custom={type:'field',en:'Special Meeting Note',cn:'特别会议备注',value:'Preserve me'};
 assert.equal(displayParticularLabel(custom),'Special Meeting Note');
 assert.equal(displayParticularLabel(custom,'cn'),'特别会议备注');
 assert.equal(custom.value,'Preserve me');
});

test('PDF rendering keeps the ZHENLI heading, clarifies review-only text, and never changes field values',()=>{
 const source=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
 assert.match(source,/ZHENLI CONSULTANCY SERVICES SDN\. BHD\./);
 assert.match(source,/ANNUAL RETURN REVIEW FORM/);
 assert.match(source,/DIRECTOR CONFIRMATION/);
 assert.match(source,/not the statutory Annual Return/i);
 assert.match(source,/displayParticularLabel\(item/);
 assert.match(source,/divideValue\(item\.value\)/);
});
