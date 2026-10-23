-- Soft-delete signing requests from the DMS active list, retaining signed
-- PDF evidence, original documents and audit trails for company records.
-- Run under the service-role Edge Function ONLY; never expose direct API access.
alter table public.dms_native_sign_requests
  add column if not exists deleted_at timestamptz;

create index if not exists dms_native_sign_active_owner_idx
  on public.dms_native_sign_requests(owner_id, created_at desc)
  where deleted_at is null;

create or replace function public.dms_native_hide_all_sign_requests(
  p_owner_id uuid, p_expected_count integer
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_count integer;
  v_hidden integer;
begin
  if p_owner_id is null or p_expected_count is null
     or p_expected_count < 1 or p_expected_count > 100000 then
    raise exception 'Invalid deletion confirmation';
  end if;

  -- Lock exactly the original active set before checking count, so concurrent
  -- signer updates cannot race with invalidation of their bearer links.
  select array_agg(id) into v_ids
    from (select id from public.dms_native_sign_requests
          where owner_id = p_owner_id and deleted_at is null
          order by id for update) locked;
  v_count := coalesce(array_length(v_ids,1),0);
  if v_count <> p_expected_count then
    raise exception 'Signing request count changed; reload before deleting';
  end if;
  if exists (
    select 1 from public.dms_native_sign_requests
    where id = any(v_ids) and status = 'finalizing'
  ) then
    raise exception 'One or more requests are finalizing PDFs. Complete finalization first';
  end if;

  update public.dms_native_sign_requests
     set deleted_at = now(),
         status = case when status in ('draft','pending')
                       then 'revoked' else status end,
         updated_at = now(),
         audit = audit || jsonb_build_array(
           jsonb_build_object(
             'event','removed_from_signing_list',
             'at',now()::text,
             'previousStatus',status
           )
         )
   where id = any(v_ids) and owner_id = p_owner_id and deleted_at is null;
  get diagnostics v_hidden = row_count;
  if v_hidden <> v_count then
    raise exception 'Signing request archive could not be completed';
  end if;
  return v_hidden;
end;
$$;

revoke all on function public.dms_native_hide_all_sign_requests(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.dms_native_hide_all_sign_requests(uuid,integer)
  to service_role;
