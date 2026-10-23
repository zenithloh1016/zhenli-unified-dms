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
test('DMS Task Hub stays embedded in Supabase without a standalone launch button',()=>{
  assert.match(dms,/const TASK_HUB_CLOUD = new globalThis\.URL\('\.\/task-hub-cloud\/index\.html'/);
  assert.match(dms,/const TASK_HUB_BUNDLED = new globalThis\.URL\('\.\/task-hub\/index\.html'/);
  assert.doesNotMatch(dms,/function getTaskHubUrl\(/);
  assert.doesNotMatch(dms,/renderLinkModal|task-link-form|task-settings|reset-task-link|launch-hosted-task|zhenli:taskhub:external|taskLink/);
  assert.doesNotMatch(dms,/action\('Open standalone Task Hub','launch-cloud-task'/);
  assert.match(dms,/action\('Full-screen view','open-tasks'/);
  assert.match(dms,/id="zh-task-frame"/);
  assert.match(dms,/a==='launch-cloud-task'/);
  assert.doesNotMatch(dms.slice(dms.indexOf('function renderTasks()'),dms.indexOf('// ZHENLI_SIGNING_COOKIE_SAFE_LAUNCH')),/getTaskHubUrl\(\)|edgeone\.cool|Connection settings/);
  assert.match(dms,/Existing Tencent EdgeOne/,'separate EdgeOne signing remains available');
  assert.match(dms,/TASK_HUB_CLOUD/);
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

test('Task Hub offers eight selectable statuses, preserves completion and progress',()=>{
  const statuses=taskHub.match(/const STATUSES = \[([\s\S]*?)\];/);
  assert.ok(statuses, 'status options should exist');
  const names=[...statuses[1].matchAll(/name:'([^']+)'/g)].map(match=>match[1]);
  assert.deepEqual(names,['To do','In progress','Waiting CTC','Waiting client','Waiting SSM','Waiting auditor','Waiting tax agent','Completed']);
  assert.match(taskHub,/const isDone = t => t.status==='done'/);
  assert.match(taskHub,/const workflowStatus = id =>/);
  assert.ok(taskHub.includes("status:workflowStatus($('#taskStatus').value)"));
});

test('task hub frame and scripts are cache-busted after status updates',()=>{
  const version='20261023-eight-status-v4';
  assert.match(dms,new RegExp('task-hub/index\\.html'));
  assert.ok(dms.includes("?'v=")===false); // version is appended after href
  assert.ok(dms.includes("?v="+version));
  assert.ok(cloud.includes("?v="+version));
  assert.ok(taskHtml.includes('app.js?v='+version));
  assert.ok(taskHtml.includes('styles.css?v='+version));
});
