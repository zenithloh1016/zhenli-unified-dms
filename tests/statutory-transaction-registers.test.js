import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {describeStatutorySheet} from '../src/statutory-register-review.js';
import {buildGroupedRegister,buildCombinedRegisters} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
const co={id:'test',name:'MAX PLUS TECHNOLOGIES SDN. BHD.',
 registration_no:'202301009667 (1503588-X)'};

test('blank Allotments and Transfers display standard sections without treating column labels as transactions',()=>{
 const b=makeRegisterBook(co);
 for(const i of [5,6]){
  assert.equal(describeStatutorySheet(b.sheets[i]).headerRow,0);
  const section=buildGroupedRegister(b,i);
  assert.deepEqual(section.blocks.filter(x=>x.type==='group').map(x=>x.title),['Transactions']);
  assert.equal(section.blocks.filter(x=>x.type==='record').length,0);
  assert.match(section.blocks.find(x=>x.type==='note').text,/No .* transactions recorded/);
  const html=renderStatutoryRegisterDocument(b,i);
  assert.match(html,/sr-member-group">Transactions/);
  assert.doesNotMatch(html,/Particular 1|Entry 1|Mark Former|Mark Current/);
 }
 assert.deepEqual(buildCombinedRegisters(b).slice(-2).map(x=>x.title),[
  'Register of Share Allotments','Register of Share Transfers']);
});

test('entered allotments and transfers preserve exact labels, editable coordinates and unclassified transactions',()=>{
 const b=makeRegisterBook(co);
 b.sheets[5].rows.push(['ALLOTTEE ONE','Ordinary','1000','15/10/2026']);
 b.sheets[6].rows.push(['TRANSFEROR ONE','TRANSFEREE ONE','500','20/10/2026']);
 for(const [i,name,labels] of [
  [5,'ALLOTTEE ONE',['Allottee','Class','Number of Shares','Allotment Date']],
  [6,'TRANSFEROR ONE',['Transferor','Transferee','Shares','Transfer Date']]
 ]){
  const section=buildGroupedRegister(b,i,{showBlanks:true});
  assert.equal(section.blocks.filter(x=>x.type==='record').length,1);
  assert.equal(section.blocks.find(x=>x.type==='record').title,name);
  assert.deepEqual(section.blocks.filter(x=>x.type==='field').map(x=>x.label),labels);
  assert(section.blocks.filter(x=>x.type==='field').every(x=>x.sheetIndex===i&&x.row===1));
  const html=renderStatutoryRegisterDocument(b,i);
  assert(html.includes('data-s="'+i+'" data-r="1" data-c="3"'));
  assert(html.includes(name));
  assert.doesNotMatch(html,/Particular 1|Mark Former|Mark Current/);
 }
});

test('imported older Allotments and Transfers remain editable with their original labels',()=>{
 const b=makeRegisterBook(co,{path:'original.xlsx',sheets:[
  {name:'Register of Allotments',rows:[['Name','Date','No. of Shares'],['A','15/10/2026','200']]},
  {name:'Register of Transfer',rows:[['Name','Date','No. of Shares'],['B','20/10/2026','100']]}
 ]});
 for(const i of [0,1]){
  const section=buildGroupedRegister(b,i);
  assert.deepEqual(section.blocks.filter(x=>x.type==='group').map(x=>x.title),['Transactions']);
  assert.equal(section.blocks.filter(x=>x.type==='record').length,1);
  assert.deepEqual(section.blocks.filter(x=>x.type==='field').map(x=>x.label),['Name','Date','No. of Shares']);
 }
});
