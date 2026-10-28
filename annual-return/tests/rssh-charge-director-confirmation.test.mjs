import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloneBlank,normalizeDocument,removeRsshRegisteredCharge2} from '../src/core.js';
import {createAnnualReturnHistory} from '../src/history.js';
import {saveAnnualReturnDraft,readAnnualReturnDraft} from '../src/drafts.js';

function withSecondCharge(company='RSSH SERVICES SDN BHD'){
 const doc=cloneBlank();
 doc.company.name=company;
 const items=doc.particulars;
 const first=items.findIndex(item=>item.type==='heading'&&item.en==='REGISTERED CHARGE 1');
 const total=items.findIndex(item=>item.type==='field'&&item.en==='Number of Registered Charges');
 const firstData=items.findIndex((x,i)=>i>first&&x.en==='Registered No.');
 items[firstData].value='SAVED-CHARGE-ONE';
 items[total].value='2';
 items.splice(total,0,
  {type:'heading',en:'REGISTERED CHARGE 2',cn:'已登记押记 2',value:''},
  {type:'field',en:'Registered No.',cn:'登记编号',value:'SAVED-CHARGE-TWO'},
  {type:'field',en:'Chargee',cn:'押记权人',value:'SAVED CHARGEE'}
 );
 return doc;
}
function storage(){
 const m=new Map();
 return {get length(){return m.size;},key:index=>[...m.keys()][index]??null,
  getItem:key=>m.get(key)??null,setItem:(key,value)=>m.set(String(key),String(value)),
  removeItem:key=>m.delete(key)};
}
test('RSSH only: removing second registered charge preserves first and summary fields',()=>{
 const doc=withSecondCharge();
 const history=createAnnualReturnHistory(doc);
 const result=removeRsshRegisteredCharge2(doc);
 assert.deepEqual(result,{removed:true,removedFields:2,remaining:1,updatedCount:true});
 assert.ok(!doc.particulars.some(item=>item.type==='heading'&&item.en==='REGISTERED CHARGE 2'));
 assert.ok(doc.particulars.some(item=>item.en==='Registered No.'&&item.value==='SAVED-CHARGE-ONE'));
 assert.ok(!doc.particulars.some(item=>item.value==='SAVED-CHARGE-TWO'));
 assert.equal(doc.particulars.find(x=>x.en==='Number of Registered Charges').value,'1');
 assert.ok(doc.particulars.some(x=>x.en==='Current Outstanding Indebtedness'));
 history.capture(doc);
 assert.ok(history.undo().particulars.some(x=>x.en==='REGISTERED CHARGE 2'));
 assert.ok(!history.redo().particulars.some(x=>x.en==='REGISTERED CHARGE 2'));
 const local=storage();
 saveAnnualReturnDraft(local,'dms:test-account','rssh-company',doc);
 const resumed=readAnnualReturnDraft(local,'dms:test-account','rssh-company').data;
 assert.ok(!resumed.particulars.some(x=>x.en==='REGISTERED CHARGE 2'));
});
test('Other companies and already corrected RSSH drafts are unchanged',()=>{
 const other=withSecondCharge('TOPGEN RESOURCES SDN BHD');
 const before=JSON.stringify(other);
 assert.deepEqual(removeRsshRegisteredCharge2(other),{removed:false,reason:'different-company'});
 assert.equal(JSON.stringify(other),before);
 const rssh=withSecondCharge();
 assert.equal(removeRsshRegisteredCharge2(rssh).removed,true);
 const after=JSON.stringify(rssh);
 assert.deepEqual(removeRsshRegisteredCharge2(rssh),{removed:false,reason:'already-absent'});
 assert.equal(JSON.stringify(rssh),after);
 assert.ok(normalizeDocument(rssh));
});
test('Non-matching statutory charge counts are not silently overwritten',()=>{
 const doc=withSecondCharge();
 doc.particulars.find(x=>x.en==='Number of Registered Charges').value='3';
 const result=removeRsshRegisteredCharge2(doc);
 assert.equal(result.removed,true);
 assert.equal(result.updatedCount,false);
 assert.equal(doc.particulars.find(x=>x.en==='Number of Registered Charges').value,'3');
});
test('RSSH saved draft performs one-time correction, with an explicit manual option',()=>{
 const editor=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(editor,/function removeRsshChargeTwoOnce\(\)/);
 assert.match(editor,/unicosec:ar:rssh-charge-2-removed:v1:/);
 assert.match(editor,/const chargeRemoved=removeRsshChargeTwoOnce\(\)/);
 assert.match(editor,/const chargeRemoved=previous\?removeRsshChargeTwoOnce\(\):''/);
 assert.match(editor,/data-remove-rssh-charge-2/);
 assert.match(editor,/function removeRsshChargeTwoNow\(\)/);
});
test('PDF Director Confirmation omits the verification qualification in both languages',()=>{
 const pdf=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
 assert.match(pdf,/I hereby confirm that the particulars stated above are true and correct to the best of my knowledge\./);
 assert.doesNotMatch(pdf,/subject to verification of any missing or noted information/i);
 assert.match(pdf,/本人谨此确认，据本人所知，上述资料属真实及正确。/);
 assert.doesNotMatch(pdf,/未提供或待核实之资料仍须另行确认/);
 assert.match(pdf,/DIRECTOR CONFIRMATION/);
});
