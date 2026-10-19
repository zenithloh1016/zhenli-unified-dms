import test from 'node:test';
import assert from 'node:assert/strict';
import {BO_FOLDER_NAME,BO_FOLDER_SORT_ORDER,STANDARD_FOLDER_COUNT,isExistingBeneficialOwnersFolder,missingBeneficialOwnerFolders} from '../src/beneficial-owners-folders.js';

const companies=[{id:'a',name:'A SDN BHD'},{id:'b',name:'B SDN BHD'},{id:'c',name:'C SDN BHD'}];
test('Beneficial Owners is the 12th standard root folder',()=>{
 assert.equal(BO_FOLDER_NAME,'Beneficial Owners');
 assert.equal(BO_FOLDER_SORT_ORDER,12);
 assert.equal(STANDARD_FOLDER_COUNT,12);
});
test('Backfill picks only companies lacking an existing root BO folder',()=>{
 const existing=[
  {company_id:'a',name:'Beneficial Owners',parent_id:null},
  {company_id:'b',name:'Register of Beneficial Owners (eBOS)',parent_id:null},
  {company_id:'c',name:'Beneficial Owners',parent_id:'nested-folder'}
 ];
 assert.deepEqual(missingBeneficialOwnerFolders(companies,existing).map(x=>x.id),['c']);
 assert.deepEqual(missingBeneficialOwnerFolders([...companies,companies[2]],existing).map(x=>x.id),['c']);
});
test('Does not treat unrelated folders or child folders as BO roots',()=>{
 assert.equal(isExistingBeneficialOwnersFolder({name:'Register of Beneficial Ownership',parent_id:null}),true);
 assert.equal(isExistingBeneficialOwnersFolder({name:'eBOS',parent_id:null}),true);
 assert.equal(isExistingBeneficialOwnersFolder({name:'Ordinary Members',parent_id:null}),false);
 assert.equal(isExistingBeneficialOwnersFolder({name:'Beneficial Owners',parent_id:'uuid'}),false);
});
test('Default SQL and optional migration contain idempotent BO creation',async()=>{
 const {readFileSync}=await import('node:fs');
 const sql=readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../supabase/beneficial_owners_folder_backfill.sql',import.meta.url),'utf8');
 assert.match(sql,/\('Beneficial Owners', 12\)/);
 assert.match(migration,/on conflict do nothing/i);
 assert.match(migration,/not exists/i);
});
