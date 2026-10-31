import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSSMROCText} from '../src/ssm-roc-text.js';
test('reads only exact SSM PDF table rows and preserves published alphabetic codes',()=>{
 const page=' No   Business Code    Description (Malay)        Description (English)\n'+
  ' 1124   29300e           Eksport alat ganti dan aksesori untuk kenderaan bermotor     Export of parts and accessories for motor vehicles\n'+
  ' 1125   29300i           Import alat ganti dan aksesori untuk kenderaan bermotor     Import of parts and accessories for motor vehicles\n'+
  ' 1126   29300u           Eksport dan Import alat ganti dan aksesori untuk kenderaan bermotor     Export and Import of parts and accessories for motor vehicles\n'+
  ' 1426   47991a           Franchisor         Franchisor\n'+
  ' unrelated 29300x with made-up code\n';
 const rows=parseSSMROCText(page);
 assert.deepEqual(rows.map(x=>x.code),['29300e','29300i','29300u','47991a']);
 assert.equal(rows[2].en,'Export and Import of parts and accessories for motor vehicles');
});
