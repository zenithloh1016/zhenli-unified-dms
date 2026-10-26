-- Safe individual deletion from the active UNICOSEC signing request list.
-- Service-role only; retain PDFs, signatures and audit history.
-- Outstanding signing links become invalid because deleted_at is set.
create or replace function public.dms_native_hide_sign_request(
 p_owner_id uuid,
 p_request_id uuid
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
 v_record public.dms_native_sign_requests%rowtype;
begin
 if p_owner_id is null or p_request_id is null then
  raise exception 'Missing signing request identity';
 end if;
 select * into v_record
 from public.dms_native_sign_requests
 where owner_id=p_owner_id and id=p_request_id and deleted_at is null
 for update;
 if not found then
  raise exception 'Signing request not found in your active list';
 end if;
 if v_record.status='finalizing' then
  raise exception 'Complete PDF finalization before deleting this signing request';
 end if;
 update public.dms_native_sign_requests
 set deleted_at=now(),
     status=case when status in ('draft','pending') then 'revoked' else status end,
     updated_at=now(),
     audit=audit || jsonb_build_array(jsonb_build_object(
       'event','removed_from_signing_list',
       'scope','single',
       'at',now()::text,
       'previousStatus',status
     ))
 where id=p_request_id and owner_id=p_owner_id and deleted_at is null;
 if not found then
  raise exception 'Signing request changed during deletion; retry';
 end if;
 return true;
end;
$$;
revoke all on function public.dms_native_hide_sign_request(uuid,uuid)
 from public, anon, authenticated;
grant execute on function public.dms_native_hide_sign_request(uuid,uuid)
 to service_role;
