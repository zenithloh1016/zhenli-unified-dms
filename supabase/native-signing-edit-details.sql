-- Non-destructive extension for existing Supabase-native signing requests.
-- Store the requested default sender identity as metadata on every signing
-- request; it does not enable Gmail delivery without separate authentication.
alter table public.dms_native_sign_requests
  add column if not exists sender_email text not null default 'zhenlisecretary@gmail.com';
alter table public.dms_native_sign_requests
  alter column sender_email set default 'zhenlisecretary@gmail.com';
update public.dms_native_sign_requests
set sender_email='zhenlisecretary@gmail.com'
where sender_email is null or btrim(sender_email)='';
