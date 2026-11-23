\set ON_ERROR_STOP on
-- Run in a disposable database after the menu migration, before the seating migration.
-- The migration and the synthetic wedding both roll back, so the test is repeatable.
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.weddings(id,name) values ('10000000-0000-0000-0000-000000000001','Seating test');
insert into public.wedding_members values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Partner');
insert into public.invitations(id,wedding_id,household_name) select '20000000-0000-0000-0000-000000000001',id,'Family' from public.weddings;
insert into public.guests(wedding_id,invitation_id,id,name,rsvp,is_companion,meal_table)
select i.wedding_id,i.id,g.id::uuid,g.name,g.rsvp,g.name is null,g.label from public.invitations i cross join (values
 ('30000000-0000-0000-0000-000000000001','Robin','yes','Head table'),
 ('30000000-0000-0000-0000-000000000002',null,'pending','Head table'),
 ('30000000-0000-0000-0000-000000000003','Declined','no','Old table')) g(id,name,rsvp,label);

\ir ../supabase/migrations/20261123234251_visual_seating.sql

create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',label; end if; end $$;
create function pg_temp.change(plan text, v int, c jsonb) returns void language sql as $$
  select public.change_seating('10000000-0000-0000-0000-000000000001',plan,v,gen_random_uuid(),c);
$$;
create function pg_temp.reject(plan text,v int,c jsonb,reason text) returns void language plpgsql as $$
begin
  begin perform pg_temp.change(plan,v,c);
  exception when others then
    if position(reason in sqlerrm)>0 then return; end if;
    raise;
  end;
  raise exception 'Expected error containing %',reason;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$
declare
  w uuid := '10000000-0000-0000-0000-000000000001';
  h uuid := '20000000-0000-0000-0000-000000000001';
  robin uuid := '30000000-0000-0000-0000-000000000001';
  companion uuid := '30000000-0000-0000-0000-000000000002';
  front uuid; head uuid; small_table uuid; req uuid := gen_random_uuid();
  command jsonb := '{"action":"add","quantity":2,"capacity":1,"shape":"square"}';
  move jsonb := jsonb_build_object('action','assign','household_id',h);
  snapshot jsonb;
begin
  select id into strict head from public.seating_units;
  perform pg_temp.assert((select capacity=2 and label='Head table' from public.seating_units),'legacy capacity and label');
  perform pg_temp.assert((select count(*)=2 from public.seating_placements),'legacy guest and companion placements');
  perform public.change_seating(w,'reception',0,req,command);
  perform public.change_seating(w,'reception',0,req,command);
  perform pg_temp.assert((select count(*)=3 from public.seating_units),'retry does not duplicate batch');
  select id into small_table from public.seating_units where label='Table 2';
  perform pg_temp.reject('reception',1,move||jsonb_build_object('unit_id',small_table),'more open seats');
  perform pg_temp.assert((select count(*)=2 from public.seating_placements where unit_id=head),'failed move retains household');
  perform pg_temp.reject('reception',1,move||jsonb_build_object('guest_id',robin,'unit_id',small_table),'Split household');
  perform pg_temp.change('ceremony',0,'{"action":"add","quantity":2,"capacity":9,"shape":"row","reserved":true}');
  select id into front from public.seating_units where event='ceremony' and position=1;
  perform pg_temp.change('ceremony',1,move||jsonb_build_object('unit_id',front,'seat',3,'number_guest_id',robin));
  perform pg_temp.assert((select seat=3 from public.seating_placements where unit_id=front and guest_id=robin),'chair assigns household and numbers one guest');
  perform pg_temp.reject('reception',1,move||jsonb_build_object('unit_id',small_table,'guest_id',robin,'split',true,'seat',2,'number_guest_id',robin),'available seat');
  perform pg_temp.assert((select count(*)=2 from public.seating_placements where unit_id=head),'invalid chair rolls back entire move');
  perform pg_temp.change('reception',1,jsonb_build_object('action','number','unit_id',head,'guest_id',robin,'seat',2));
  perform pg_temp.reject('reception',2,jsonb_build_object('action','number','unit_id',head,'guest_id',companion,'seat',2),'available seat');
  perform pg_temp.reject('reception',2,jsonb_build_object('action','edit','unit_id',head,'capacity',1),'reducing capacity');
  perform pg_temp.change('reception',2,move||jsonb_build_object('guest_id',companion,'split',true,'unit_id',small_table));
  perform pg_temp.reject('reception',2,move||jsonb_build_object('guest_id',robin,'split',true,'unit_id',small_table),'plan changed');
  perform pg_temp.assert((select count(*)=2 from public.seating_placements where unit_id=front),'ceremony independent');
  perform pg_temp.change('reception',3,jsonb_build_object('action','edit','unit_id',head,'label','Family table','position',2,'shape','rectangle','capacity',9));
  snapshot := public.budget_snapshot(w);
  perform pg_temp.assert((select g->>'meal_table'='Family table' from jsonb_array_elements(snapshot->'guests') g where g->>'id'=robin::text),'guest list and menu follow rename');
  perform pg_temp.assert((select position=1 from public.seating_units where id=small_table),'layout reordered');
  perform pg_temp.change('reception',4,jsonb_build_object('action','delete','unit_id',small_table));
  perform pg_temp.assert(not exists(select from public.seating_placements where event='reception' and guest_id=companion),'remove table releases guest');
  perform pg_temp.assert(exists(select from public.guests where id=companion and not deleted),'guest retained');
  update public.guests set rsvp='no' where id=robin;
  perform pg_temp.assert(not exists(select from public.seating_placements where guest_id=robin),'decline releases both events');
  update public.guests set rsvp='yes' where id=robin;
  perform pg_temp.assert(not exists(select from public.seating_placements where guest_id=robin),'returning guest stays unassigned');
  perform pg_temp.change('reception',6,move||jsonb_build_object('unit_id',head));
  perform pg_temp.change('reception',7,move);
  perform pg_temp.assert(not exists(select from public.seating_placements where event='reception'),'whole household unassigned');
  update public.invitations set archived=true where id=h;
  perform pg_temp.assert(not exists(select from public.seating_placements),'archiving household releases remaining placements');
  insert into public.invitations(id,wedding_id,household_name) values ('20000000-0000-0000-0000-000000000002',w,'Second household');
  update public.guests set invitation_id='20000000-0000-0000-0000-000000000002' where id=robin;
  perform pg_temp.change('reception',8,jsonb_build_object('action','assign','household_id','20000000-0000-0000-0000-000000000002','unit_id',head));
  update public.guests set invitation_id=h where id=robin;
  perform pg_temp.assert(not exists(select from public.seating_placements where guest_id=robin),'moving to archived household releases placement');
  perform pg_temp.assert(not has_table_privilege('authenticated','public.seating_placements','insert'),'commands required for writes');
  perform pg_temp.assert(not has_function_privilege('anon','public.change_seating(uuid,text,bigint,uuid,jsonb)','execute'),'signed-out writes denied');
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select pg_temp.assert(not exists(select from public.seating_units),'outsider cannot read units');
select pg_temp.assert(not exists(select from public.seating_changes),'outsider cannot read changes');
select pg_temp.reject('ceremony',0,'{"action":"add","quantity":1,"capacity":1,"shape":"row"}','Wedding unavailable');
rollback;
