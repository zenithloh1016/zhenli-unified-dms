import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank,normalizeDocument} from '../src/core.js';
import {applyAnnualReturnDefaults,msicCodesFromProfileFields,formatRinggitAmount} from '../src/derived-defaults.js';
import {extractMSICCodes,completeMSICDescriptions} from '../src/msic.js';
const field=(d,key)=>d.particulars.find(x=>x.type==='field'&&x.en===key);
test('defaults address fields to registered and principal office, never overriding verified exceptions',()=>{
 const d=cloneBlank();
 field(d,'Registered Office').value='REGISTERED OFFICE, IPOH';
 field(d,'Principal Place of Business').value='BUSINESS OFFICE, KL';
 const a=applyAnnualReturnDefaults(d);
 assert.equal(a.addresses,2);
 assert.equal(field(d,'Address Where Register of Members Is Kept').value,'REGISTERED OFFICE, IPOH');
 assert.equal(field(d,'Address Where Financial Records Are Kept').value,'BUSINESS OFFICE, KL');
 field(d,'Address Where Register of Members Is Kept').value='DIFFERENT VERIFIED REGISTER OFFICE';
 assert.equal(applyAnnualReturnDefaults(d).addresses,0);
 assert.equal(field(d,'Address Where Register of Members Is Kept').value,'DIFFERENT VERIFIED REGISTER OFFICE');
});
test('RM1/share fills only missing MYR ordinary and preference paid-up amounts and retains provenance',()=>{
 const d=cloneBlank();
 field(d,'Number of Ordinary Shares').value='150,000';
 field(d,'Number of Preference Shares').value='50,000';
 field(d,'Currency').value='MYR';
 const a=applyAnnualReturnDefaults(d);
 assert.equal(a.capital,2);
 assert.equal(field(d,'Ordinary Share Capital (recorded amount paid)').value,'RM150,000.00');
 assert.equal(field(d,'Preference Share Capital (recorded amount paid)').value,'RM50,000.00');
 assert.equal(field(d,'Ordinary Share Capital (recorded amount paid)').autoAssumedRate,1);
 assert.equal(field(normalizeDocument(d),'Ordinary Share Capital (recorded amount paid)').autoAssumedRate,1);
 assert.equal(applyAnnualReturnDefaults(d).capital,0,'idempotent');
 field(d,'Number of Ordinary Shares').value='250,000';
 assert.equal(applyAnnualReturnDefaults(d).capital,1);
 assert.equal(field(d,'Ordinary Share Capital (recorded amount paid)').value,'RM250,000.00');
});
test('explicit capital always wins, and no RM estimate for missing counts or foreign currency',()=>{
 const d=cloneBlank();
 field(d,'Number of Ordinary Shares').value='200';
 field(d,'Ordinary Share Capital (recorded amount paid)').value='RM 560.00';
 field(d,'Number of Preference Shares').value='40';
 field(d,'Currency').value='USD';
 assert.equal(applyAnnualReturnDefaults(d).capital,0);
 assert.equal(field(d,'Ordinary Share Capital (recorded amount paid)').value,'RM 560.00');
 assert.equal(field(d,'Preference Share Capital (recorded amount paid)').value,'');
 field(d,'Currency').value='MYR';
 assert.equal(applyAnnualReturnDefaults(d).capital,2);
 assert.equal(field(d,'Ordinary Share Capital (recorded amount paid)').value,'RM560.00');
 assert.equal(field(d,'Preference Share Capital (recorded amount paid)').value,'RM40.00');
});
test('sole declared class with explicit issued total can provide count, mixed class cannot',()=>{
 const d=cloneBlank();
 field(d,'Classes of Shares Issued').value='Preference';
 field(d,'Total Number of Issued Shares (all classes)').value='8,000';
 const result=applyAnnualReturnDefaults(d);
 assert.equal(result.capital,2,'preference count and amount');
 assert.equal(field(d,'Number of Preference Shares').value,'8,000');
 assert.equal(field(d,'Preference Share Capital (recorded amount paid)').value,'RM8,000.00');
 const other=cloneBlank();
 field(other,'Classes of Shares Issued').value='Ordinary & Preference';
 field(other,'Total Number of Issued Shares (all classes)').value='8,000';
 assert.equal(applyAnnualReturnDefaults(other).capital,0);
});
test('MSIC codes are extracted exclusively from labelled profile fields',()=>{
 const codes=msicCodesFromProfileFields([
  {label:'MSIC Code 1',value:'64923 - Licensed money lending'},
  {label:'Nature of Business / MSIC Code',value:'64929, 66192'},
  {label:'MSIC code 3',value:'64923'},
  {label:'Registered Address',value:'64924 POSTCODE'}
 ]);
 assert.deepEqual(codes,['64923','64929','66192']);
});
test('converts legacy compact MSIC entries and adds missing codes once, maximum three',()=>{
 const d=cloneBlank();
 field(d,'Nature of Business / MSIC Code').value='Licensed money lending | MSIC: 64923, 64929';
 const first=applyAnnualReturnDefaults(d,{msicCodes:['64923','64929','66192','66199']});
 const text=field(d,'Nature of Business / MSIC Code').value;
 assert.equal(first.msic,1);
 assert.deepEqual(extractMSICCodes(text).map(x=>x.code),['64923','64929','66192']);
 assert.match(text,/Licensed money lending/);
 assert.equal(applyAnnualReturnDefaults(d,{msicCodes:['64923','64929','66192']}).msic,0);
 const blank=cloneBlank();
 const fieldBlank=field(blank,'Nature of Business / MSIC Code');
 fieldBlank.value='64923,64929';
 applyAnnualReturnDefaults(blank);
 assert.deepEqual(extractMSICCodes(fieldBlank.value).map(x=>x.code),['64923','64929']);
});

