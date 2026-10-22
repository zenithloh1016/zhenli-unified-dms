import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARGES_FOLDER_NAME,
  CHARGES_FOLDER_SORT_ORDER,
  STANDARD_FOLDER_COUNT,
  isExistingChargesFolder,
  missingChargesFolders
} from '../src/charges-folders.js';

test('Charges is the 15th standard company-root folder',()=>{
  assert.equal(CHARGES_FOLDER_NAME,'Charges');
  assert.equal(CHARGES_FOLDER_SORT_ORDER,15);
  assert.equal(STANDARD_FOLDER_COUNT,15);
});

test('An existing Charges root is reused; nested or unrelated charge folders do not count',()=>{
  assert.equal(isExistingChargesFolder({name:'Charges',parent_id:null}),true);
  assert.equal(isExistingChargesFolder({name:' CHARGES ',parent_id:null}),true);
  assert.equal(isExistingChargesFolder({name:'charges',parent_id:'parent'}),false);
  assert.equal(isExistingChargesFolder({name:'Register of Charges',parent_id:null}),false);
  assert.equal(isExistingChargesFolder({name:'Discharge of Charges',parent_id:null}),false);
  assert.equal(isExistingChargesFolder({name:'Charges & Satisfaction',parent_id:null}),false);
});

test('Missing Charges folders are identified exactly once per company',()=>{
  const companies=[{id:'a'},{id:'b'},{id:'c'},{id:'d'},{id:'d'}];
  const existing=[
    {company_id:'a',name:'CHARGES',parent_id:null},
    {company_id:'b',name:'Register of Charges',parent_id:null},
    {company_id:'c',name:'Charges',parent_id:'nested'},
    {company_id:'d',name:' charges ',parent_id:null}
  ];
  assert.deepEqual(missingChargesFolders(companies,existing).map(c=>c.id),['b','c']);
  assert.deepEqual(missingChargesFolders([],existing),[]);
});

test('Charges added safely for existing and new companies via DMS and optional Supabase SQL',async()=>{
  const {readFileSync}=await import('node:fs');
  const sql=readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8');
  const backfill=readFileSync(new URL('../supabase/charges_folder_backfill.sql',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(sql,/\('Charges',\s*15\)/);
  assert.match(backfill,/not exists/i);
  assert.match(backfill,/on conflict do nothing/i);
  assert.doesNotMatch(backfill,/\b(delete|update|truncate)\s+(public\.)?(?:folders|documents)\b/i);
  assert.match(main,/ensureChargesFolders/);
  assert.match(main,/ensure-charges-folders/);
  assert.match(main,/STANDARD_FOLDER_COUNT/);
  assert.match(main,/including Beneficial Owners, Constitution, Working Resolution and Charges/);
});
