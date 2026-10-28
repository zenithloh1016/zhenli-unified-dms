import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloneBlank,normalizeDocument,moveParticularSection} from '../src/core.js';
import {createAnnualReturnHistory} from '../src/history.js';
import {saveAnnualReturnDraft,readAnnualReturnDraft} from '../src/drafts.js';

function groups(doc){
 const blocks=[];
 for(const item of doc.particulars){
  if(item.type==='section')blocks.push({section:item,items:[]});
  else if(blocks.length)blocks.at(-1).items.push(item);
 }
 return blocks;
}
const sections=doc=>doc.particulars.map((x,i)=>x.type==='section'?i:-1).filter(i=>i>=0);
const titles=doc=>groups(doc).map(b=>b.section.en);
function memoryStorage(){
 const saved=new Map();
 return {get length(){return saved.size;},key:index=>[...saved.keys()][index]??null,
  setItem:(key,value)=>saved.set(key,String(value)),getItem:key=>saved.get(key)??null,
  removeItem:key=>saved.delete(key)};
}

test('dragging one section below another carries all headings, values and custom fields',()=>{
 const doc=cloneBlank();
 const original=groups(doc);
 assert.ok(original.length>=5);
 const member=original.find(x=>/PARTICULARS OF MEMBERS/i.test(x.section.en));
 const director=original.find(x=>/DIRECTORS, COMPANY SECRETARY/i.test(x.section.en));
 assert.ok(member&&director);
 const directorField=director.items.find(x=>x.type==='field');
 directorField.value='IMPORTANT VALUE NOT TO LOSE';
 const memberField=member.items.find(x=>x.type==='field');
 memberField.value='SHARE DATA';
 director.items.push();
 const from=doc.particulars.indexOf(director.section);
 const target=doc.particulars.indexOf(member.section);
 const directorSnapshot=director.items.map(x=>({...x}));
 const result=moveParticularSection(doc,from,target,{after:true});
 assert.equal(result.moved,true);
 const now=groups(doc);
 const newDirectors=now.find(x=>x.section===director.section);
 const newMemberIndex=now.findIndex(x=>x.section===member.section);
 assert.equal(now[newMemberIndex+1].section,director.section);
 assert.deepEqual(newDirectors.items,directorSnapshot);
 assert.equal(memberField.value,'SHARE DATA');
 assert.equal(directorField.value,'IMPORTANT VALUE NOT TO LOSE');
 assert.ok(now.every(x=>x.section.type==='section'));
 assert.deepEqual(groups(normalizeDocument(doc)).map(x=>x.section.en),titles(doc));
});

test('up/down moves are reversible, respect table ordering and allow moving first/last sections',()=>{
 const doc=cloneBlank();
 const old=titles(doc);
 const positions=sections(doc);
 const first=moveParticularSection(doc,positions[0],positions[1],{after:true});
 assert.equal(first.moved,true);
 assert.deepEqual(titles(doc).slice(0,2),[old[1],old[0]]);
 const newPos=sections(doc);
 assert.equal(moveParticularSection(doc,newPos[1],newPos[0],{after:false}).moved,true);
 assert.deepEqual(titles(doc),old);
 const last=sections(doc).at(-1);
 assert.equal(moveParticularSection(doc,last,sections(doc)[0],{after:false}).moved,true);
 assert.deepEqual(titles(doc),[old.at(-1),...old.slice(0,-1)]);
 const noOp=moveParticularSection(doc,sections(doc)[0],sections(doc)[0]);
 assert.equal(noOp.moved,false);
 assert.deepEqual(titles(doc),[old.at(-1),...old.slice(0,-1)]);
});

test('reject invalid drag targets and never split a section into another record',()=>{
 const doc=cloneBlank();
 const before=JSON.stringify(doc);
 const starts=sections(doc);
 assert.throws(()=>moveParticularSection(doc,starts[0]+1,starts[1]),/Select a section/);
 assert.throws(()=>moveParticularSection(doc,starts[0],starts[1]+1),/Drop onto another section/);
 assert.throws(()=>moveParticularSection(doc,starts[0],-1),/Drop onto another section/);
 assert.equal(JSON.stringify(doc),before);
 const itemCount=doc.particulars.length;
 moveParticularSection(doc,starts[0],starts[2],{after:true});
 assert.equal(doc.particulars.length,itemCount);
 const records=groups(doc).flatMap(g=>g.items);
 assert.equal(records.length,itemCount-sections(doc).length);
});

test('undo/redo restores section order and saving a draft preserves that order',()=>{
 const doc=cloneBlank(),old=titles(doc);
 const history=createAnnualReturnHistory(doc);
 const p=sections(doc);
 moveParticularSection(doc,p[1],p[3],{after:true});
 history.capture(doc);
 const reordered=titles(doc);
 assert.notDeepEqual(reordered,old);
 assert.deepEqual(titles(history.undo()),old);
 assert.deepEqual(titles(history.redo()),reordered);
 const storage=memoryStorage();
 saveAnnualReturnDraft(storage,'dms:demo-user','company-id-123',doc);
 const restored=readAnnualReturnDraft(storage,'dms:demo-user','company-id-123');
 assert.deepEqual(titles(restored.data),reordered);
});

test('section drag handles, arrow controls, touch pointer events and PDF document order are wired',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 const pdf=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
 assert.match(main,/data-drag-section/);
 assert.match(main,/data-shift-section/);
 assert.match(main,/function commitSectionMove\(from,target,after\)/);
 assert.match(main,/moveParticularSection\(doc,from,target,\{after\}\)/);
 assert.match(main,/function moveSectionByButton\(index,direction\)/);
 assert.match(main,/let activeSectionDrag=null/);
 assert.match(main,/function finishSectionDrag\(event\)/);
 assert.match(main,/renderSections\(\);queueDraftSave\(\)/);
 assert.match(css,/\.ar-section-drop-before/);
 assert.match(css,/\.ar-section-drop-after/);
 assert.match(css,/\.ar-section-drag-handle\{[^}]*touch-action:none/);
 assert.match(pdf,/for\(const \[index,item\] of \(doc\.particulars\|\|\[\]\)\.entries\(\)\)/);
});
