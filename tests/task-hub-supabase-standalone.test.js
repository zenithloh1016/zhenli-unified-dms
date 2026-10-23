import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const vite=readFileSync(new URL('../vite.config.js',import.meta.url),'utf8');
const cloud=readFileSync(new URL('../src/task-hub-cloud.js',import.meta.url),'utf8');
const dms=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const taskHub=readFileSync(new URL('../public/task-hub/app.js',import.meta.url),'utf8');
const taskHtml=readFileSync(new URL('../public/task-hub/index.html',import.meta.url),'utf8');
const cloudHtml=readFileSync(new URL('../task-hub-cloud/index.html',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../src/integrated-modules.js',import.meta.url),'utf8');

test('standalone Task Hub is a built Vite route with same original interface in authenticated frame',()=>{
  assert.match(vite,/taskHub:resolve\('task-hub-cloud\/index.html'\)/);
  assert.match(cloudHtml,/task-hub-cloud\.js/);
  assert.match(cloud,/new URL\('\.\.\/task-hub\/index\.html',window\.location\.href\)/);
  assert.match(cloud,/installHubBridge\(db,\(\)=>currentUser,\(\)=>companies/);
  assert.match(cloud,/db\.auth\.signInWithPassword/);
  assert.match(cloud,/db\.auth\.getUser\(\)/);
  assert.match(cloud,/db\.from\('companies'\)\.select\('id,name,registration_no'\)/);
  assert.match(cloud,/createClient\(endpoint,publishableKey/);
  assert.doesNotMatch(cloud,/edgeone\.cool/);
  assert.doesNotMatch(cloud,/SUPABASE_SERVICE_ROLE_KEY/);
});
test('DMS Task Hub defaults to bundled same-origin Supabase and opens independent cloud page',()=>{
  assert.match(dms,/const TASK_HUB_CLOUD = new globalThis\.URL\('\.\/task-hub-cloud\/index\.html'/);
  assert.match(dms,/function getTaskHubUrl\(\) \{[\s\S]*?return TASK_HUB_BUNDLED/);
  assert.match(dms,/action\('Open standalone Task Hub','launch-cloud-task'/);
  assert.match(dms,/id="zh-task-frame"/);
  assert.match(dms,/a==='launch-cloud-task'/);
  assert.doesNotMatch(dms.slice(dms.indexOf('function renderTasks()'),dms.indexOf('// ZHENLI_SIGNING_COOKIE_SAFE_LAUNCH')),/getTaskHubUrl\(\)|edgeone\.cool|Connection settings/);
});
test('task create, edit, checklists, recurring tasks, calendar and backup remain original',()=>{
  assert.match(taskHub,/function openTask\(id=null/);
  assert.match(taskHub,/function createFromForm\(ev\)/);
  assert.match(taskHub,/function renderCalendar\(\)/);
  assert.match(taskHub,/function renderBoard\(\)/);
  assert.match(taskHub,/function spawnRecurring\(t\)/);
  assert.match(taskHub,/function renderSteps\(\)/);
  assert.match(taskHub,/ZHENLI_HUB_SAVE/);
  assert.match(bridge,/db\.from\('task_hub_state'\)\.upsert/);
  assert.match(bridge,/event\.origin!==window\.location\.origin/);
  assert.match(bridge,/event\.source!==child\.contentWindow/);
  assert.match(taskHtml,/window\.parent === window/);
});
test('standalone redirect cannot replace embedded Task Hub and same credentials are reused',()=>{
  assert.match(taskHtml,/new URL\('\.\.\/task-hub-cloud\/index\.html',window\.location\.href\)/);
  assert.match(cloud,/persistSession:true/);
  assert.match(cloud,/detectSessionInUrl:false/);
  assert.match(cloud,/db\.auth\.signOut/);
});
