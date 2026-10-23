import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../supabase/functions/dms-sequential-signing/index.ts',import.meta.url),'utf8');
const match=src.match(/(function invitationDocumentTitle\(r\) \{[\s\S]*?\n\})\nasync function sendInvite/);
assert.ok(match,'Backend must derive title from the uploaded document');
const title=vm.runInNewContext('('+match[1]+')');

test('email subject uses uploaded PDF filename, not company or generic subject',()=>{
  assert.equal(title({
    company:'TEST SDN BHD',subject:'DRW',documents:[{name:'Board Resolution - Opening of Current Account.pdf'}]
  }), 'Board Resolution - Opening of Current Account');
});

test('multipage requests use the document filename once without page numbers',()=>{
  assert.equal(title({
    subject:'DRW',documents:[{name:'Directors Written Resolution.PDF',pages:7}]
  }), 'Directors Written Resolution');
});

test('multiple uploaded documents use first title and show additional count',()=>{
  assert.equal(title({
    subject:'Financials',documents:[
      {name:'Annual Return 2026.pdf'},{name:'Board Resolution.pdf'},{name:'Members Resolution.pdf'}
    ]
  }), 'Annual Return 2026 (+2 more documents)');
});

test('sanitizes control characters, limits length and falls back to request subject',()=>{
  assert.equal(title({subject:'DRW',documents:[{name:'Banking\r\nBcc: hacked@example.com.pdf'}]}),
    'Banking Bcc: hacked@example.com');
  assert.equal(title({subject:'Company Resolution',documents:[]}), 'Company Resolution');
  assert.ok(title({subject:'Request',documents:[{name:'A'.repeat(300)+'.pdf'}]}).length<=160);
});
