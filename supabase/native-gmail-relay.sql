-- Private settings: accessible exclusively to the Supabase service role.
create table if not exists public.dms_native_mail_relays (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  script_url text not null,
  relay_hmac_secret text not null check (relay_hmac_secret ~ '^[0-9a-f]{64}$'),
  sender_email text not null default 'zhenlisecretary@gmail.com'
    check (sender_email = 'zhenlisecretary@gmail.com'),
  enabled boolean not null default true,
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dms_native_mail_relays enable row level security;
revoke all on public.dms_native_mail_relays from public, anon, authenticated;
grant select, insert, update, delete on public.dms_native_mail_relays to service_role;
