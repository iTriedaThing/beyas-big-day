-- Disposable database, including migration of pre-archive data.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,msg text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',msg; end if; end $$;
create function pg_temp.denied(stmt text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return true; end $$;
insert into auth.users(id) values(gen_random_uuid()) returning id as owner \gset
insert into auth.users(id) values(gen_random_uuid()) returning id as helper \gset
insert into public.weddings(name) values('Archive test') returning id as w \gset
insert into public.wedding_members values(:'w',:'owner','Owner'),(:'w',:'helper','Helper');
set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner',true);
insert into public.tasks(wedding_id,title,planning_window,archived) values(:'w','Previously archived task','12_plus',true);
insert into public.categories(wedding_id,name) values(:'w','Old deletion') returning id as obsolete \gset
select public.delete_record('categories',:'obsolete',1);
reset role;
\ir ../supabase/migrations/20261127001810_wedding_archive.sql
update public.wedding_members set is_owner=true where user_id=:'owner';
set local role authenticated;
select pg_temp.assert(jsonb_array_length(private.archive_inventory(:'w'))=1,'existing archive survives, old deletions excluded');
select set_config('request.jwt.claim.sub',:'helper',true);
select pg_temp.assert(private.archive_inventory(:'w') is null,'collaborator cannot list archive');
select pg_temp.assert(pg_temp.denied('update public.wedding_members set is_owner=true'),'no self promotion');
insert into public.categories(wedding_id,name) values(:'w','Meals') returning id as category \gset
insert into public.expenses(wedding_id,category_id,title,agreed_cents) values(:'w',:'category','Dinner',2000) returning id as expense \gset
insert into public.installments(wedding_id,expense_id,label,amount_cents,due_date)
values(:'w',:'expense','Deposit',100,'2026-11-26') returning id as installment \gset
insert into public.payments(id,wedding_id,expense_id,installment_id,kind,amount_cents,paid_on,payer_id)
values(gen_random_uuid(),:'w',:'expense',:'installment','payment',100,'2026-11-26',:'helper');
select public.delete_record('installments',:'installment',1);
select pg_temp.assert((public.budget_snapshot(:'w')->'payments'->0->'installment_id')='null','hidden installment keeps its payment unallocated');
select public.delete_record('categories',:'category',1);
select pg_temp.assert(not exists(select from public.expenses),'inherited archive filters direct reads');
select pg_temp.assert(jsonb_array_length(public.budget_snapshot(:'w')->'payments')=0,'hidden expense leaves balances');
select pg_temp.assert(pg_temp.denied(format('update public.weddings set currency=%L where id=%L','CAD',:'w')),'archived prices keep currency fixed');
select pg_temp.assert(pg_temp.denied(format('insert into public.expenses(wedding_id,category_id,title) values(%L,%L,%L)',:'w',:'category','late')),'late child rejected');
reset role;
select pg_temp.assert((select is_active from public.expenses where id=:'expense'),'parent archive preserves child flag');
select token as token from private.archive_entries where record_id=:'category' \gset
set local role authenticated;
select pg_temp.assert(pg_temp.denied(format('select public.manage_archive(%L,%L,%L)',:'w',:'token','restore')),'collaborator cannot restore');
select pg_temp.assert(pg_temp.denied(format('select public.manage_archive(%L,%L,%L)',:'w',:'token','purge')),'collaborator cannot purge');
select set_config('request.jwt.claim.sub',:'owner',true);
insert into public.categories(wedding_id,name) values(:'w','Meals') returning id as replacement \gset
select pg_temp.assert(pg_temp.denied(format('select public.manage_archive(%L,%L,%L)',:'w',:'token','restore')),'restore name conflict');
update public.categories set name='New meals' where id=:'replacement';
select public.manage_archive(:'w',:'token','restore');
select pg_temp.assert(exists(select from public.expenses) and not exists(select from public.installments),'restore respects independent child deletion');
select public.delete_record('categories',:'category',3);
select public.manage_archive(:'w',:'token','restore');
select pg_temp.assert(not exists(select from public.expenses),'retry of old token cannot revive later deletion');
select e->>'token' as token from jsonb_array_elements(private.archive_inventory(:'w')) e where e->>'record_id'=:'category' \gset
select public.manage_archive(:'w',:'token','preview') as impact \gset
select pg_temp.assert(jsonb_array_length(:'impact'::jsonb->'payments')=1,'preview includes payment');
select pg_temp.assert(pg_temp.denied(format('select public.manage_archive(%L,%L,%L,%L)',:'w',:'token','purge','{}')),'stale purge preview rejected');
select public.manage_archive(:'w',:'token','purge',:'impact');
select pg_temp.assert(exists(select from public.categories where id=:'replacement'),'unrelated records retained');
reset role;
select pg_temp.assert(not exists(select from public.payments) and not exists(select from public.installments),'physical removal includes dependents');
select pg_temp.assert(exists(select from public.record_history where record_id=:'category'),'history retained');
set local role authenticated;
insert into public.invitations(wedding_id,household_name) values(:'w','Family') returning id as household \gset
insert into public.guests(wedding_id,invitation_id,name) values(:'w',:'household','Robin') returning id as guest \gset
select public.change_seating(:'w','reception',0,gen_random_uuid(),'{"action":"add","quantity":2,"capacity":2,"shape":"round"}');
select id as first_table from public.seating_units where position=1 \gset
select id as second_table from public.seating_units where position=2 \gset
select public.change_seating(:'w','reception',1,gen_random_uuid(),jsonb_build_object('action','assign','household_id',:'household','unit_id',:'first_table'));
select public.change_seating(:'w','reception',2,gen_random_uuid(),jsonb_build_object('action','delete','unit_id',:'first_table'));
select pg_temp.assert(not exists(select from public.seating_placements),'occupants available to reseat');
select public.change_seating(:'w','reception',3,gen_random_uuid(),jsonb_build_object('action','assign','household_id',:'household','unit_id',:'second_table'));
select e->>'token' as seat_token from jsonb_array_elements(private.archive_inventory(:'w')) e where e->>'record_id'=:'first_table' \gset
select public.manage_archive(:'w',:'seat_token','restore');
select pg_temp.assert((select unit_id=:'second_table' from public.seating_placements),'restoring table preserves later move');
insert into public.vendors(wedding_id,name) values(:'w','Chef') returning id as vendor \gset
insert into public.menu_courses(wedding_id,name) values(:'w','Main') returning id as course \gset
insert into public.menu_options(wedding_id,course_id,vendor_id,name,pricing_basis) values(:'w',:'course',:'vendor','Soup','fixed');
update public.guests set rsvp='yes' where id=:'guest';
update public.menu_options set selected=true returning id as dish \gset
insert into public.guest_meals(wedding_id,guest_id,course_id,option_id) values(:'w',:'guest',:'course',:'dish') returning id as meal \gset
select public.delete_record('vendors',:'vendor',1);
select pg_temp.assert(public.budget_snapshot(:'w')->'guest_meals'->0->'option_id'='null','archived choice can be reassigned in place');
update public.guest_meals set option_id=null where id=:'meal';
select public.delete_record('menu_courses',:'course',1);
select e->>'token' as course_token from jsonb_array_elements(private.archive_inventory(:'w')) e where e->>'record_id'=:'course' \gset
select public.manage_archive(:'w',:'course_token','restore');
select pg_temp.assert(not exists(select from public.menu_options),'both parents must be visible');
select e->>'token' as vendor_token from jsonb_array_elements(private.archive_inventory(:'w')) e where e->>'record_id'=:'vendor' \gset
select public.manage_archive(:'w',:'vendor_token','restore');
insert into public.expenses(wedding_id,category_id,vendor_id,title) values(:'w',:'replacement',:'vendor','Booked catering') returning id as booked \gset
insert into public.quotes(wedding_id,expense_id,vendor_id,package_name,pricing_basis,unit_cents)
values(:'w',:'booked',:'vendor','Lunch package','fixed',3500) returning id as quote \gset
update public.expenses set preferred_quote_id=:'quote',booked_quote_id=:'quote',agreed_cents=3500 where id=:'booked';
select pg_temp.assert(pg_temp.denied(format('select public.delete_record(%L,%L,1)','quotes',:'quote')),'booked quote protected');
select gen_random_uuid() as photo \gset
select :'w'||'/'||:'vendor'||'/'||:'photo'||'.png' as path \gset
insert into storage.objects(bucket_id,name) values('vendor-photos',:'path');
insert into public.vendor_photos(id,wedding_id,vendor_id,storage_path) values(:'photo',:'w',:'vendor',:'path');
insert into public.itinerary_items(wedding_id,title,start_time,vendor_id) values(:'w','Lunch','12:00',:'vendor');
select public.create_comparison(:'w',gen_random_uuid(),'Caterers','[{"label":"Staffing"}]',:'vendor',:'quote') as comparison \gset
select public.delete_record('comparison_lists',:'comparison',1);
select pg_temp.assert(not exists(select from public.comparison_options),'checklist hides its columns');
select e->>'token' as list_token from jsonb_array_elements(private.archive_inventory(:'w')) e where e->>'record_id'=:'comparison' \gset
select public.manage_archive(:'w',:'list_token','restore');
select pg_temp.assert(exists(select from public.comparison_options),'checklist restore brings columns back');
select public.delete_record('vendors',:'vendor',3);
select pg_temp.assert(not exists(select from storage.objects),'hidden vendor picture inaccessible');
select e->>'token' as vendor_token from jsonb_array_elements(private.archive_inventory(:'w')) e where e->>'record_id'=:'vendor' \gset
select public.manage_archive(:'w',:'vendor_token','preview') as impact \gset
select pg_temp.assert(jsonb_array_length(:'impact'::jsonb->'picture_files')=1,'purge preview names stored files');
select public.manage_archive(:'w',:'vendor_token','purge',:'impact');
select pg_temp.assert(exists(select from public.comparison_lists) and not exists(select from public.comparison_options),'purging vendor preserves independent comparison');
select pg_temp.assert(exists(select from public.itinerary_items where vendor_id is null),'itinerary survives vendor purge');
select pg_temp.assert(jsonb_array_length(public.pending_archive_files(:'w'))=1,'file cleanup queued for Storage API');
select set_config('request.jwt.claim.sub',:'helper',true);
delete from storage.objects where name=:'path';
select pg_temp.assert(not exists(select from public.record_history where record_id=:'vendor'),'archived history owner-only');
select set_config('request.jwt.claim.sub',:'owner',true);
select pg_temp.assert(jsonb_array_length(public.pending_archive_files(:'w'))=1,'ordinary member cannot clean up files');
delete from storage.objects where name=:'path';
select pg_temp.assert(jsonb_array_length(public.pending_archive_files(:'w'))=0,'cleanup receipt cleared after storage deletion');
select public.delete_record('invitations',:'household',1);
select e->>'token' as family_token from jsonb_array_elements(private.archive_inventory(:'w')) e where e->>'record_id'=:'household' \gset
select pg_temp.assert(not exists(select from public.seating_placements),'household archive releases seats');
select pg_temp.assert(jsonb_array_length(public.manage_archive(:'w',:'family_token','preview')->'seating_placements')=1,'preview includes restorable seating memory');
select public.manage_archive(:'w',:'family_token','restore');
select pg_temp.assert((select unit_id=:'second_table' from public.seating_placements),'unclaimed seat restored');
reset role;
insert into public.weddings(name) values('Other wedding') returning id as other \gset
insert into public.wedding_members(wedding_id,user_id,display_name,is_owner) values(:'other',:'helper','Other owner',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',:'helper',true);
select pg_temp.assert(private.archive_inventory(:'w') is null,'owner privilege is wedding-specific');
select pg_temp.assert(pg_temp.denied(format('select public.manage_archive(%L,%L,%L)',:'w',:'token','purge')),'owner of another wedding cannot purge');
set local role anon;
select pg_temp.assert(pg_temp.denied(format('select public.manage_archive(%L,%L,%L)',:'w',:'token','preview')),'signed-out access denied');
rollback;
