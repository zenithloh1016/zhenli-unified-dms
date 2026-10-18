import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_MSIC_CODES,extractMSICCodes,formatMSICCodes,matchesMSIC,SSM_MSIC_LOOKUP} from '../src/msic.js';
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
