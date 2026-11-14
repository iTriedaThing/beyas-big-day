\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
create function pg_temp.denied(statement text,message text) returns void language plpgsql as $$
begin begin execute statement;
exception when insufficient_privilege or check_violation or foreign_key_violation or not_null_violation or raise_exception then
raise notice 'PASS rejected: %',message;return;end;
raise exception 'FAIL accepted: %',message;end; $$;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.weddings(id,name,wedding_date) values('10000000-0000-0000-0000-000000000001','Itinerary test','2027-06-19'),('10000000-0000-0000-0000-000000000002','Other wedding',null);
insert into public.wedding_members values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Ben'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Maya'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','Outsider');
insert into public.vendors(id,wedding_id,name) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Our venue'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other venue');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.itinerary_items(id,wedding_id,title,track,start_time,location) values
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Ben gets ready','Ben','09:00','Garden room'),
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Maya gets ready','Maya','09:00','Bridal suite'),
('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Ceremony','Together','11:00','Garden');
update public.itinerary_items set vendor_id='20000000-0000-0000-0000-000000000001',end_time='11:30' where title='Ceremony';
select pg_temp.assert((select count(*)=2 from public.itinerary_items where start_time='09:00'),'parallel preparations allowed');
select pg_temp.assert((public.budget_snapshot('10000000-0000-0000-0000-000000000001')->>'itinerary_ready')::boolean,'snapshot enables itinerary');
select pg_temp.assert((public.budget_snapshot('10000000-0000-0000-0000-000000000001')->>'feedback_ready')::boolean,'existing feedback flag preserved');
select pg_temp.assert(jsonb_array_length(public.budget_snapshot('10000000-0000-0000-0000-000000000001')->'itinerary_items')=3,'combined snapshot has ceremony once');
select pg_temp.assert((select count(*)=0 from public.expenses),'itinerary never creates financial records');
select pg_temp.denied($q$update public.itinerary_items set start_time=null where title='Ceremony'$q$,'required start time');
select pg_temp.denied($q$update public.itinerary_items set start_time='24:00' where title='Ceremony'$q$,'midnight uses 00:00 and day offset');
select pg_temp.denied($q$update public.itinerary_items set start_time='11:00:01' where title='Ceremony'$q$,'minute precision enforced');
select pg_temp.denied($q$update public.itinerary_items set end_time=start_time where title='Ceremony'$q$,'zero duration denied');
select pg_temp.denied($q$update public.itinerary_items set day_offset=2 where title='Ceremony'$q$,'invalid start day denied');
select pg_temp.denied($q$update public.itinerary_items set track=' ' where title='Ceremony'$q$,'blank track denied');
select pg_temp.denied($q$update public.itinerary_items set vendor_id='20000000-0000-0000-0000-000000000002' where title='Ceremony'$q$,'cross-wedding vendor denied');
select pg_temp.denied($q$update public.itinerary_items set wedding_id='10000000-0000-0000-0000-000000000002' where title='Ceremony'$q$,'ownership cannot move');
insert into public.itinerary_items(wedding_id,title,track,start_time,end_time,day_offset) values
('10000000-0000-0000-0000-000000000001','Reception','Together','23:00','01:00',0),
('10000000-0000-0000-0000-000000000001','Late snack','Together','01:15',null,1);
update public.weddings set wedding_date='2027-08-20' where id='10000000-0000-0000-0000-000000000001';
select pg_temp.assert((select start_time='09:00' and version=1 from public.itinerary_items where title='Ben gets ready'),'wedding date change preserves local activity times and versions');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select pg_temp.assert((select count(*)=5 from public.itinerary_items),'second partner reads all activities');
update public.itinerary_items set location='New garden room' where id='30000000-0000-0000-0000-000000000001' and version=1;
do $$declare n integer;begin
update public.itinerary_items set location='Stale location' where id='30000000-0000-0000-0000-000000000001' and version=1;
get diagnostics n=row_count;perform pg_temp.assert(n=0,'stale edit cannot overwrite');end;$$;
select pg_temp.assert((select count(*)=1 from public.record_history where table_name='itinerary_items' and record_id='30000000-0000-0000-0000-000000000001'),'edit audited');
select public.delete_record('vendors','20000000-0000-0000-0000-000000000001',1);
select pg_temp.assert((select vendor_id is null and not deleted from public.itinerary_items where title='Ceremony'),'deleting vendor detaches it without removing itinerary');
select pg_temp.denied($q$update public.itinerary_items set vendor_id='20000000-0000-0000-0000-000000000001' where title='Ceremony'$q$,'deleted vendor cannot be linked');
select pg_temp.denied($q$select public.delete_record('itinerary_items','30000000-0000-0000-0000-000000000001',1)$q$,'stale deletion rejected');
select public.delete_record('itinerary_items','30000000-0000-0000-0000-000000000001',2);
select public.delete_record('itinerary_items','30000000-0000-0000-0000-000000000001',2);
select pg_temp.assert(jsonb_array_length(public.budget_snapshot('10000000-0000-0000-0000-000000000001')->'itinerary_items')=4,'deleted activity excluded; retry does not duplicate');
select pg_temp.denied($q$update public.itinerary_items set deleted=false where id='30000000-0000-0000-0000-000000000001'$q$,'tombstone cannot be revived');
select pg_temp.denied('delete from public.itinerary_items','physical delete forbidden');
select pg_temp.denied('truncate public.itinerary_items','truncate forbidden');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.assert((select count(*)=0 from public.itinerary_items),'outsider sees no activities');
select pg_temp.assert(jsonb_array_length(public.budget_snapshot('10000000-0000-0000-0000-000000000001')->'itinerary_items')=0,'outsider snapshot has no activities');
select pg_temp.denied($q$insert into public.itinerary_items(wedding_id,title,track,start_time) values('10000000-0000-0000-0000-000000000001','Intrusion','Together','09:00')$q$,'outsider cannot insert');
select pg_temp.denied($q$select public.delete_record('itinerary_items','30000000-0000-0000-0000-000000000002',1)$q$,'outsider cannot delete');
set local role anon;
select pg_temp.denied('select * from public.itinerary_items','signed-out table denied');
select pg_temp.denied($q$select public.budget_snapshot('10000000-0000-0000-0000-000000000001')$q$,'signed-out snapshot denied');
select pg_temp.denied($q$select private.feedback_snapshot('10000000-0000-0000-0000-000000000001')$q$,'non-exposed helper denied');
reset role;
select 'All itinerary/access SQL assertions passed' as result;
rollback;
