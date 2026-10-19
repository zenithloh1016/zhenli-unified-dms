import test from 'node:test';
import assert from 'node:assert/strict';
import {
 CONSTITUTION_FOLDER_NAME,CONSTITUTION_FOLDER_SORT_ORDER,STANDARD_FOLDER_COUNT,
 isExistingConstitutionFolder,missingConstitutionFolders
} from '../src/constitution-folders.js';

const companies=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
test('Constitution is the 13th standard root folder',()=>{
 assert.equal(CONSTITUTION_FOLDER_NAME,'Constitution');
 assert.equal(CONSTITUTION_FOLDER_SORT_ORDER,13);
 assert.equal(STANDARD_FOLDER_COUNT,13);
});
test('Backfill only picks companies missing a root-level Constitution folder, without duplicates',()=>{
 const existing=[
  {company_id:'a',name:'Constitution',parent_id:null},
  {company_id:'b',name:'Company Constitution',parent_id:null},
  {company_id:'c',name:'Constitution',parent_id:'nested-uuid'},
  {company_id:'d',name:'Memorandum and Articles of Association',parent_id:null}
 ];
 assert.deepEqual(missingConstitutionFolders(companies,existing).map(x=>x.id),['c']);
 assert.deepEqual(missingConstitutionFolders([...companies,companies[2]],existing).map(x=>x.id),['c']);
});
test('Do not confuse unrelated documents or nested folders with root Constitution',()=>{
 assert.equal(isExistingConstitutionFolder({name:'Constitution',parent_id:null}),true);
 assert.equal(isExistingConstitutionFolder({name:'Register of Constitution',parent_id:null}),true);
 assert.equal(isExistingConstitutionFolder({name:'Memorandum & Articles of Association',parent_id:null}),true);
 assert.equal(isExistingConstitutionFolder({name:'Board & Members Resolution',parent_id:null}),false);
 assert.equal(isExistingConstitutionFolder({name:'Constitution',parent_id:'nested'}),false);
});
test('Default SQL includes Constitution folder 13 and optional migration is safe',async()=>{
 const {readFileSync}=await import('node:fs');
 const setup=readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8');
 const backfill=readFileSync(new URL('../supabase/constitution_folder_backfill.sql',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(setup,/\('Constitution',\s*13\)/);
 assert.match(backfill,/not exists/i);
 assert.match(backfill,/on conflict do nothing/i);
 assert.doesNotMatch(backfill,/\b(delete|update|truncate)\s+(public\.)?folders\b/i);
 assert.match(main,/ensureConstitutionFolders/);
 assert.match(main,/ensure-constitution-folders/);
});
