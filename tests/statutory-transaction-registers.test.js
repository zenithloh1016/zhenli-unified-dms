import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {describeStatutorySheet} from '../src/statutory-register-review.js';
import {buildGroupedRegister,buildCombinedRegisters} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
const co={id:'test',name:'MAX PLUS TECHNOLOGIES SDN. BHD.',
 registration_no:'202301009667 (1503588-X)'};

test('legacy Share titles are shortened across tabs and PDFs without modifying saved worksheet names',()=>{
 const b=makeRegisterBook(co,{path:'Imported.xlsx',sheets:[
  {name:'Register of Share Allotments',rows:[['Date','Allotment No.',"Allottee's Name"],['20/10/2026','A1','ALLOTTEE ONE']]},
  {name:'Register of Share Transfers',rows:[['Transfer No.','Date','No. of Shares Transferred'],['T1','20/10/2026','100']]}
 ]});
 const names=b.sheets.map(s=>s.name);
 assert.deepEqual(buildCombinedRegisters(b).map(x=>x.title),
  ['Register of Allotments','Register of Transfers']);
 assert.deepEqual(b.sheets.map(s=>s.name),names,'existing stored names must not be changed');
 for(let i=0;i<2;i++){
  const html=renderStatutoryRegisterDocument(b,i);
  assert(!/REGISTER OF SHARE (?:ALLOTMENTS|TRANSFERS)/i.test(html));
  assert(html.includes(i===0?'Register of Allotments':'Register of Transfers'));
  assert(buildGroupedRegister(b,i).blocks.some(x=>x.type==='field'),
    'both registers retain editable particulars');
 }
});

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
 assert.deepEqual(buildCombinedRegisters(b).map(x=>x.title).filter(x=>/Allotments|Transfers/.test(x)),[
  'Register of Allotments','Register of Transfers']);
});

test('entered allotments and transfers preserve exact labels, editable coordinates and unclassified transactions',()=>{
 const b=makeRegisterBook(co);
 b.sheets[5].rows.push(['15/10/2026','A001','ALLOTTEE ONE','IPOH','1000','1000','-','Ordinary','1']);
 b.sheets[6].rows.push(['T001','20/10/2026','500','500','-','Ordinary','TRANSFEROR ONE','ID-A','1','TRANSFEREE ONE','ID-B','IPOH','2']);
 for(const [i,name,labels] of [
  [5,'ALLOTTEE ONE',['Allotment Date','Allotment No.','Allottee',"Allottee's Address",'Number of Shares','Amount Paid on Share','Certificate No.','Class','Folio No.']],
  [6,'TRANSFEROR ONE',['Transfer No.','Transfer Date','Shares','Consideration','No. of Old Certificate','Class of Shares','Transferor','IC No. / PP No. / Company No.','Folio of Transferor','Transferee','Transferee IC No. / PP No. / Company No.','Transferee Address','Folio of Transferee','No. of New Certificate']]
 ]){
  const section=buildGroupedRegister(b,i,{showBlanks:true});
  assert.equal(section.blocks.filter(x=>x.type==='record').length,1);
  assert.equal(section.blocks.find(x=>x.type==='record').title,name);
  assert.deepEqual(section.blocks.filter(x=>x.type==='field').map(x=>x.label),labels.filter((_,j)=>i===5||j!==13));
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
  assert.deepEqual(section.blocks.filter(x=>x.type==='field').map(x=>x.label),
    [i===0?'Allotment Date':'Transfer Date',i===0?'Number of Shares':'Shares','Name']);
 }
});
