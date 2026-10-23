import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import vm from 'node:vm';

const source=readFileSync(new URL('../google-apps-script/SequentialSigningGmailRelay.gs',import.meta.url),'utf8');
const secret='4'.repeat(64);
const sent=[],cache=new Map();
const runtime={
  Session:{getEffectiveUser:()=>({getEmail:()=> 'zhenlisecretary@gmail.com'})},
  MailApp:{getRemainingDailyQuota:()=>15,sendEmail:m=>sent.push(m)},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>secret})},
  Utilities:{
    Charset:{UTF_8:'UTF-8'},
    computeHmacSha256Signature:(message,key)=>[...createHmac('sha256',key).update(message).digest()]
      .map(b=>b>127?b-256:b)
  },
  ContentService:{
    MimeType:{JSON:'application/json'},
    createTextOutput:(value)=>({value,setMimeType(){return this;}})
  },
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value)})}
};
const context=vm.createContext(runtime);
vm.runInContext(source,context,{filename:'SequentialSigningGmailRelay.gs'});
const payload={
  kind:'send',
  to:'test@example.com',name:'Test Signer',company:'TEST SDN BHD',
  subject:'Resolution',note:'Review before signing',
  link:'https://zenithloh1016.github.io/zhenli-unified-dms/sign/?token='+
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.'+
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.'+'c'.repeat(64)
};
function makeRequest(body,nonce='3'.repeat(32)){
  const timestamp=Date.now();
  const message=timestamp+'.'+nonce+'.'+JSON.stringify(body);
  const signature=createHmac('sha256',secret).update(message).digest('hex');
  return {postData:{contents:JSON.stringify({timestamp,nonce,payload:body,signature})}};
}
function exec(request){return JSON.parse(context.doPost(request).value);}

test('authorized sender and ping handshake',()=>{
  assert.match(context.authorizeSender(),/Authorized/);
  const reply=exec(makeRequest({kind:'ping'},'1'.repeat(32)));
  assert.equal(reply.ok,true);
  assert.equal(reply.sender,'zhenlisecretary@gmail.com');
  assert.equal(reply.quotaRemaining,15);
});
test('one signed message accepted and repeat blocked',()=>{
  assert.equal(exec(makeRequest(payload)).accepted,true);
  assert.equal(sent.length,1);
  assert.equal(sent[0].to,'test@example.com');
  assert.match(sent[0].body,/Secure individual signing link/);
  assert.equal(exec(makeRequest(payload)).ok,false);
  assert.equal(sent.length,1);
});
test('rejects untrusted links, missing HMAC and different account',()=>{
  const wrong={...payload,link:'https://example.com/fake?token=x'};
  assert.equal(exec(makeRequest(wrong,'5'.repeat(32))).ok,false);
  assert.equal(sent.length,1);
  const unsigned={postData:{contents:JSON.stringify({payload,nonce:'8'.repeat(32),timestamp:Date.now(),signature:'0'.repeat(64)})}};
  assert.equal(exec(unsigned).ok,false);
  assert.equal(sent.length,1);
});
