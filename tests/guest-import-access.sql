\set ON_ERROR_STOP on
-- Disposable local database only. Run after the guest CSV import migration.
begin;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.weddings(id,name) values('10000000-0000-0000-0000-000000000001','First wedding'),('10000000-0000-0000-0000-000000000002','Second wedding');
insert into public.wedding_members values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Member one'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Member two');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
create function pg_temp.reject(w uuid,req uuid,batch jsonb,reason text) returns void language plpgsql as $$
begin
  begin perform public.import_guest_csv(w,req,batch);
  exception when others then
    if position(reason in sqlerrm)>0 then return; end if;
    raise;
  end;
  raise exception 'Unexpectedly accepted import';
end $$;
do $$
declare
  w uuid:='10000000-0000-0000-0000-000000000001'; other_w uuid:='10000000-0000-0000-0000-000000000002';
  req uuid:=gen_random_uuid();
  h jsonb:='{"line":2,"household":"Lee","email":"lee@example.com","people":[{"line":2,"name":"Ari","companion":false,"rsvp":"yes"},{"line":3,"name":"","companion":true,"rsvp":"pending"}]}';
  batch jsonb:=jsonb_build_array(h); snapshot jsonb;
begin
  perform pg_temp.reject(other_w,req,batch,'Wedding unavailable');
  if has_function_privilege('anon','public.import_guest_csv(uuid,uuid,jsonb)','execute') then raise exception 'Unexpected anonymous write access'; end if;
  perform pg_temp.reject(w,req,jsonb_build_array(h,h||'{"household":"B","people":[{"line":9,"name":"Jo","companion":false,"rsvp":"invalid"}]}'::jsonb),'Line 9 · rsvp');
  if exists(select from public.invitations) or exists(select from public.guests) or exists(select from private.guest_import_receipts) then raise exception 'Partial batch survived'; end if;
  perform pg_temp.reject(w,req,jsonb_build_array(h||'{"wedding_id":"unexpected"}'::jsonb),'only template fields');
  perform public.import_guest_csv(w,req,batch);
  perform public.import_guest_csv(w,req,batch);
  perform pg_temp.reject(w,req,jsonb_build_array(h||'{"household":"Other"}'::jsonb),'request changed');
  perform pg_temp.reject(w,gen_random_uuid(),jsonb_build_array(h||'{"household":" lee "}'::jsonb),'already in this wedding');
  snapshot:=public.budget_snapshot(w);
  if snapshot->>'guest_import_ready' is distinct from 'true' or jsonb_array_length(snapshot->'guests')<>2
     or jsonb_array_length(snapshot->'invitations')<>1 or (select count(*) from private.guest_import_receipts)<>1 then raise exception 'Import counts or snapshot incorrect'; end if;
  if not exists(select from public.guests where name is null and is_companion and rsvp='pending') then raise exception 'Companion missing'; end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin
  if exists(select from public.guests) or exists(select from public.invitations) or exists(select from private.guest_import_receipts) then raise exception 'Other wedding can see import'; end if;
end $$;
rollback;
