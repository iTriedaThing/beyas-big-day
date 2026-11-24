-- Run after visual seating and before the snapshot optimization in a disposable database.
\set ON_ERROR_STOP on
begin;
set local track_functions = 'none';
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
end $$;

insert into auth.users values (gen_random_uuid()) returning id as member_id \gset
insert into public.weddings(name) values ('Snapshot test') returning id as wedding_id \gset
insert into public.wedding_members(wedding_id, user_id, display_name)
  values (:'wedding_id', :'member_id', 'Member');
set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
insert into public.categories(wedding_id, name) values (:'wedding_id', 'Food') returning id as category_id \gset
insert into public.expenses(wedding_id, category_id, title, target_cents)
  select :'wedding_id', :'category_id', 'Expense ' || n, 100 from generate_series(1, 20) n;
update public.weddings set menu_expense_id = (
  select id from public.expenses where wedding_id = :'wedding_id' and title = 'Expense 1'
) where id = :'wedding_id';
insert into public.menu_courses(wedding_id, name) values (:'wedding_id', 'Dessert') returning id as course_id \gset
insert into public.menu_options(wedding_id, course_id, name, selected, pricing_basis, unit_cents)
  values (:'wedding_id', :'course_id', 'Cake', true, 'fixed', 600);
insert into public.invitations(wedding_id, household_name) values (:'wedding_id', 'Guests') returning id as household_id \gset
insert into public.guests(wedding_id, invitation_id, name) values (:'wedding_id', :'household_id', 'Guest');
select public.change_seating(:'wedding_id', 'reception', 0, gen_random_uuid(),
  '{"action":"add","quantity":1,"capacity":2,"shape":"round"}');
select id as table_id from public.seating_units where wedding_id = :'wedding_id' \gset
select public.change_seating(:'wedding_id', 'reception', 1, gen_random_uuid(),
  jsonb_build_object('action', 'assign', 'household_id', :'household_id', 'unit_id', :'table_id'));
select public.budget_snapshot(:'wedding_id') as previous_snapshot \gset
reset role;

\ir ../supabase/migrations/20261124025522_materialize_budget_snapshot.sql

-- Count helper executions directly to avoid dependence on hardware or timings.
set local track_functions = 'all';
set local role authenticated;
select public.budget_snapshot(:'wedding_id') as current_snapshot \gset
select pg_temp.assert(:'previous_snapshot'::jsonb = :'current_snapshot'::jsonb, 'full member snapshot matches');
reset role;
select pg_temp.assert(count(*) = 4 and bool_and(calls = 1), 'each snapshot input runs once')
from pg_stat_xact_user_functions where schemaname = 'private'
  and funcname in ('feedback_snapshot', 'itinerary_snapshot', 'menu_estimate', 'menu_snapshot');

select pg_temp.assert(not has_function_privilege('anon', 'public.budget_snapshot(uuid)', 'execute'),
  'signed-out snapshot denied');
set local role authenticated;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
select public.budget_snapshot(:'wedding_id') as outsider_snapshot \gset
select pg_temp.assert(:'outsider_snapshot'::jsonb @> '{"wedding":null,"menu_estimate":{"selected":0}}'
  and not exists (
    select from jsonb_each(:'outsider_snapshot'::jsonb)
    where jsonb_typeof(value) = 'array' and value <> '[]'::jsonb
  ), 'outsider snapshot hides wedding data');
rollback;
