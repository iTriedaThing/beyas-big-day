\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
create function pg_temp.denied(statement text,message text) returns void language plpgsql as $$
begin begin execute statement;
exception when insufficient_privilege or check_violation or foreign_key_violation or raise_exception then
  raise notice 'PASS rejected: %',message;return;end;
raise exception 'FAIL accepted: %',message;end; $$;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.weddings(id,name) values('10000000-0000-0000-0000-000000000001','Test wedding'),('10000000-0000-0000-0000-000000000002','Other wedding');
insert into public.wedding_members values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','A'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','B'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','Other member');
insert into public.invitations(id,wedding_id,household_name) values('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other household');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare i jsonb;g jsonb;begin
 i:='{"id":"20000000-0000-0000-0000-000000000001","wedding_id":"10000000-0000-0000-0000-000000000001","household_name":"Test household","save_the_date_sent_on":"2026-11-13"}';
 g:='[{"id":"30000000-0000-0000-0000-000000000001","name":"Alex"},{"id":"30000000-0000-0000-0000-000000000002","name":"Sam"},{"id":"30000000-0000-0000-0000-000000000003","name":null,"is_companion":true}]';
 perform public.create_household(i,g);perform public.create_household(i,g);
 perform pg_temp.assert((select count(*)=1 from public.invitations),'household retry creates one household');
 perform pg_temp.assert((select count(*)=3 from public.guests),'three individual seats after retry');
 perform pg_temp.assert((select count(*)=1 from public.guests where name is null and is_companion),'unnamed companion preserved');
 i:=i||'{"id":"20000000-0000-0000-0000-000000000003","household_name":"Invalid household"}'::jsonb;
 g:='[{"id":"30000000-0000-0000-0000-000000000004","name":null,"is_companion":false}]';
 perform pg_temp.denied(format('select public.create_household(%L::jsonb,%L::jsonb)',i,g),'unnamed guest must be a companion');
 perform pg_temp.assert(not exists(select 1 from public.invitations where id=(i->>'id')::uuid),'invalid seat rolls back household too');
 perform pg_temp.denied(format('select public.create_household(%L::jsonb,%L::jsonb)',i,'[]'),'household must have a guest');
 perform pg_temp.denied(format('select public.create_household(%L::jsonb,%L::jsonb)',i,'[{"id":"30000000-0000-0000-0000-000000000009","name":"A"},{"id":"30000000-0000-0000-0000-000000000009","name":"A"}]'),'duplicate seat IDs rejected');
end;$$;
update public.guests set rsvp='yes',dietary_flags=array['vegan','nut_allergy'] where id='30000000-0000-0000-0000-000000000001' and version=1;
update public.guests set rsvp='yes' where id='30000000-0000-0000-0000-000000000002' and version=1;
select pg_temp.assert((select count(*) filter(where rsvp='yes')=2 and count(*) filter(where rsvp='pending')=1 and count(*)=3 from public.guests),'two yes, one pending, three seats');
select pg_temp.denied($s$insert into public.guests(wedding_id,invitation_id,name) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Cross wedding')$s$,'same-wedding household enforced');
select pg_temp.denied($s$update public.guests set dietary_flags=array['unsupported'] where id='30000000-0000-0000-0000-000000000001'$s$,'dietary flags validated');
select pg_temp.denied($s$update public.guests set rsvp='maybe' where id='30000000-0000-0000-0000-000000000001'$s$,'RSVP values validated');
insert into public.tasks(id,wedding_id,title,planning_window,assignee_id,starter_key) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Find the venue','12_plus','00000000-0000-0000-0000-000000000002','venue');
insert into public.tasks(wedding_id,title,planning_window,starter_key) values('10000000-0000-0000-0000-000000000001','Duplicate seed','12_plus','venue') on conflict(wedding_id,starter_key) do nothing;
select pg_temp.assert((select count(*)=1 from public.tasks),'concurrent starter imports deduplicate by wedding and key');
update public.tasks set completed=true where id='40000000-0000-0000-0000-000000000001' and version=1;
do $$declare affected int;begin
 update public.tasks set completed=false where id='40000000-0000-0000-0000-000000000001' and version=1;
 get diagnostics affected=row_count;perform pg_temp.assert(affected=0,'stale task change cannot overwrite completion');end;$$;
select pg_temp.denied($s$insert into public.tasks(wedding_id,title,planning_window,assignee_id) values('10000000-0000-0000-0000-000000000001','Wrong assignee','12_plus','00000000-0000-0000-0000-000000000003')$s$,'task assignee must belong to wedding');
select pg_temp.denied($s$update public.weddings set planning_headcount=-1 where id='10000000-0000-0000-0000-000000000001'$s$,'negative planning headcount denied');
select pg_temp.denied($s$delete from public.guests$s$,'guest removal is reversible archive only');
select pg_temp.denied($s$truncate public.tasks$s$,'task truncate not allowed');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select pg_temp.assert((public.budget_snapshot('10000000-0000-0000-0000-000000000001')->>'planner_ready')::boolean,'extended snapshot ready');
select pg_temp.assert(jsonb_array_length(public.budget_snapshot('10000000-0000-0000-0000-000000000001')->'guests')=3,'second partner sees all guests');
select pg_temp.assert((select completed from public.tasks where id='40000000-0000-0000-0000-000000000001'),'second partner sees task completion');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select pg_temp.assert((select count(*)=0 from public.invitations),'outsider sees no households');
select pg_temp.assert((select count(*)=0 from public.guests),'outsider sees no guests');
select pg_temp.assert((select count(*)=0 from public.tasks),'outsider sees no tasks');
select pg_temp.denied($s$insert into public.tasks(wedding_id,title,planning_window) values('10000000-0000-0000-0000-000000000001','Unauthorized','12_plus')$s$,'outsider cannot add tasks');
select pg_temp.denied($s$insert into public.invitations(wedding_id,household_name) values('10000000-0000-0000-0000-000000000001','Unauthorized')$s$,'outsider cannot add households');
select pg_temp.denied($s$insert into public.guests(wedding_id,invitation_id,name) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Unauthorized')$s$,'outsider cannot add guests');
do $$declare t text;n int;begin
 foreach t in array array['invitations','guests','tasks'] loop
   execute format('update public.%I set archived=true',t);get diagnostics n=row_count;
   perform pg_temp.assert(n=0,'outsider cannot edit '||t);
 end loop;
end;$$;
set local role anon;
select pg_temp.denied('select * from public.invitations','signed-out household reads denied');
select pg_temp.denied('select * from public.guests','signed-out guest reads denied');
select pg_temp.denied('select * from public.tasks','signed-out task reads denied');
select pg_temp.denied($s$select public.create_household('{}','[]')$s$,'signed-out household RPC denied');
reset role;
select 'All guest/checklist access assertions passed' as result;
rollback;
