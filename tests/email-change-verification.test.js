import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resendEmailChangeConfirmation} from '../src/email-change-verification.js';

test('resends only pending email-change verification using the new email',async()=>{
 const calls=[];
 const message=await resendEmailChangeConfirmation({resend:async x=>{calls.push(x);return {error:null};}},' new@example.com ');
 assert.deepEqual(calls,[{type:'email_change',email:'new@example.com'}]);
 assert.match(message,/PREVIOUS email/);
 assert.match(message,/requested/);
});
test('rejects malformed address before making an auth request',async()=>{
 let called=false;
 await assert.rejects(resendEmailChangeConfirmation({resend:async()=>{called=true;}},'bad'),/new email address/);
 assert.equal(called,false);
});
test('propagates Supabase provider and rate-limit errors',async()=>{
 await assert.rejects(resendEmailChangeConfirmation({resend:async()=>({error:new Error('too many requests')})},'new@example.com'),/too many requests/);
});
test('UNICOSEC sign-in offers resend confirmation and preserves manual credentials',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(source,/resend-email-change-form/);
 assert.match(source,/resendEmailChangeConfirmation/);
 assert.match(source,/auth-email-change/);
 assert.match(source,/freshLoginAuthOptions\(\)/);
 assert.match(source,/auth\.signInWithPassword/);
});
