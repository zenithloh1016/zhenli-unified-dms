-- Private source imported from user-supplied October 2026 Master Listing.
-- Rows containing company registration numbers and status values are seeded
-- directly into Supabase, NOT committed to the publicly accessible repo.
create table if not exists public.dms_master_listing_constitution_imports(
 user_id uuid primary key references auth.users(id) on delete cascade,
 source_version text not null,
 source_name text not null,
 statuses jsonb not null check(jsonb_typeof(statuses)='object'),
 updated_at timestamptz not null default now()
);
alter table public.dms_master_listing_constitution_imports enable row level security;
revoke all on public.dms_master_listing_constitution_imports from public,anon,authenticated;
grant select on public.dms_master_listing_constitution_imports to authenticated;
drop policy if exists "Owner reads own Constitution import" on public.dms_master_listing_constitution_imports;
create policy "Owner reads own Constitution import"
 on public.dms_master_listing_constitution_imports
 for select to authenticated using(user_id=(select auth.uid()));
