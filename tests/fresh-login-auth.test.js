import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshLoginAuthOptions,clearLegacyAuthSession} from '../src/fresh-login-auth.js';

test('all new Supabase sessions exist in memory only, but refresh while open',()=>{
  assert.deepEqual(freshLoginAuthOptions(),{
    persistSession:false,autoRefreshToken:true,detectSessionInUrl:false
  });
});

test('legacy auth token is cleared without deleting unrelated drafts or tasks',()=>{
  const data=new Map([
    ['sb-dzhsfqhhefwfzdrvivaj-auth-token','old-session'],
    ['annual-return-draft','keep'],
    ['task-hub-data','keep'],
    ['sb-otherproject-auth-token','other-app']
  ]);
  const storage={removeItem:k=>data.delete(k)};
  assert.equal(clearLegacyAuthSession('https://dzhsfqhhefwfzdrvivaj.supabase.co',storage),true);
  assert.equal(data.has('sb-dzhsfqhhefwfzdrvivaj-auth-token'),false);
  assert.equal(data.get('annual-return-draft'),'keep');
  assert.equal(data.get('task-hub-data'),'keep');
  assert.equal(data.get('sb-otherproject-auth-token'),'other-app');
});

test('never try to delete an untrusted or non-Supabase storage key',()=>{
  const touched=[];
  const storage={removeItem:k=>touched.push(k)};
  assert.equal(clearLegacyAuthSession('https://malicious.example.com',storage),false);
  assert.deepEqual(touched,[]);
});

test('both main UNICOSEC app and separate Task Hub opt into fresh-login auth',()=>{
  for(const path of ['src/main.js','src/task-hub-cloud.js']){
    const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.match(source,/freshLoginAuthOptions\(\)/);
    assert.match(source,/clearLegacyAuthSession\(/);
    assert.doesNotMatch(source,/persistSession\s*:\s*true/);
    assert.match(source,/auth\.signInWithPassword/);
  }
});

test('login screens do not pre-populate email or password from a prior visit',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const hub=readFileSync(new URL('../src/task-hub-cloud.js',import.meta.url),'utf8');
  assert.match(main,/id="auth-form"[^\n]*autocomplete="off"/);
  assert.match(hub,/id=\\"zh-cloud-login\\"[^\n]*autocomplete=\\"off\\"/);
});
