-- ZHENLI DMS native sequential signing (Tencent-independent).
-- Run once in the SAME existing Supabase project. Does not change old DMS tables.
-- All records and PDFs are accessible only to the service-role Edge Function.
create extension if not exists pgcrypto;

create table if not exists public.dms_native_sign_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  company text not null check (char_length(company) between 2 and 250),
  subject text not null check (char_length(subject) between 2 and 250),
  note text not null default '',
  signers jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  boxes jsonb not null default '[]'::jsonb,
  audit jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','pending','finalizing','completed','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dms_native_sign_owner_idx
  on public.dms_native_sign_requests(owner_id, created_at desc);
alter table public.dms_native_sign_requests enable row level security;
revoke all on public.dms_native_sign_requests from anon, authenticated;
grant all on public.dms_native_sign_requests to service_role;

-- A private, separate bucket; never add public policies to signing files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dms-native-signing','dms-native-signing',false, 6291456,
        array['application/pdf','image/png'])
on conflict (id) do nothing;

-- Atomic, ordered acceptance of one signer's signature. Called ONLY with service role,
-- after the Edge Function has verified the cryptographic bearer token and uploaded
-- the private PNG. A row lock prevents concurrent signers from skipping the sequence.
create or replace function public.dms_native_accept_signature(
  p_request_id uuid, p_signer_id text, p_signature_path text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.dms_native_sign_requests%rowtype;
  next_signer text;
  remaining integer;
  signers_new jsonb;
  next_status text;
begin
  select * into r from public.dms_native_sign_requests
    where id = p_request_id for update;
  if not found or r.status <> 'pending' or r.expires_at <= now() then
    raise exception 'Signing request is unavailable or expired';
  end if;
  select s.value->>'id' into next_signer
    from jsonb_array_elements(r.signers) with ordinality as s(value, ord)
    where s.value->>'signedAt' is null
    order by s.ord limit 1;
  if next_signer is null or next_signer <> p_signer_id then
    raise exception 'It is not this signers turn to sign';
  end if;
  select jsonb_agg(
    case when s.value->>'id' = p_signer_id then
      jsonb_set(jsonb_set(s.value, '{signedAt}', to_jsonb(now()::text)),
        '{signaturePath}', to_jsonb(p_signature_path))
    else s.value end order by s.ord
  ) into signers_new
  from jsonb_array_elements(r.signers) with ordinality as s(value, ord);
  select count(*) into remaining from jsonb_array_elements(signers_new) s
    where s->>'signedAt' is null;
  next_status := case when remaining = 0 then 'finalizing' else 'pending' end;
  update public.dms_native_sign_requests set
    signers = signers_new,
    status = next_status,
    updated_at = now(),
    audit = audit || jsonb_build_array(jsonb_build_object(
      'event','signed','signerId',p_signer_id,'at',now()::text))
  where id = p_request_id;
  return next_status;
end;
$$;
revoke all on function public.dms_native_accept_signature(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.dms_native_accept_signature(uuid,text,text)
  to service_role;