test('Ringgit amounts are rendered with RM and two decimals without FX conversion',()=>{
 assert.equal(formatRinggitAmount('100,000.00'),'RM100,000.00');
 assert.equal(formatRinggitAmount('MYR 125599225'),'RM125,599,225.00');
 assert.equal(formatRinggitAmount('RM 250.5'),'RM250.50');
 assert.equal(formatRinggitAmount('RM1,000.00'),'RM1,000.00');
 assert.equal(formatRinggitAmount('USD 10,000.00'),'USD 10,000.00');
 assert.equal(formatRinggitAmount('NOT PROVIDED'),'NOT PROVIDED');
});
test('verified ordinary and preference paid-up capital normalize without changing their amounts',()=>{
 const d=cloneBlank();
 field(d,'Currency').value='MYR';
 field(d,'Ordinary Share Capital (recorded amount paid)').value='100,000.00';
 field(d,'Preference Share Capital (recorded amount paid)').value='RM 5,000';
 assert.equal(applyAnnualReturnDefaults(d).capital,2);
 assert.equal(field(d,'Ordinary Share Capital (recorded amount paid)').value,'RM100,000.00');
 assert.equal(field(d,'Preference Share Capital (recorded amount paid)').value,'RM5,000.00');
 assert.equal(applyAnnualReturnDefaults(d).capital,0);
});

test('reopened draft carries registered and business addresses, both capital classes and MSIC into PDF values',()=>{
 const draft=normalizeDocument(cloneBlank());
 field(draft,'Registered Office').value='REGISTERED OFFICE, IPOH';
 field(draft,'Principal Place of Business').value='PRINCIPAL BUSINESS, KUALA LUMPUR';
 field(draft,'Number of Ordinary Shares').value='100,000';
 field(draft,'Number of Preference Shares').value='20,000';
 field(draft,'Currency').value='MYR';
 const defaults=applyAnnualReturnDefaults(draft,{msicCodes:['64923','64929']});
 assert.equal(defaults.addresses,2);
 assert.equal(field(draft,'Address Where Register of Members Is Kept').value,'REGISTERED OFFICE, IPOH');
 assert.equal(field(draft,'Address Where Financial Records Are Kept').value,'PRINCIPAL BUSINESS, KUALA LUMPUR');
 assert.equal(field(draft,'Ordinary Share Capital (recorded amount paid)').value,'RM100,000.00');
 assert.equal(field(draft,'Preference Share Capital (recorded amount paid)').value,'RM20,000.00');
 const msic=field(draft,'Nature of Business / MSIC Code');
 msic.value=completeMSICDescriptions(msic.value,[
  {code:'64923',en:'Licensed money lending activities'},
  {code:'64929',en:'Other credit granting n.e.c.'}
 ]);
 assert.deepEqual(extractMSICCodes(msic.value),[
  {code:'64923',en:'Licensed money lending activities'},
  {code:'64929',en:'Other credit granting n.e.c.'}
 ]);
 const restored=normalizeDocument(draft);
 assert.equal(field(restored,'Address Where Register of Members Is Kept').value,'REGISTERED OFFICE, IPOH');
 assert.equal(field(restored,'Preference Share Capital (recorded amount paid)').autoAssumedRate,1);
 assert.equal(applyAnnualReturnDefaults(restored,{msicCodes:['64923','64929']}).filled,0,
  'reopening and regenerating PDF must not duplicate MSIC codes or recalculate unchanged values');
});
