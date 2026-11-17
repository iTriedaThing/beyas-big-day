\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
create function pg_temp.denied(statement text,message text) returns void language plpgsql as $$
begin begin execute statement;
exception when insufficient_privilege or check_violation or foreign_key_violation or unique_violation or raise_exception then
raise notice 'PASS rejected: %',message;return;end;
raise exception 'FAIL accepted: %',message;end; $$;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.weddings(id,name,planning_headcount) values('10000000-0000-0000-0000-000000000001','Menu test',80),('10000000-0000-0000-0000-000000000002','Other',90);
insert into public.weddings(id,name) values('10000000-0000-0000-0000-000000000003','Menu before expense');
insert into public.wedding_members values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Ben'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Maya'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','Outsider');
insert into public.wedding_members values('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Ben');
insert into public.vendors(id,wedding_id,name) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Chef'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other chef');
insert into public.categories(id,wedding_id,name) values('21000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Food');
insert into public.invitations(id,wedding_id,household_name) values('22000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Friends');
insert into public.guests(id,wedding_id,invitation_id,name,rsvp,is_companion) values
('23000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Alex','yes',false),
('23000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001',null,'yes',true),
('23000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Declined','no',false);
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.menu_courses(id,wedding_id,name) values('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','Desserts');
insert into public.menu_options(wedding_id,course_id,name,unit_cents) values('10000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','Cake',0);
select pg_temp.denied($q$update public.weddings set currency='EUR' where id='10000000-0000-0000-0000-000000000003'$q$,'currency locked by explicit zero price before any expense exists');
insert into public.expenses(id,wedding_id,category_id,title,target_cents) values('24000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Catering',500000);
insert into public.menu_courses(id,wedding_id,name,choices_offered) values
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Mains',true),
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Drinks',false);
insert into public.menu_options(id,wedding_id,course_id,name,selected,unit_cents,pricing_basis,vendor_id) values
('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Tart',true,2500,'per_choice','20000000-0000-0000-0000-000000000001'),
('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Fish',true,3000,'per_choice',null),
('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','Wine',true,1000,'per_person',null);
update public.weddings set menu_expense_id='24000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000001';
select pg_temp.assert(private.menu_estimate('10000000-0000-0000-0000-000000000001')->>'cents' is null,'choices pending means incomplete');
insert into public.guest_meals(id,wedding_id,guest_id,course_id,option_id) values
('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001'),
('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002');
select pg_temp.assert((private.menu_estimate('10000000-0000-0000-0000-000000000001')->>'cents')::bigint=85500,'alternative dishes counted by choices once');
update public.weddings set planning_headcount=90 where id='10000000-0000-0000-0000-000000000001';
select pg_temp.assert((private.menu_estimate('10000000-0000-0000-0000-000000000001')->>'cents')::bigint=95500,'headcount changes shared estimate');
select pg_temp.assert((public.budget_snapshot('10000000-0000-0000-0000-000000000001')->'expenses'->0->>'menu_estimate_cents')::bigint=95500,'snapshot enriches the same expense');
select pg_temp.assert((select count(*)=1 from public.expenses),'no duplicate catering bill');
select pg_temp.denied($q$update public.weddings set currency='EUR' where id='10000000-0000-0000-0000-000000000001'$q$,'currency with recorded menu prices');
savepoint price_boundaries;
update public.weddings set planning_headcount=null where id='10000000-0000-0000-0000-000000000001';
select pg_temp.assert(private.menu_estimate('10000000-0000-0000-0000-000000000001')->>'cents' is null,'unknown headcount stays unknown');
update public.weddings set planning_headcount=0 where id='10000000-0000-0000-0000-000000000001';
select pg_temp.assert((private.menu_estimate('10000000-0000-0000-0000-000000000001')->>'cents')::bigint=5500,'zero headcount is explicit');
update public.weddings set planning_headcount=100000 where id='10000000-0000-0000-0000-000000000001';
update public.menu_options set unit_cents=1000000000 where name='Wine';
select pg_temp.assert((private.menu_estimate('10000000-0000-0000-0000-000000000001')->>'overflow')::boolean,'overflow flagged, never rounded');
select pg_temp.assert(private.menu_estimate('10000000-0000-0000-0000-000000000001')->>'cents' is null,'overflow forecast is unknown');
rollback to price_boundaries;
select pg_temp.assert((public.budget_snapshot('10000000-0000-0000-0000-000000000001')->>'itinerary_ready')::boolean,'prior snapshot flags preserved');
select pg_temp.denied($q$update public.menu_options set vendor_id='20000000-0000-0000-0000-000000000002' where name='Tart'$q$,'cross-wedding vendor');
select pg_temp.denied($q$update public.guest_meals set course_id='30000000-0000-0000-0000-000000000002' where id='50000000-0000-0000-0000-000000000001'$q$,'choice ownership immutable');
select pg_temp.denied($q$update public.guest_meals set option_id='40000000-0000-0000-0000-000000000003' where id='50000000-0000-0000-0000-000000000001'$q$,'wrong-course dish');
select pg_temp.denied($q$insert into public.guest_meals(wedding_id,guest_id,course_id) values('10000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001')$q$,'declined guest');
select pg_temp.denied($q$insert into public.guest_meals(wedding_id,guest_id,course_id) values('10000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')$q$,'duplicate guest/course');
select pg_temp.denied($q$update public.menu_courses set choices_offered=false where name='Mains'$q$,'cannot disable choices with per-choice pricing');
update public.menu_options set selected=false where name='Tart';
select pg_temp.assert(private.menu_estimate('10000000-0000-0000-0000-000000000001')->>'cents' is null,'deselected choice requires review');
select pg_temp.denied($q$update public.guest_meals set option_id='40000000-0000-0000-0000-000000000001' where id='50000000-0000-0000-0000-000000000001'$q$,'unselected choice rejected');
update public.menu_options set selected=true where name='Tart';
update public.guests set rsvp='no' where name='Alex';
select pg_temp.assert((private.menu_estimate('10000000-0000-0000-0000-000000000001')->>'cents')::bigint=93000,'declined diner no longer counted');
update public.guests set rsvp='yes' where name='Alex';
update public.expenses set agreed_cents=100000 where title='Catering';
update public.menu_options set unit_cents=3500 where name='Fish';
select pg_temp.assert((select agreed_cents=100000 from public.expenses where title='Catering'),'menu editing cannot change agreement');
select pg_temp.assert((select count(*)=0 from public.contract_amendments),'no silent amendment');
update public.guest_meals set option_id=null where id='50000000-0000-0000-0000-000000000001';
select pg_temp.assert(private.menu_estimate('10000000-0000-0000-0000-000000000001')->>'cents' is null,'explicit pending is incomplete');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select pg_temp.assert((select count(*)=3 from public.menu_options),'second partner reads dishes');
update public.guest_meals set option_id='40000000-0000-0000-0000-000000000001' where id='50000000-0000-0000-0000-000000000001' and version=2;
do $$declare n integer;begin update public.guest_meals set option_id=null where id='50000000-0000-0000-0000-000000000001' and version=2;get diagnostics n=row_count;perform pg_temp.assert(n=0,'stale partner edit affects zero rows');end;$$;
insert into storage.objects(bucket_id,name) values('menu-photos','10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001/60000000-0000-0000-0000-000000000001.jpg');
select pg_temp.denied($q$insert into storage.objects(bucket_id,name) values('menu-photos','10000000-0000-0000-0000-000000000002/40000000-0000-0000-0000-000000000001/60000000-0000-0000-0000-000000000001.jpg')$q$,'cross-wedding photo');
select pg_temp.denied($q$update public.menu_options set unit_cents=-1 where name='Tart'$q$,'negative prices');
select pg_temp.denied($q$update public.menu_options set quantity=100001 where name='Tart'$q$,'quantity bound');
select pg_temp.denied($q$update public.menu_options set photo_path='https://example.invalid/photo.jpg' where name='Tart'$q$,'external photo URL rejected');
select public.delete_record('menu_options','40000000-0000-0000-0000-000000000001',(select version from public.menu_options where name='Tart'));
select pg_temp.assert((select count(*)=0 from storage.objects),'deleted dish hides photos');
select pg_temp.denied($q$update public.menu_options set selected=true where name='Tart'$q$,'deleted dish cannot revive');
select public.delete_record('vendors','20000000-0000-0000-0000-000000000001',(select version from public.vendors where name='Chef'));
select pg_temp.assert((select count(*)=2 from public.menu_options where not deleted),'vendor deletion preserves other menu dishes');
select public.delete_record('expenses','24000000-0000-0000-0000-000000000001',(select version from public.expenses where title='Catering'));
select pg_temp.assert((select menu_expense_id is null from public.weddings where id='10000000-0000-0000-0000-000000000001'),'expense deletion detaches menu');
select public.delete_record('menu_courses','30000000-0000-0000-0000-000000000001',(select version from public.menu_courses where name='Mains'));
select pg_temp.assert((select deleted from public.menu_options where name='Fish'),'course deletion removes its dishes');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.assert((select count(*)=0 from public.menu_options),'outsider dishes isolated');
select pg_temp.assert((select count(*)=0 from public.guest_meals),'outsider choices isolated');
select pg_temp.assert((select count(*)=0 from storage.objects),'outsider photos isolated');
select pg_temp.denied($q$insert into public.menu_courses(wedding_id,name) values('10000000-0000-0000-0000-000000000001','Intrusion')$q$,'outsider insertion');
select pg_temp.denied($q$update public.weddings set menu_expense_id='24000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000002'$q$,'cross-wedding catering expense');
set local role anon;
select pg_temp.denied('select * from public.menu_courses','anonymous courses');
select pg_temp.denied('select * from public.menu_options','anonymous dishes');
select pg_temp.denied('select * from public.guest_meals','anonymous choices');
select pg_temp.denied($q$select public.budget_snapshot('10000000-0000-0000-0000-000000000001')$q$,'anonymous snapshot');
rollback;
\echo Menu pricing, integrity, concurrency, storage and member/outsider checks passed.
