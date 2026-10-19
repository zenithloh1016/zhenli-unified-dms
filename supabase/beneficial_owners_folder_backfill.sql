-- Optional one-time Supabase SQL Editor backfill for pre-existing company folders.
-- The DMS website/Android also performs this safely for each signed-in user,
-- so running this is not required for the normal web/app update.
-- Do NOT delete, rename or move any existing folder or uploaded document.
begin;
insert into public.folders (user_id,company_id,parent_id,name,sort_order)
select c.user_id,c.id,null,'Beneficial Owners',12
from public.companies as c
where not exists (
  select 1 from public.folders as f
  where f.user_id=c.user_id and f.company_id=c.id and f.parent_id is null
  and (
    lower(btrim(f.name)) like '%beneficial owner%'
    or lower(btrim(f.name)) like '%beneficial ownership%'
    or lower(btrim(f.name)) like '%ebos%'
  )
)
on conflict do nothing;
commit;
-- Verify in Table Editor → folders (filter parent_id IS NULL and name Beneficial Owners).
-- Future company creation is supported by the DMS authenticated folder sync.
-- On freshly deployed installations, supabase/setup.sql includes this as folder 12.
