-- UNICOSEC Annual Return cloud drafts.
-- Applied to ZHENLI Unified DMS via the authenticated Supabase project.
-- Existing local Annual Return drafts are uploaded on first company open.
create table if not exists public.annual_return_drafts (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 company_id uuid not null,
 payload jsonb not null check (jsonb_typeof(payload)='object' and pg_column_size(payload)<=3500000),
 revision bigint not null default 1 check (revision>=1),
 updated_at timestamptz not null default now(),
 primary key (user_id, company_id),
 constraint annual_return_drafts_company_owner_fkey
  foreign key (company_id,user_id) references public.companies(id,user_id) on delete cascade
);
alter table public.annual_return_drafts enable row level security;
revoke all on public.annual_return_drafts from anon, public;
grant select, insert, update, delete on public.annual_return_drafts to authenticated;
create policy "Annual Return drafts: owner select" on public.annual_return_drafts
 for select to authenticated using ((select auth.uid())=user_id);
create policy "Annual Return drafts: owner insert" on public.annual_return_drafts
 for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Annual Return drafts: owner update" on public.annual_return_drafts
 for update to authenticated using ((select auth.uid())=user_id)
 with check ((select auth.uid())=user_id);
create policy "Annual Return drafts: owner delete" on public.annual_return_drafts
 for delete to authenticated using ((select auth.uid())=user_id);
