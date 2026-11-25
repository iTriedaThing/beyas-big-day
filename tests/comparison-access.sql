begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',message; end if; end $$;
create function pg_temp.reject(command text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when insufficient_privilege or check_violation or foreign_key_violation or unique_violation or raise_exception then return;
  end;
  raise exception 'Unexpected success: %',command;
end $$;
insert into auth.users(id) values(gen_random_uuid()) returning id as founder \gset
insert into auth.users(id) values(gen_random_uuid()) returning id as partner \gset
insert into auth.users(id) values(gen_random_uuid()) returning id as outsider \gset
insert into public.weddings(name) values('Comparison test') returning id as w \gset
insert into public.weddings(name) values('Other wedding') returning id as other \gset
insert into public.wedding_members(wedding_id,user_id,display_name)
values(:'w',:'founder','Founder'),(:'w',:'partner','Partner'),(:'other',:'outsider','Other');
set local role authenticated;
select set_config('request.jwt.claim.sub',:'founder',true);
insert into public.vendors(wedding_id,name) values(:'w','First') returning id as vendor \gset
insert into public.vendors(wedding_id,name) values(:'w','Second') returning id as second \gset
insert into public.categories(wedding_id,name) values(:'w','Food') returning id as category \gset
insert into public.expenses(wedding_id,category_id,title) values(:'w',:'category','Dinner') returning id as expense \gset
insert into public.quotes(wedding_id,expense_id,vendor_id,package_name,pricing_basis,unit_cents,headcount)
values(:'w',:'expense',:'vendor','Classic','per_person',14500,100) returning id as quote \gset
create temporary table budget_before as select private.pre_comparison_snapshot(:'w') as data;
select gen_random_uuid() as list \gset
select public.create_comparison(:'w',:'list','Venues','[{"label":"Suite","section":"Spaces"}]',:'vendor',null);
select id as criterion from public.comparison_criteria where list_id=:'list' \gset
select id as vopt from public.comparison_options where list_id=:'list' \gset
update public.comparison_criteria set label='Private suite',must_have=true,version=1 where id=:'criterion' and version=1;
select public.create_comparison(:'w',:'list','Venues','[{"label":"Suite"}]',:'vendor',null);
select pg_temp.assert((select count(*)=1 and bool_and(label='Private suite') from public.comparison_criteria),'retry preserves edits');
insert into public.comparison_options(wedding_id,list_id,vendor_id,quote_id)
values(:'w',:'list',:'vendor',:'quote') returning id as qopt \gset
select pg_temp.reject(format('insert into public.comparison_options(wedding_id,list_id,vendor_id,quote_id) values(%L,%L,%L,%L)',:'w',:'list',:'second',:'quote'));
select pg_temp.reject(format('insert into public.comparison_options(wedding_id,list_id,vendor_id) values(%L,%L,%L)',:'w',:'list',:'vendor'));
select pg_temp.reject(format('insert into public.comparison_options(wedding_id,list_id,vendor_id) values(%L,%L,%L)',:'other',:'list',:'vendor'));
insert into public.comparison_answers(wedding_id,list_id,criterion_id,option_id,offer,notes)
values(:'w',:'list',:'criterion',:'vopt','extra','500 USD per event') returning id as base \gset
select pg_temp.reject(format('update public.comparison_answers set offer=''inherit'',notes='''' where id=%L',:'base'));
select set_config('request.jwt.claim.sub',:'partner',true);
insert into public.comparison_answers(wedding_id,list_id,criterion_id,option_id,offer)
values(:'w',:'list',:'criterion',:'qopt','unknown') returning id as override \gset
update public.comparison_answers set offer='inherit',version=1 where id=:'override' and version=1;
with stale as (update public.comparison_answers set offer='included' where id=:'override' and version=1 returning id)
select pg_temp.assert(not exists(select 1 from stale),'stale answer rejected');
update public.comparison_answers set fit='yes',version=1 where id=:'base' and version=1;
update public.comparison_options set selected=false where id=:'vopt';
select pg_temp.assert(jsonb_array_length(public.budget_snapshot(:'w')->'comparison_answers')=2,'unselected column retains answers');
select pg_temp.assert((public.budget_snapshot(:'w')->'expenses')=(select data->'expenses' from budget_before)
  and (public.budget_snapshot(:'w')->'quotes')=(select data->'quotes' from budget_before),'no financial side effects');
select pg_temp.assert((public.budget_snapshot(:'w')->>'comparison_ready')::boolean,'migration advertises capability');
select public.create_comparison(:'w',gen_random_uuid(),'Florists','[]') as custom \gset
select pg_temp.reject(format('insert into public.comparison_answers(wedding_id,list_id,criterion_id,option_id,offer) values(%L,%L,%L,%L,''included'')',:'w',:'custom',:'criterion',:'vopt'));
select pg_temp.reject(format('update public.comparison_options set vendor_id=%L where id=%L',:'second',:'qopt'));
update public.quotes set deleted=true where id=:'quote';
select pg_temp.assert(jsonb_array_length(public.budget_snapshot(:'w')->'comparison_answers')=1,'deleted package drops out of snapshots');
update public.comparison_criteria set removed=true where id=:'criterion';
select pg_temp.assert(jsonb_array_length(public.budget_snapshot(:'w')->'comparison_answers')=0,'removed criterion hides answers');
select set_config('request.jwt.claim.sub',:'outsider',true);
select pg_temp.assert(jsonb_array_length(public.budget_snapshot(:'w')->'comparison_lists')=0,'outsider sees no lists');
select pg_temp.reject(format('select public.create_comparison(%L,gen_random_uuid(),''Unauthorized'',''[]'')',:'w'));
with denied as (update public.comparison_answers set notes='Outside edit' where id=:'base' returning id)
select pg_temp.assert(not exists(select 1 from denied),'outsider cannot edit answers');
select pg_temp.assert(not has_table_privilege('anon','public.comparison_answers','SELECT'),'anonymous read denied');
rollback;
