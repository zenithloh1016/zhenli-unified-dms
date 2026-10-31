import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_MSIC_CODES,extractMSICCodes,formatMSICCodes,matchesMSIC,mergeMSICCatalogues,SSM_MSIC_LOOKUP} from '../src/msic.js';
test('MSIC picker is limited to 3 entries and preserves official 5-digit leading zero codes',()=>{
 assert.equal(MAX_MSIC_CODES,3);
 const codes=[{code:'01111',en:'Growing of maize'}, {code:'62010',en:'Computer programming activities'}, {code:'68100',en:'Real estate activities with own or leased property'}];
 const value=formatMSICCodes(codes);
 assert.deepEqual(extractMSICCodes(value),codes);
 assert.throws(()=>formatMSICCodes([...codes,{code:'46900',en:'Wholesale trade'}]),/Maximum three/);
 assert.throws(()=>formatMSICCodes([...codes,{code:'01111',en:'Growing of maize'}]),/Maximum three/);
 assert.ok(SSM_MSIC_LOOKUP.includes('ssm.com.my'));
});
test('MSIC search finds codes and both English and Malay descriptions',()=>{
 const rows=[{code:'01111',en:'Growing of maize',bm:'Penanaman jagung'},
 {code:'62010',en:'Computer programming activities',bm:'Aktiviti pengaturcaraan komputer'}];
 assert.equal(matchesMSIC(rows,'62010')[0].code,'62010');
 assert.equal(matchesMSIC(rows,'jagung')[0].code,'01111');
 assert.equal(matchesMSIC(rows,'computer')[0].code,'62010');
 assert.deepEqual(matchesMSIC(rows,'x'),[]);
});
test('retains existing ROC suffix codes only when explicitly supplied',()=>{
 const value='01111e — Export of maize\n62010 — Computer programming activities';
 assert.deepEqual(extractMSICCodes(value).map(x=>x.code),['01111e','62010']);
});

test('official ROC suffix variants remain distinct and appear in search/PDF values',()=>{
 const dosm=[{code:'29300',en:'Manufacture of parts and accessories for motor vehicles'}];
 const roc=[
  {code:'29300e',en:'Export of parts and accessories for motor vehicles'},
  {code:'29300i',en:'Import of parts and accessories for motor vehicles'},
  {code:'29300u',en:'Export and Import of parts and accessories for motor vehicles'},
  {code:'47991a',en:'Franchisor'}
 ];
 const list=mergeMSICCatalogues(dosm,roc);
 assert.deepEqual(matchesMSIC(list,'29300').map(x=>x.code),['29300','29300e','29300i','29300u']);
 assert.equal(matchesMSIC(list,'29300u')[0].code,'29300u');
 const value=formatMSICCodes([roc[2]]);
 assert.equal(extractMSICCodes(value)[0].code,'29300u');
 assert.equal(extractMSICCodes(formatMSICCodes([roc[3]]))[0].code,'47991a');
});
