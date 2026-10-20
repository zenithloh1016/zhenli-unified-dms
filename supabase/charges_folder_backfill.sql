-- Optional one-time, idempotent backfill of the new Charges root folder
-- for every existing DMS company (all users). The authenticated DMS web/app
-- also creates missing Charges folders on sign-in/refresh.
-- No existing company data, folders, signing requests or documents are modified.
begin;
insert into public.folders (user_id,company_id,parent_id,name,sort_order)
select c.user_id,c.id,null,'Charges',15
from public.companies as c
where not exists (
  select 1 from public.folders as f
  where f.user_id=c.user_id and f.company_id=c.id and f.parent_id is null
    and lower(regexp_replace(btrim(f.name),'[[:space:]]+',' ','g'))='charges'
)
on conflict do nothing;
commit;

-- Optional verification after running:
-- select count(*) as missing_charges_folders from public.companies c
-- where not exists (
--   select 1 from public.folders f where f.user_id=c.user_id
--   and f.company_id=c.id and f.parent_id is null
--   and lower(regexp_replace(btrim(f.name),'[[:space:]]+',' ','g'))='charges'
-- );
--
-- For the database-side company creation function, update only the
-- CREATE OR REPLACE FUNCTION public.create_company_with_folders block in
-- supabase/setup.sql. The DMS client can fill missing folders for new
-- companies if an existing Supabase function still makes 14 categories.
