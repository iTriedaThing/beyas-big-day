\set ON_ERROR_STOP on
-- Disposable database only; all identities, invitations and records roll back.
begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',message; end if; end $$;
create function pg_temp.denied(stmt text, expected text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then if position(expected in sqlerrm)>0 then return; end if; raise;
  end;
  raise exception 'Expected rejection';
end $$;
insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'operator@example.invalid',now()) returning id as operator \gset
insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'founder@example.invalid',now()) returning id as founder \gset
insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'helper@example.invalid',null) returning id as helper \gset
insert into private.beta_operators values(:'operator');
insert into public.weddings(name) values('Original private wedding') returning id as original \gset
insert into public.wedding_members values(:'original',:'operator','Operator');
set local role authenticated;
select set_config('request.jwt.claim.sub',:'operator',true);
select public.issue_planner_invite(null,'  FOUNDER@example.invalid ') as first \gset
select pg_temp.assert(public.issue_planner_invite(null,'founder@example.invalid')=:'first','retry returns same active invitation');
select pg_temp.assert((public.planner_access(null)->>'operator')::boolean,'operator can start a beta wedding');
select pg_temp.denied(format('select public.accept_planner_invite(%L,%L,%L,%L)',:'first','Wrong','Wrong','UTC'),'unavailable');
select pg_temp.assert(not has_function_privilege('anon','public.planner_access(uuid)','execute') and
  not has_function_privilege('authenticated','public.before_beta_signup(jsonb)','execute')
  and not has_table_privilege('authenticated','private.planner_invitations','select'),'private boundaries');

set local role supabase_auth_admin;
select pg_temp.assert(public.before_beta_signup(jsonb_build_object('user',jsonb_build_object('email','Founder@example.invalid','user_metadata',jsonb_build_object('planner_invitation',:'first'))))='{}','hook allows invited email and link');
select pg_temp.assert(public.before_beta_signup('{"user":{"email":"founder@example.invalid","user_metadata":{}}}')?'error','hook rejects missing link');
select pg_temp.assert(public.before_beta_signup(jsonb_build_object('user',jsonb_build_object('email','different@example.invalid','user_metadata',jsonb_build_object('planner_invitation',:'first'))))?'error','hook rejects different email');

set local role authenticated;
select set_config('request.jwt.claim.sub',:'founder',true);
select pg_temp.assert(jsonb_array_length(public.planner_access(null)->'weddings')=0 and jsonb_array_length(public.planner_access(null)->'incoming')=1,'founder has no wedding before confirmation and acceptance');
select pg_temp.denied(format('select public.issue_planner_invite(null,%L)','someone@example.invalid'),'operator');
select pg_temp.denied(format('select public.issue_planner_invite(%L,%L)',:'original','someone@example.invalid'),'unavailable');
select pg_temp.denied(format('select public.accept_planner_invite(%L,%L,%L,%L)',:'first','Founder','New wedding','Invalid/Zone'),'time zone');
select public.accept_planner_invite(:'first','Founder','New wedding','America/Chicago') as fresh \gset
select pg_temp.assert(public.accept_planner_invite(:'first','Changed','Duplicate','UTC')=:'fresh' and (select count(*)=1 from public.weddings),'cross-device retry does not duplicate wedding');
select pg_temp.assert(public.planner_access(:'first')->>'accepted_wedding'=:'fresh' and (public.planner_access(null)->>'operator')::boolean=false,'repeat link routes to accepted wedding');
insert into public.vendors(wedding_id,name) values(:'fresh','Venue for new wedding') returning id as vendor \gset
select :'fresh'||'/'||:'vendor'||'/'||gen_random_uuid()||'.jpg' as file \gset
insert into storage.objects(bucket_id,name) values('vendor-photos',:'file');
select public.issue_planner_invite(:'fresh','helper@example.invalid') as join_link \gset
select public.issue_planner_invite(:'fresh','other@example.invalid') as revoke_link \gset
select public.revoke_planner_invite(:'revoke_link');
set local role supabase_auth_admin;
select pg_temp.assert(public.before_beta_signup(jsonb_build_object('user',jsonb_build_object('email','other@example.invalid','user_metadata',jsonb_build_object('planner_invitation',:'revoke_link'))))?'error','revoked link cannot register');
set local role authenticated;
select set_config('request.jwt.claim.sub',:'helper',true);
select pg_temp.denied(format('select public.accept_planner_invite(%L,%L,null,null)',:'join_link','Helper'),'unavailable');
reset role;
update auth.users set email_confirmed_at=now() where id=:'helper';
update private.planner_invitations set expires_at=now()-interval '1 minute' where id=:'join_link';
set local role authenticated;
select pg_temp.denied(format('select public.accept_planner_invite(%L,%L,null,null)',:'join_link','Helper'),'expired');
select set_config('request.jwt.claim.sub',:'founder',true);
select public.issue_planner_invite(:'fresh','helper@example.invalid') as renewed \gset
select pg_temp.assert(:'join_link'<>:'renewed','expired invitation replaced');
select set_config('request.jwt.claim.sub',:'helper',true);
select pg_temp.assert(public.accept_planner_invite(:'renewed','Helper',null,null)=:'fresh','helper joins designated wedding');
select pg_temp.assert(exists(select from storage.objects where name=:'file'),'collaborator sees wedding photo');
update public.vendors set name='Updated by collaborator' where id=:'vendor';
select pg_temp.assert(jsonb_array_length(public.budget_snapshot(:'fresh')->'members')=2,'both members in planner');
select set_config('request.jwt.claim.sub',:'founder',true);
select pg_temp.assert(public.budget_snapshot(:'fresh')->'vendors'->0->>'name'='Updated by collaborator','founder sees collaborator edits');
select set_config('request.jwt.claim.sub',:'helper',true);
select public.issue_planner_invite(:'fresh','second-helper@example.invalid');
select set_config('request.jwt.claim.sub',:'operator',true);
select pg_temp.denied(format('select public.revoke_planner_invite(%L)',:'renewed'),'unavailable');
select pg_temp.assert(jsonb_array_length(public.planner_access(null)->'outgoing')=0,'operator cannot enumerate another wedding’s collaborator invitations');
select pg_temp.assert((public.budget_snapshot(:'fresh')->'wedding')='null'::jsonb and not exists(select from storage.objects where name=:'file'),'operator cannot see another wedding or private files');
select pg_temp.assert(not exists(select from public.vendors where id=:'vendor'),'other wedding cannot export vendor');
select pg_temp.denied(format('insert into public.vendors(wedding_id,name) values(%L,%L)',:'fresh','Wrong wedding'),'row-level security');
select public.issue_planner_invite(:'original','helper@example.invalid') as second_wedding \gset
select set_config('request.jwt.claim.sub',:'helper',true);
select public.accept_planner_invite(:'second_wedding','Helper',null,null);
select pg_temp.assert(jsonb_array_length(public.planner_access(null)->'weddings')=2,'explicit memberships in two weddings are supported');
select pg_temp.assert(jsonb_array_length(public.budget_snapshot(:'original')->'vendors')=0,'selected wedding snapshot excludes other membership');
rollback;
