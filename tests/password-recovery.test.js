import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestRecoveryEmail,RECOVERY_REDIRECT,completeRecovery,isRecoveryLink} from '../src/password-recovery-helpers.js';

test('recovery email targets hosted recovery page, with original email if unconfirmed',async()=>{
 const calls=[];
 const result=await requestRecoveryEmail({resetPasswordForEmail:async (...args)=>{calls.push(args);return {error:null};}},' old@company.com ');
 assert.deepEqual(calls,[['old@company.com',{redirectTo:RECOVERY_REDIRECT}]]);
 assert.match(result,/PREVIOUS confirmed email/);
});
test('recovery form requires 12+ chars and matching confirmation',async()=>{
 let changed=false;
 const auth={getUser:async()=>({data:{user:{id:'user-1'}}}),updateUser:async()=>{changed=true;return {error:null};},signOut:async()=>({error:null})};
 await assert.rejects(completeRecovery(auth,'short','short'),/at least 12/);
 await assert.rejects(completeRecovery(auth,'very-long-secret','no-match'),/do not match/);
 assert.equal(changed,false);
});
test('valid recovery updates only password and signs out after success',async()=>{
 const calls=[];
 const auth={getUser:async()=>({data:{user:{id:'u'}}}),updateUser:async x=>{calls.push(['updateUser',x]);return {error:null};},signOut:async()=>{calls.push(['signOut']);return {error:null};}};
 const msg=await completeRecovery(auth,'a-new-long-password','a-new-long-password');
 assert.deepEqual(calls,[['updateUser',{password:'a-new-long-password'}],['signOut']]);
 assert.match(msg,/confirmed email address/);
});
test('only dedicated recovery link authorizes reset UI',()=>{
 assert.equal(isRecoveryLink('https://example.org/password-recovery/#type=recovery&access_token=abc'),true);
 assert.equal(isRecoveryLink('https://example.org/password-recovery/#type=signup'),false);
 const source=readFileSync(new URL('../src/password-recovery.js',import.meta.url),'utf8');
 assert.match(source,/detectSessionInUrl:true/);
 assert.match(source,/persistSession:false/);
 assert.match(source,/cameFromRecoveryLink/);
});
test('recovery is a separately built page; normal login never stores session',()=>{
 const vite=readFileSync(new URL('../vite.config.js',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const helper=readFileSync(new URL('../src/fresh-login-auth.js',import.meta.url),'utf8');
 assert.match(vite,/passwordRecovery:resolve\('password-recovery\/index.html'\)/);
 assert.match(main,/password-reset-request-form/);
 assert.match(helper,/persistSession:false/);
});
