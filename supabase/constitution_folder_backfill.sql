-- Optional, idempotent backfill in existing Supabase installations.
-- DMS automatically performs this per signed-in user as well;
-- running this SQL manually is NOT required for ordinary app updates.
-- This migration creates only missing root-level Constitution folders.
-- It never modifies, renames, removes, or moves existing files/folders.
begin;
insert into public.folders (user_id, company_id, parent_id, name, sort_order)
select c.user_id, c.id, null, 'Constitution', 13
from public.companies as c
where not exists (
  select 1 from public.folders as f
  where f.user_id = c.user_id
    and f.company_id = c.id
    and f.parent_id is null
    and (
      lower(btrim(f.name)) like '%constitution%'
      or lower(btrim(f.name)) like '%memorandum%'
      or lower(btrim(f.name)) like '%articles of association%'
    )
)
on conflict do nothing;
commit;

-- Verification: Supabase Table Editor → folders → filter parent_id IS NULL,
-- then locate "Constitution" for each company that did not already have one.
-- For new companies, update the create_company_with_folders function by re-running
-- the function block in setup.sql if your project was set up before this change.
