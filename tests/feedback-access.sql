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
insert into public.weddings(id,name) values('10000000-0000-0000-0000-000000000001','Feedback test'),('10000000-0000-0000-0000-000000000002','Other');
insert into public.wedding_members values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Ben'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Maya');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.categories(id,wedding_id,name) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Venue');
insert into public.vendors(id,wedding_id,name,vendor_kind,rating) values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Garden','venue',5);
insert into public.expenses(id,wedding_id,category_id,vendor_id,title,target_cents) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Venue',400000);
insert into public.quotes(id,wedding_id,expense_id,vendor_id,package_name,pricing_basis,unit_cents) values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Garden package','fixed',360000);
update public.expenses set agreed_cents=360000,booked_quote_id='50000000-0000-0000-0000-000000000001',preferred_quote_id='50000000-0000-0000-0000-000000000001' where title='Venue';
insert into public.installments(id,wedding_id,expense_id,label,amount_cents,due_date) values('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Deposit',90000,'2026-12-01');
select public.record_payment('{"id":"70000000-0000-0000-0000-000000000001","wedding_id":"10000000-0000-0000-0000-000000000001","expense_id":"40000000-0000-0000-0000-000000000001","installment_id":"60000000-0000-0000-0000-000000000001","kind":"payment","amount_cents":90000,"paid_on":"2026-11-14","payer_id":"00000000-0000-0000-0000-000000000002"}');
update public.payments set amount_cents=100000,kind='refund',paid_on='2026-11-15',payer_id='00000000-0000-0000-0000-000000000001',notes='Correction' where id='70000000-0000-0000-0000-000000000001' and version=1;
select pg_temp.assert((select version=2 and entered_by='00000000-0000-0000-0000-000000000001' from public.payments),'edit keeps original recorder and increments version');
select pg_temp.assert((select previous->>'amount_cents'='90000' and current_record->>'amount_cents'='100000' from public.record_history where table_name='payments'),'payment history stores before and after');
do $$declare n integer;begin
update public.payments set amount_cents=1 where version=1;get diagnostics n=row_count;
perform pg_temp.assert(n=0,'stale edit cannot overwrite correction');end;$$;
select pg_temp.denied($q$update public.payments set entered_by='00000000-0000-0000-0000-000000000002'$q$,'original recorder cannot be spoofed');
select pg_temp.denied($q$update public.payments set amount_cents=0$q$,'zero payment denied');
select pg_temp.denied($q$update public.payments set expense_id=gen_random_uuid()$q$,'invalid expense denied');
select pg_temp.denied($q$update public.expenses set agreed_cents=null,booked_quote_id=null,preferred_quote_id=null$q$,'unbooking requires reason');
select pg_temp.denied($q$select public.delete_record('quotes','50000000-0000-0000-0000-000000000001',1)$q$,'booked quote cannot disappear without unbooking');
update public.expenses set agreed_cents=null,booked_quote_id=null,preferred_quote_id=null,amendment_reason='Chosen another venue' where title='Venue';
select pg_temp.assert((select count(*)=1 from public.contract_amendments where agreed_cents is null),'unbook history preserved');
select pg_temp.assert(jsonb_array_length(public.budget_snapshot('10000000-0000-0000-0000-000000000001')->'installments')=0,'unbook pauses payment reminders');
select pg_temp.assert(jsonb_array_length(public.budget_snapshot('10000000-0000-0000-0000-000000000001')->'payments')=1,'unbook keeps payments');
update public.expenses set agreed_cents=360000 where title='Venue';
select public.delete_record('installments','60000000-0000-0000-0000-000000000001',1);
select public.delete_record('installments','60000000-0000-0000-0000-000000000001',1);
select pg_temp.assert((select installment_id is null and not deleted from public.payments),'delete installment keeps payment unallocated and retry is harmless');
select public.create_household('{"id":"80000000-0000-0000-0000-000000000001","wedding_id":"10000000-0000-0000-0000-000000000001","household_name":"Test guests"}',
'[{"id":"90000000-0000-0000-0000-000000000001","name":"Alex","invited_by":"00000000-0000-0000-0000-000000000002"}]');
select pg_temp.assert((select invited_by='00000000-0000-0000-0000-000000000002' from public.guests),'household creation saves attribution');
select pg_temp.denied($q$update public.guests set invited_by='00000000-0000-0000-0000-000000000003'$q$,'attribution restricted to wedding members');
insert into public.events(id,wedding_id,title,kind,event_date,start_time,vendor_id) values('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Tour','Tour','2026-11-20','09:30','30000000-0000-0000-0000-000000000001');
select pg_temp.denied($q$insert into public.events(wedding_id,title,event_date,vendor_id) values('10000000-0000-0000-0000-000000000002','Bad','2026-12-01','30000000-0000-0000-0000-000000000001')$q$,'cross-wedding event denied');
insert into public.vendor_photos(id,wedding_id,vendor_id,storage_path) values('b0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000001.jpg');
insert into storage.objects(bucket_id,name) values('vendor-photos','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000001.jpg');
select pg_temp.assert((select count(*)=1 from storage.objects),'member can upload/read private photo');
select pg_temp.denied($q$insert into storage.objects(bucket_id,name) values('vendor-photos','10000000-0000-0000-0000-000000000002/30000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000001.jpg')$q$,'other-wedding photo path denied');
select pg_temp.denied($q$select public.delete_record('vendors','30000000-0000-0000-0000-000000000001',999)$q$,'stale deletion denied');
select public.delete_record('vendors','30000000-0000-0000-0000-000000000001',1);
select pg_temp.assert((select deleted from public.expenses),'vendor deletion cascades linked expense');
select pg_temp.assert((select deleted from public.payments),'vendor deletion removes linked payment from totals');
select pg_temp.assert((select deleted from public.vendor_photos),'vendor gallery deleted');
select pg_temp.assert((select vendor_id is null and not deleted from public.events),'visits remain without deleted vendor');
select pg_temp.assert((select count(*)=0 from storage.objects),'deleted vendor photos unavailable');
select pg_temp.assert(jsonb_array_length(public.budget_snapshot('10000000-0000-0000-0000-000000000001')->'expenses')=0,'snapshot excludes deleted expenses');
select pg_temp.denied($q$insert into public.expenses(wedding_id,category_id,vendor_id,title) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Late expense')$q$,'cannot attach to deleted vendor');
select pg_temp.denied($q$update public.vendors set deleted=false$q$,'deleted records cannot be revived');
select public.delete_record('invitations','80000000-0000-0000-0000-000000000001',1);
select pg_temp.assert((select deleted from public.guests),'household deletion cascades seats');
select public.delete_record('categories','20000000-0000-0000-0000-000000000001',1);
insert into public.categories(wedding_id,name) values('10000000-0000-0000-0000-000000000001','Venue');
select pg_temp.denied('delete from public.payments','physical deletion remains forbidden');
select pg_temp.denied('update public.record_history set entered_by=auth.uid()','history cannot be rewritten');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select pg_temp.assert((select count(*)>0 from public.record_history),'other partner can review change history');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.assert((select count(*)=0 from public.events),'outsider sees no events');
select pg_temp.assert((select count(*)=0 from public.record_history),'outsider sees no history');
select pg_temp.assert((select count(*)=0 from public.vendor_photos),'outsider sees no photo metadata');
select pg_temp.denied($q$select public.delete_record('events','a0000000-0000-0000-0000-000000000001',2)$q$,'outsider cannot delete');
set local role anon;
select pg_temp.denied('select * from public.events','signed-out event access denied');
select pg_temp.denied('select * from public.vendor_photos','signed-out photo metadata denied');
select pg_temp.denied('select * from public.record_history','signed-out history denied');
select pg_temp.denied($q$select public.delete_record('events','a0000000-0000-0000-0000-000000000001',2)$q$,'signed-out deletion denied');
reset role;
select pg_temp.assert((select not public from storage.buckets where id='vendor-photos'),'bucket is private');
select 'All feedback/access SQL assertions passed' as result;
rollback;
