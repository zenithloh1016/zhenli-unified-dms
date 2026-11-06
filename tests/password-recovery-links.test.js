import test from 'node:test';
import assert from 'node:assert/strict';
import {isRecoveryLink,recoveryLinkKind,recoveryRedirectFromAppRoot,establishRecoverySession} from '../src/password-recovery-helpers.js';

const app='https://zenithloh1016.github.io/zhenli-unified-dms/';
const user={id:'test-user'};
test('recognises implicit hash, token_hash query and PKCE code callbacks',()=>{
 assert.equal(recoveryLinkKind(app+'password-recovery/#access_token=abc&refresh_token=xyz&type=recovery'),'implicit');
 assert.equal(recoveryLinkKind(app+'password-recovery/?type=recovery&token_hash=abc'),'token_hash');
 assert.equal(recoveryLinkKind(app+'password-recovery/?code=abc'),'pkce');
 assert.equal(isRecoveryLink(app+'password-recovery/?error=access_denied&error_description=expired'),true);
 assert.equal(isRecoveryLink(app+'password-recovery/#type=signup&access_token=abc'),false);
 assert.equal(isRecoveryLink(app),false);
});
test('unexpected root callback is redirected within origin and under the GitHub Pages repository prefix',()=>{
 const url=app+'#type=recovery&access_token=dummy&refresh_token=dummy';
 assert.equal(recoveryRedirectFromAppRoot(url),app+'password-recovery/#type=recovery&access_token=dummy&refresh_token=dummy');
 assert.equal(recoveryRedirectFromAppRoot(app+'?code=dummy'),app+'password-recovery/?code=dummy');
 assert.equal(recoveryRedirectFromAppRoot(app+'?type=recovery&token_hash=dummy'),app+'password-recovery/?type=recovery&token_hash=dummy');
 assert.equal(recoveryRedirectFromAppRoot(app+'password-recovery/?code=dummy'),'');
 assert.equal(recoveryRedirectFromAppRoot(app+'password-recovery/index.html#type=recovery'),'');
 assert.equal(recoveryRedirectFromAppRoot(app),'');
 assert.equal(recoveryRedirectFromAppRoot(app+'#type=signup'),'');
});
test('token-hash flow verifies OTP without relying on an existing or saved session',async()=>{
 const calls=[];
 const auth={verifyOtp:async arg=>{
  calls.push(arg);return {data:{session:{user}},error:null};
 }};
 const result=await establishRecoverySession(auth,app+'password-recovery/?token_hash=dummy-hash&type=recovery');
 assert.deepEqual(calls,[{token_hash:'dummy-hash',type:'recovery'}]);
 assert.equal(result.user.id,'test-user');
});
test('PKCE callback exchanges its one-time code and fails cleanly on expired or mismatched code verifier',async()=>{
 const calls=[];
 const auth={exchangeCodeForSession:async code=>{
  calls.push(code);return {data:{session:{user}},error:null};
 }};
 assert.equal((await establishRecoverySession(auth,app+'password-recovery/?code=short-lived-code')).user.id,'test-user');
 assert.deepEqual(calls,['short-lived-code']);
 await assert.rejects(establishRecoverySession({
  exchangeCodeForSession:async()=>({data:null,error:new Error('code verifier missing')})
 },app+'password-recovery/?code=expired'),/code verifier missing/);
});
test('implicit flow reads only Supabase-verified session and never accepts signup callbacks',async()=>{
 const auth={getSession:async()=>({data:{session:{user}},error:null})};
 assert.equal((await establishRecoverySession(auth,app+'password-recovery/#type=recovery&access_token=dummy')).user.id,'test-user');
 await assert.rejects(establishRecoverySession(auth,app+'password-recovery/#type=signup&access_token=dummy'),/valid password recovery link/);
 await assert.rejects(establishRecoverySession({getSession:async()=>({data:{session:null},error:null})},app+'password-recovery/#type=recovery'),/expired or invalid/);
});
