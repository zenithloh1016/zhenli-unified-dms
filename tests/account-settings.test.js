import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAccountSettings,requestAccountEmailChange,requestAccountPasswordChange} from '../src/account-settings.js';

test('account screen escapes current email and has separate forms', () => {
  const page=renderAccountSettings('user"><script>alert(1)</script>@example.com');
  assert.ok(page.includes('id="account-email-form"'));
  assert.ok(page.includes('id="account-password-form"'));
  assert.ok(!page.includes('<script>'));
  assert.ok(page.includes('&lt;script&gt;'));
});

test('email change updates only current auth identity', async () => {
  const calls=[];
  const auth={updateUser:async fields=>{calls.push(fields);return {error:null};}};
  const message=await requestAccountEmailChange(auth,{
    currentEmail:'old@example.com',newEmail:' new@example.com ',confirmEmail:'new@example.com'
  });
  assert.deepEqual(calls,[{email:'new@example.com'}]);
  assert.match(message,/verification/i);
});

test('email change rejects mismatched and identical email without updating', async () => {
  let called=false;
  const auth={updateUser:async()=>{called=true;return {error:null};}};
  await assert.rejects(requestAccountEmailChange(auth,{currentEmail:'a@example.com',newEmail:'b@example.com',confirmEmail:'c@example.com'}),/do not match/);
  await assert.rejects(requestAccountEmailChange(auth,{currentEmail:'a@example.com',newEmail:'A@example.com',confirmEmail:'A@example.com'}),/same/);
  assert.equal(called,false);
});

test('password change verifies current password before updating the same user', async () => {
  const calls=[];
  const auth={
    signInWithPassword:async params=>{calls.push(['verify',params]);return {data:{user:{id:'user-1'}},error:null};},
    updateUser:async params=>{calls.push(['update',params]);return {error:null};}
  };
  await requestAccountPasswordChange(auth,{userId:'user-1',email:'old@example.com',currentPassword:'old-secret',newPassword:'a-long-new-secret',confirmPassword:'a-long-new-secret'});
  assert.deepEqual(calls,[['verify',{email:'old@example.com',password:'old-secret'}],['update',{password:'a-long-new-secret'}]]);
});

test('password change rejects bad current password and never updates', async () => {
  let changed=false;
  const auth={signInWithPassword:async()=>({error:{message:'invalid login'}}),updateUser:async()=>{changed=true;return {error:null};}};
  await assert.rejects(requestAccountPasswordChange(auth,{userId:'u',email:'a@example.com',currentPassword:'incorrect',newPassword:'a-long-new-secret',confirmPassword:'a-long-new-secret'}),/Could not verify/);
  assert.equal(changed,false);
});

test('password change rejects mistaken identity and too-short passwords', async () => {
  let changed=false;
  const auth={signInWithPassword:async()=>({data:{user:{id:'different'}},error:null}),updateUser:async()=>{changed=true;return {error:null};}};
  const args={userId:'correct',email:'a@example.com',currentPassword:'old-password',newPassword:'a-long-new-secret',confirmPassword:'a-long-new-secret'};
  await assert.rejects(requestAccountPasswordChange(auth,args),/Login account changed/);
  await assert.rejects(requestAccountPasswordChange(auth,{...args,newPassword:'short',confirmPassword:'short'}),/at least 12/);
  assert.equal(changed,false);
});
