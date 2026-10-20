import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKING_RESOLUTION_FOLDER_NAME,
  WORKING_RESOLUTION_FOLDER_SORT_ORDER,
  STANDARD_FOLDER_COUNT,
  isExistingWorkingResolutionFolder,
  missingWorkingResolutionFolders
} from '../src/working-resolution-folders.js';

test('Working Resolution is the 14th standard company-root folder',()=>{
  assert.equal(WORKING_RESOLUTION_FOLDER_NAME,'Working Resolution');
  assert.equal(WORKING_RESOLUTION_FOLDER_SORT_ORDER,14);
  assert.equal(STANDARD_FOLDER_COUNT,14);
});
test('Only exact Working Resolution root folder counts as present, not Board & Members Resolution',()=>{
  assert.equal(isExistingWorkingResolutionFolder({name:'Working Resolution',parent_id:null}),true);
  assert.equal(isExistingWorkingResolutionFolder({name:'working   resolution ',parent_id:null}),true);
  assert.equal(isExistingWorkingResolutionFolder({name:'Board & Members\' Resolution',parent_id:null}),false);
  assert.equal(isExistingWorkingResolutionFolder({name:'Working Resolution',parent_id:'some-child'}),false);
  assert.equal(isExistingWorkingResolutionFolder({name:'Working Resolutions',parent_id:null}),false);
});
test('Backfill detects only missing folders without duplicates or changes to documents',()=>{
  const companies=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
  const existing=[
    {company_id:'a',parent_id:null,name:'Working Resolution'},
    {company_id:'b',parent_id:null,name:'Board & Members\' Resolution'},
    {company_id:'c',parent_id:'nested',name:'Working Resolution'},
    {company_id:'d',parent_id:null,name:' WORKING   RESOLUTION '}
  ];
  assert.deepEqual(missingWorkingResolutionFolders(companies,existing).map(x=>x.id),['b','c']);
  assert.deepEqual(missingWorkingResolutionFolders([...companies,companies[2]],existing).map(x=>x.id),['b','c']);
  assert.deepEqual(missingWorkingResolutionFolders([],existing),[]);
});
test('New company RPC and optional SQL backfill are additive and idempotent',async()=>{
  const {readFileSync}=await import('node:fs');
  const sql=readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8');
  const backfill=readFileSync(new URL('../supabase/working_resolution_folder_backfill.sql',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(sql,/\('Working Resolution',\s*14\)/);
  assert.match(backfill,/not exists/i);
  assert.match(backfill,/on conflict do nothing/i);
  assert.doesNotMatch(backfill,/\b(delete|update|truncate)\s+(public\.)?(?:folders|documents)\b/i);
  assert.match(main,/ensureWorkingResolutionFolders/);
  assert.match(main,/ensure-working-resolution-folders/);
  assert.match(main,/15 standard folders per company/);
});
