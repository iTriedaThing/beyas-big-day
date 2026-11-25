-- Disposable database only. Seed an existing wedding before the rollout.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',message; end if; end $$;
insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'aisle-founder@example.invalid',now()) returning id as founder \gset
insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'aisle-partner@example.invalid',now()) returning id as partner \gset
insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'aisle-other@example.invalid',now()) returning id as outsider \gset
insert into public.weddings(name) values('Existing planner') returning id as existing \gset
insert into private.planner_invitations(email,issued_by) values('aisle-founder@example.invalid',:'outsider') returning id as invite \gset

\ir ../supabase/migrations/20261125035631_aisle_guided_setup.sql
select pg_temp.assert((select aisle_step is null from public.weddings where id=:'existing'),'existing wedding stays opt-in');
set local role authenticated;
select set_config('request.jwt.claim.sub',:'founder',true);
select public.accept_planner_invite(:'invite','Founder','Aisle wedding','UTC') as wedding \gset
select pg_temp.assert(public.budget_snapshot(:'wedding')->'wedding'->>'aisle_step'='settings','new enrollment starts at settings');
update public.weddings set aisle_step='first_action', aisle_paused=true where id=:'wedding';
insert into public.vendors(wedding_id,name,next_step)
values(:'wedding','Florist','Request the spring price list') returning id as vendor \gset
select public.issue_planner_invite(:'wedding','aisle-partner@example.invalid') as collaborator \gset
select set_config('request.jwt.claim.sub',:'partner',true);
select public.accept_planner_invite(:'collaborator','Partner',null,null);
select pg_temp.assert((public.budget_snapshot(:'wedding')->'wedding'->>'aisle_paused')::boolean,'partner sees paused setup');
select pg_temp.assert(public.budget_snapshot(:'wedding')->'vendors'->0->>'next_step'='Request the spring price list','partner sees the vendor follow-up');
update public.weddings set aisle_step='complete',aisle_paused=false where id=:'wedding';

select set_config('request.jwt.claim.sub',:'outsider',true);
update public.weddings set aisle_step='settings' where id=:'wedding';
update public.vendors set next_step='Unrelated edit' where id=:'vendor';
select pg_temp.assert(public.budget_snapshot(:'wedding')->'wedding'='null'::jsonb,'nonmember cannot read Aisle progress');
select set_config('request.jwt.claim.sub',:'founder',true);
select pg_temp.assert(public.budget_snapshot(:'wedding')->'wedding'->>'aisle_step'='complete','partner progress persisted and outsider update was denied');
select pg_temp.assert(public.budget_snapshot(:'wedding')->'vendors'->0->>'next_step'='Request the spring price list','outsider did not change vendor follow-up');
rollback;
