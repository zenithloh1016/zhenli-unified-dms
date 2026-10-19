-- ZHENLI DMS: optional idempotent addition of the "Working Resolution"
-- root folder for each existing company, across all owners.
-- Run through the Supabase SQL Editor if you need a one-time administrative
-- backfill; the DMS website/Android automatically backfills for each signed-in
-- user's own portfolio. Existing documents, folders, names, and paths unchanged.
begin;
insert into public.folders (user_id,company_id,parent_id,name,sort_order)
select c.user_id,c.id,null,'Working Resolution',14
from public.companies as c
where not exists (
  select 1 from public.folders as f
  where f.user_id=c.user_id and f.company_id=c.id and f.parent_id is null
    and lower(regexp_replace(btrim(f.name),'[[:space:]]+',' ','g')) = 'working resolution'
)
on conflict do nothing;
commit;

-- Validate by counting companies without the new root folder:
-- select count(*) from public.companies c
-- where not exists (select 1 from public.folders f
-- where f.company_id=c.id and f.user_id=c.user_id and f.parent_id is null
-- and lower(regexp_replace(btrim(f.name),'[[:space:]]+',' ','g'))='working resolution');
--
-- If your Supabase database was set up before this release, rerun only the
-- CREATE OR REPLACE FUNCTION public.create_company_with_folders block in
-- setup.sql to make the 14th root folder part of new-company transactions.
-- The DMS client also creates it after newly created companies are loaded.
