import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMbrsWorkspace,mbrsWorksheetCsv,mbrsPreparationSummary,mountMbrsPreparation} from '../src/mbrs-preparation.js';
import {readFileSync} from 'node:fs';

const annualReturn=()=>({
 company:{name:'',no:'',arYear:'',arDate:''},
 particulars:[
  {type:'section',en:'COMPANY DETAILS'},
  {type:'field',en:'Company Name',value:'EXAMPLE SDN. BHD.'},
  {type:'field',en:'Company Registration No.',value:'202601234567'},
  {type:'field',en:'Annual Return Year',value:'2026'},
  {type:'field',en:'Anniversary Date',value:'06/11/2026'},
  {type:'section',en:'SECTION D - DIRECTORS, COMPANY SECRETARY AND AUDITOR'},
  {type:'heading',en:'DIRECTOR 1'},
  {type:'field',en:'Full Name',value:'TEST DIRECTOR'},
  {type:'heading',en:'AUDITOR'},
  {type:'field',en:'Audit Firm Name',value:'EXAMPLE AUDIT'},
  {type:'section',en:'SECTION E - PARTICULARS OF MEMBERS'},
  {type:'heading',en:'MEMBER 1'},
  {type:'field',en:'Individual Full Name',value:'TEST MEMBER'}
 ]
});
test('AR1 extracts current draft without mutating it or inventing XBRL',()=>{
 const doc=annualReturn(),before=JSON.stringify(doc);
 const result=extractMbrsWorkspace(doc);
 assert.equal(result.format,'UNICOSEC-MBRS-PREPARATION-ONLY');
 assert.equal(result.filingType,'AR1');
 assert.equal(result.company.registrationNo,'202601234567');
 assert.equal(result.company.name,'EXAMPLE SDN. BHD.');
 assert.equal(result.fields.find(x=>x.record==='MEMBER 1').value,'TEST MEMBER');
 assert.equal(result.checks.filter(x=>x.level==='missing').length,0);
 assert.match(mbrsPreparationSummary(result),/Not an SSM filing/);
 assert.equal(JSON.stringify(doc),before);
});
test('AR4 requires independent unchanged-particulars confirmation',()=>{
 const no=extractMbrsWorkspace(annualReturn(),{filingType:'AR4'});
 assert.ok(no.checks.some(x=>x.level==='missing'&&/unchanged/.test(x.message)));
 const yes=extractMbrsWorkspace(annualReturn(),{filingType:'AR4',unchangedConfirmed:true});
 assert.ok(!yes.checks.some(x=>x.level==='missing'&&/unchanged/.test(x.message)));
 assert.ok(yes.checks.some(x=>x.level==='review'&&/AR4/.test(x.message)));
});
test('missing company identity blocks readiness',()=>{
 const doc=annualReturn();
 doc.particulars.find(x=>x.en==='Company Registration No.').value='';
 doc.particulars.find(x=>x.en==='Anniversary Date').value='';
 const result=extractMbrsWorkspace(doc);
 assert.ok(result.checks.filter(x=>x.level==='missing').length>=2);
});
test('exported CSV quotes values, prevents Excel formula injection and is explicitly a worksheet',()=>{
 const doc=annualReturn();
 doc.particulars.push({type:'field',en:'Notes',value:'=WEBSERVICE("https://example.test")'});
 const csv=mbrsWorksheetCsv(extractMbrsWorkspace(doc));
 assert.ok(csv.startsWith('\uFEFF"Filing Type"'));
 assert.ok(csv.includes('"\u0027=WEBSERVICE(""https://example.test"")"'));
 assert.ok(csv.includes('"AR1","COMPANY DETAILS","","Company Name","EXAMPLE SDN. BHD."'));
 assert.ok(!csv.includes('"<xbrl'));
});
test('invalid filing types are not silently accepted',()=>{
 assert.throws(()=>extractMbrsWorkspace(annualReturn(),{filingType:'EA2'}),/Choose AR1 or AR4/);
});

test('MBRS check button responds immediately, updates with the current draft and avoids duplicate handlers',()=>{
 const makeElement=()=>{
  const listeners=new Map();
  return {
   listeners,dataset:{},hidden:false,value:'',checked:false,textContent:'',attributes:{},
   addEventListener(event,callback){
    if(!listeners.has(event))listeners.set(event,[]);
    listeners.get(event).push(callback);
   },
   setAttribute(name,value){this.attributes[name]=value;},
   fire(event){for(const callback of listeners.get(event)||[])callback();}
  };
 };
 const ids=['mbrs-type','mbrs-ar4-confirmation','mbrs-check','mbrs-csv',
  'mbrs-json','mbrs-copy','mbrs-status','mbrs-checklist',
  'mbrs-ar4-confirm-row','mbrs-ssm-guide'];
 const elements=Object.fromEntries(ids.map(id=>[id,makeElement()]));
 elements['mbrs-type'].value='AR1';
 const root={dataset:{},querySelector:selector=>elements[selector.slice(1)]};
 const previousDocument=globalThis.document;
 globalThis.document={getElementById:id=>id==='mbrs-preparation'?root:null};
 let current=annualReturn();
 try{
  mountMbrsPreparation(()=>current);
  mountMbrsPreparation(()=>current);
  assert.equal(elements['mbrs-check'].listeners.get('click').length,1);
  elements['mbrs-check'].fire('click');
  assert.match(elements['mbrs-status'].textContent,/Preparation review completed/);
  assert.match(elements['mbrs-checklist'].textContent,/EXAMPLE SDN. BHD./);
  assert.equal(elements['mbrs-checklist'].hidden,false);
  current=annualReturn();
  current.particulars.find(row=>row.en==='Company Name').value='UPDATED COMPANY SDN. BHD.';
  elements['mbrs-check'].fire('click');
  assert.match(elements['mbrs-checklist'].textContent,/UPDATED COMPANY SDN. BHD./);
 }finally{
  if(previousDocument===undefined)delete globalThis.document;
  else globalThis.document=previousDocument;
 }
});
test('MBRS controls mount during initial page boot rather than only after cloud draft load',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const applyStart=main.indexOf('applyDocument:document=>{');
 const statusStart=main.indexOf('onStatus:',applyStart);
 const readyStart=main.indexOf('// Fill only blank secretary particulars',statusStart);
 assert.ok(applyStart>=0&&statusStart>applyStart&&readyStart>statusStart);
 assert.doesNotMatch(main.slice(applyStart,statusStart),/mountMbrsPreparation/);
 assert.match(main.slice(statusStart,readyStart),/mountMbrsPreparation\(\(\)=>doc\);/);
});
