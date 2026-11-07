import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank} from '../src/core.js';
import {importCombinedRegisterSnapshot} from '../src/register-import.js';
const fld=(label,value)=>({type:'field',label,value});
const rec=(name,status='Current')=>({type:'record',title:name,status});
const grp=title=>({type:'group',title});
const member=(name,shares,cls)=>[
 rec(name),fld('Shareholder Name',name),fld('Current Number of Shares Held',shares),
 ...(cls===undefined?[]:[fld('Class of Shares',cls)])
];
function source({profiles=[],members=[],allotments=[]}={}){
 return {version:1,companyId:'c1',companyName:'EXAMPLE SDN BHD',
  registrationNo:'202601000001',
  sections:[
   {title:'Company Details',blocks:profiles},
   {title:'Register of Members',blocks:[grp('Current'),...members,grp('Former'),
    rec('FORMER PERSON','Former'),fld('Shareholder Name','FORMER PERSON'),
    fld('Current Number of Shares Held','9,999')]},
   {title:'Register of Allotments',blocks:[grp('Transactions'),...allotments]}
  ]
 };
}
function blank(){
 const d=cloneBlank();d.company.name='EXAMPLE SDN BHD';d.company.no='202601000001';return d;
}
const value=(d,label,heading='')=>{
 let p=d.particulars;
 if(heading){
  const start=p.findIndex(x=>x.type==='heading'&&x.en===heading);
  if(start<0)return undefined;
  const tail=p.slice(start+1),end=tail.findIndex(x=>x.type!=='field');
  p=end<0?tail:tail.slice(0,end);
 }
 return p.find(x=>x.type==='field'&&x.en===label)?.value;
};
function auto(doc,data){return importCombinedRegisterSnapshot(doc,data,{secretaryOnly:true,shareholdingOnly:true});}
test('derives unentered share capital counts from existing complete member records, excluding former members',()=>{
 const data=source({members:[
  ...member('CURRENT A','20,000','Ordinary'),
  ...member('CURRENT B','30,000','Ordinary'),
  ...member('CURRENT C','5,000','Preference')]});
 const old=blank(),copied=structuredClone(data);
 const {document,summary}=auto(old,data);
 assert.equal(value(document,'Number of Ordinary Shares'),'50,000');
 assert.equal(value(document,'Number of Preference Shares'),'5,000');
 assert.equal(value(document,'Total Number of Issued Shares (all classes)'),'55,000');
 assert.equal(value(document,'Classes of Shares Issued'),'Ordinary & Preference');
 assert.equal(value(document,'Number of Shares Held','MEMBER 1'),'20,000');
 assert.equal(value(document,'Percentage of Own Share Class','MEMBER 1'),'40.00%');
 assert.equal(value(document,'Percentage of Own Share Class','MEMBER 3'),'100.00%');
 assert.equal(value(document,'Ordinary Share Capital (recorded amount paid)'),'50,000.00');
 assert.equal(value(document,'Preference Share Capital (recorded amount paid)'),'5,000.00');
 assert.equal(document.particulars.find(x=>x.en==='Ordinary Share Capital (recorded amount paid)').autoAssumedRate,1,
  'RM1/share amounts must retain an explicit estimate marker');
 assert(summary.capitalFromCurrentHoldings.length>=3);
 assert.match(summary.capitalNotice,/verify|confirm/i);
 assert.deepEqual(data,copied,'source remains unchanged');
 assert.equal(value(old,'Total Number of Issued Shares (all classes)'),'');
});
test('fills total current share quantities even if historical books lack share-class particulars',()=>{
 const data=source({members:[
  ...member('CURRENT A','200'),...member('CURRENT B','300')]});
 const {document,summary}=auto(blank(),data);
 assert.equal(value(document,'Total Number of Issued Shares (all classes)'),'500');
 assert.equal(value(document,'Number of Ordinary Shares'),'');
 assert.equal(value(document,'Number of Preference Shares'),'');
 assert.match(summary.capitalNotice,/verify|confirm/i);
});
test('uses explicit sole class and paid-up amount from Company Details without guessing a per-share rate',()=>{
 const data=source({
  profiles:[fld('Classes of Shares Issued','Ordinary'),
   fld('Paid Up Capital','75,000.00')],
  members:[...member('CURRENT A','60'),...member('CURRENT B','40')]
 });
 const {document}=auto(blank(),data);
 assert.equal(value(document,'Number of Ordinary Shares'),'100');
 assert.equal(value(document,'Classes of Shares Issued'),'Ordinary');
 assert.equal(value(document,'Ordinary Share Capital (recorded amount paid)'),'75,000.00');
 assert.equal(value(document,'Class of Shares','MEMBER 1'),'Ordinary');
 assert.equal(value(document,'Percentage of Own Share Class','MEMBER 1'),'60.00%');
});
test('allotment class supplies single class only when every transaction and member total agrees',()=>{
 const data=source({members:[...member('A','60'),...member('B','40')],
  allotments:[rec('ALLOTMENT 1'),fld('Number of Shares','70'),fld('Class','Ordinary'),
   rec('ALLOTMENT 2'),fld('Number of Shares','30'),fld('Class','Ordinary')]});
 const {document}=auto(blank(),data);
 assert.equal(value(document,'Total Number of Issued Shares (all classes)'),'100');
 assert.equal(value(document,'Number of Ordinary Shares'),'100');
 assert.equal(value(document,'Class of Shares','MEMBER 1'),'Ordinary');
 const incomplete=structuredClone(data);
 incomplete.sections[2].blocks.at(-2).value='35';
 const other=auto(blank(),incomplete).document;
 assert.equal(value(other,'Total Number of Issued Shares (all classes)'),'100');
 assert.equal(value(other,'Number of Ordinary Shares'),'',
  'incomplete allotment evidence must not assign a share class');
});
test('missing or zero holdings and conflicting explicit issued-share figures never produce a derived total',()=>{
 const partial=source({members:[...member('A','60','Ordinary'),...member('B','','Ordinary')]});
 const result=auto(blank(),partial);
 assert.equal(value(result.document,'Total Number of Issued Shares (all classes)'),'');
 assert.match(result.summary.capitalNotice,/missing or invalid/i);
 const conflicting=source({
  profiles:[fld('Total Number of Issued Shares (all classes)','120')],
  members:[...member('A','60','Ordinary'),...member('B','40','Ordinary')]
 });
 const found=auto(blank(),conflicting);
 assert.equal(value(found.document,'Total Number of Issued Shares (all classes)'),'120');
 assert.equal(value(found.document,'Number of Ordinary Shares'),'');
 assert.match(found.summary.capitalNotice,/differ/i);
});
test('pre-existing verified Annual Return totals are never replaced by holdings-derived values',()=>{
 const d=blank();
 d.particulars.find(x=>x.en==='Total Number of Issued Shares (all classes)').value='VERIFIED 1,000';
 const result=auto(d,source({members:[...member('A','75','Ordinary'),...member('B','25','Ordinary')]}));
 assert.equal(value(result.document,'Total Number of Issued Shares (all classes)'),'VERIFIED 1,000');
 assert.equal(value(result.document,'Number of Ordinary Shares'),'100');
 assert.equal(value(d,'Number of Ordinary Shares'),'');
});
