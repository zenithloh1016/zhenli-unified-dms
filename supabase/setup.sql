-- ZHENLI Document Management System: private per-user storage.
-- Run once in a NEW Supabase project's SQL Editor.
-- Every account owns an independent portfolio. Use the SAME login on web and Android.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 250),
  name_key text generated always as (lower(btrim(name))) stored,
  registration_no text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name_key)
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_id uuid not null,
  parent_id uuid,
  name text not null check (length(btrim(name)) between 1 and 250),
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  unique (id, user_id, company_id),
  foreign key (company_id, user_id) references public.companies (id, user_id) on delete cascade,
  foreign key (parent_id, user_id, company_id) references public.folders (id, user_id, company_id) on delete cascade
);
create unique index if not exists unique_company_root_folder
  on public.folders (user_id, company_id, lower(btrim(name))) where parent_id is null;
create unique index if not exists unique_company_nested_folder
  on public.folders (user_id, company_id, parent_id, lower(btrim(name))) where parent_id is not null;
create index if not exists folder_lookup on public.folders (user_id, company_id, parent_id);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_id uuid not null,
  folder_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 500),
  storage_path text not null unique,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  mime_type text,
  created_at timestamptz not null default now(),
  foreign key (folder_id, user_id, company_id) references public.folders (id, user_id, company_id) on delete cascade,
  check (split_part(storage_path, '/', 1) = user_id::text)
);
create index if not exists documents_lookup on public.documents (user_id, company_id, folder_id);

alter table public.companies enable row level security;
alter table public.folders enable row level security;
alter table public.documents enable row level security;

-- RLS on all tables: a session sees or changes only its own records.
create policy "Private companies" on public.companies
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Private folders" on public.folders
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Private documents" on public.documents
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.companies, public.folders, public.documents to authenticated;
revoke all on public.companies, public.folders, public.documents from anon;

-- Atomic, repeatable import of a company and exactly 14 standard root folders (including Working Resolution).
-- SECURITY INVOKER uses caller's RLS and needs no privileged secret.
create or replace function public.create_company_with_folders(p_name text, p_registration_no text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_name is null or length(btrim(p_name)) < 2 then raise exception 'Company name is required'; end if;
  if length(p_name) > 250 then raise exception 'Company name is too long'; end if;

  insert into public.companies (user_id, name, registration_no)
  values (v_uid, btrim(p_name), nullif(btrim(p_registration_no), ''))
  on conflict (user_id, name_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.companies
    where user_id = v_uid and name_key = lower(btrim(p_name));
  end if;
  if v_id is null then raise exception 'Could not locate company'; end if;

  insert into public.folders (user_id, company_id, parent_id, name, sort_order)
  select v_uid, v_id, null, labels.folder, labels.rank
  from (values
    ('Incorporation', 1),
    ('Board & Members'' Resolution', 2),
    ('Annual Return', 3),
    ('Financial Statements', 4),
    ('Directors, Members & Secretaries', 5),
    ('Allotment of Shares', 6),
    ('Transfer of Shares', 7),
    ('Registered Address', 8),
    ('Business Address & Nature', 9),
    ('Other Statutory Matters', 10),
    ('Correspondence', 11),
    ('Beneficial Owners', 12),
    ('Constitution', 13),
    ('Working Resolution', 14)
  ) as labels(folder,rank)
  on conflict do nothing;
  return v_id;
end;
$$;
grant execute on function public.create_company_with_folders(text,text) to authenticated;
revoke execute on function public.create_company_with_folders(text,text) from anon;

insert into storage.buckets(id, name, public, file_size_limit)
values ('dms-private', 'dms-private', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

create policy "Private owner storage select" on storage.objects
for select to authenticated
using (bucket_id = 'dms-private' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "Private owner storage insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'dms-private' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "Private owner storage update" on storage.objects
for update to authenticated
using (bucket_id = 'dms-private' and split_part(name, '/', 1) = (select auth.uid())::text)
with check (bucket_id = 'dms-private' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "Private owner storage delete" on storage.objects
for delete to authenticated
using (bucket_id = 'dms-private' and split_part(name, '/', 1) = (select auth.uid())::text);
