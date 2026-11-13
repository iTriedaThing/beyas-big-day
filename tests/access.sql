\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end;
$$;
create function pg_temp.denied(statement text, message text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when insufficient_privilege or check_violation or foreign_key_violation or raise_exception then
    raise notice 'PASS rejected: %',message; return;
  end;
  raise exception 'FAIL accepted: %',message;
end;
$$;
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.weddings(id,name,cap_cents) values
 ('10000000-0000-0000-0000-000000000001','Test wedding',1000000),('10000000-0000-0000-0000-000000000002','Other wedding',0);
insert into public.wedding_members values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Partner A'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Partner B');
insert into public.categories(id,wedding_id,name) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Food'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Private');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select pg_temp.assert((select count(*)=1 from public.weddings),'member sees only own wedding');
select pg_temp.assert((select count(*)=2 from public.wedding_members),'both payer names available');
select pg_temp.denied($s$insert into public.wedding_members values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Intruder')$s$,'membership remains administrative');
select pg_temp.denied($s$truncate public.payments$s$,'TRUNCATE privilege revoked (RLS does not protect truncate)');
insert into public.vendors(id,wedding_id,name,email) values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Caterer','test@example.invalid');
insert into public.expenses(id,wedding_id,category_id,title,target_cents) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Catering',400000);
select pg_temp.denied($s$insert into public.expenses(wedding_id,category_id,title) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Cross wedding')$s$,'same-wedding category FK');
select pg_temp.denied($s$update public.weddings set currency='EUR' where id='10000000-0000-0000-0000-000000000001'$s$,'no relabeling existing currency');
select pg_temp.denied($s$update public.weddings set time_zone='Not/AZone' where id='10000000-0000-0000-0000-000000000001'$s$,'invalid timezone');
insert into public.quotes(id,wedding_id,expense_id,vendor_id,package_name,pricing_basis,unit_cents) values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Offer A','fixed',380000),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Offer B','fixed',360000);
update public.expenses set preferred_quote_id='50000000-0000-0000-0000-000000000002' where id='40000000-0000-0000-0000-000000000001' and version=1;
select pg_temp.assert((select version=2 from public.expenses limit 1),'version increments');
do $$declare n int;begin
 update public.expenses set notes='stale overwrite' where id='40000000-0000-0000-0000-000000000001' and version=1;
 get diagnostics n=row_count;perform pg_temp.assert(n=0,'stale compare-and-set changes zero rows');
end;$$;
update public.expenses set agreed_cents=360000,booked_quote_id='50000000-0000-0000-0000-000000000002',vendor_id='30000000-0000-0000-0000-000000000001'
 where id='40000000-0000-0000-0000-000000000001' and version=2;
insert into public.installments(id,wedding_id,expense_id,label,amount_cents,due_date) values
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Deposit',90000,'2027-01-10');
select public.record_payment('{"id":"70000000-0000-0000-0000-000000000001","wedding_id":"10000000-0000-0000-0000-000000000001","expense_id":"40000000-0000-0000-0000-000000000001","installment_id":"60000000-0000-0000-0000-000000000001","kind":"payment","amount_cents":90000,"paid_on":"2026-11-13","payer_id":"00000000-0000-0000-0000-000000000002"}');
-- Retry the exact payment. One row, even if the first response was lost.
select public.record_payment('{"id":"70000000-0000-0000-0000-000000000001","wedding_id":"10000000-0000-0000-0000-000000000001","expense_id":"40000000-0000-0000-0000-000000000001","installment_id":"60000000-0000-0000-0000-000000000001","kind":"payment","amount_cents":90000,"paid_on":"2026-11-13","payer_id":"00000000-0000-0000-0000-000000000002"}');
select pg_temp.assert((select count(*)=1 and sum(amount_cents)=90000 from public.payments),'deposit retry deduplicated');
select pg_temp.assert((select entered_by <> payer_id from public.payments limit 1),'payer distinct from recorder');
select pg_temp.denied($s$select public.record_payment('{"id":"70000000-0000-0000-0000-000000000001","wedding_id":"10000000-0000-0000-0000-000000000001","expense_id":"40000000-0000-0000-0000-000000000001","kind":"payment","amount_cents":123,"paid_on":"2026-11-13","payer_id":"00000000-0000-0000-0000-000000000002"}')$s$,'UUID cannot be reused with different payload');
update public.quotes set unit_cents=380001 where id='50000000-0000-0000-0000-000000000001' and version=1;
select pg_temp.assert((select agreed_cents=360000 from public.expenses limit 1),'unused quote leaves agreement intact');
select pg_temp.denied($s$update public.quotes set unit_cents=1 where id='50000000-0000-0000-0000-000000000002'$s$,'booked quote preserved');
select pg_temp.denied($s$update public.expenses set agreed_cents=350000 where id='40000000-0000-0000-0000-000000000001'$s$,'amendment reason required');
update public.expenses set agreed_cents=350000,amendment_reason='Contract change' where id='40000000-0000-0000-0000-000000000001' and version=3;
select pg_temp.assert((select count(*)=1 from public.contract_amendments),'amendment history recorded');
select pg_temp.denied($s$update public.expenses set agreed_cents=340000 where id='40000000-0000-0000-0000-000000000001'$s$,'second amendment requires a fresh reason');
select pg_temp.denied($s$insert into public.contract_amendments(wedding_id,expense_id,previous_cents,agreed_cents,reason) values('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,2,'Fabricated history')$s$,'history cannot be inserted directly');
-- Partner B reads the same ledger and can record a refund.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.assert((public.budget_snapshot('10000000-0000-0000-0000-000000000001')->'payments'->0->>'amount_cents')::bigint=90000,'second partner sees deposit');
select public.record_payment('{"id":"70000000-0000-0000-0000-000000000002","wedding_id":"10000000-0000-0000-0000-000000000001","expense_id":"40000000-0000-0000-0000-000000000001","installment_id":"60000000-0000-0000-0000-000000000001","kind":"refund","amount_cents":10000,"paid_on":"2026-11-13","payer_id":"00000000-0000-0000-0000-000000000001"}');
select pg_temp.assert((select sum(case when kind='refund' then -amount_cents else amount_cents end)=80000 from public.payments),'refund reduces net paid');
select pg_temp.denied($s$delete from public.payments$s$,'payment ledger cannot be deleted');
select pg_temp.denied($s$update public.payments set amount_cents=1$s$,'payment ledger cannot be overwritten');
select pg_temp.denied($s$insert into public.payments(id,wedding_id,expense_id,kind,amount_cents,paid_on,payer_id,entered_by) values(gen_random_uuid(),'10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','payment',1,current_date,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001')$s$,'recorder cannot be spoofed');
-- Atomic paid-in-full purchase and retry, including rollback on an invalid payment.
do $$declare e jsonb; p jsonb;begin
 e := '{"id":"40000000-0000-0000-0000-000000000002","wedding_id":"10000000-0000-0000-0000-000000000001","category_id":"20000000-0000-0000-0000-000000000001","title":"Invitations","target_cents":10000,"agreed_cents":10000}';
 p := '{"id":"70000000-0000-0000-0000-000000000003","wedding_id":"10000000-0000-0000-0000-000000000001","expense_id":"40000000-0000-0000-0000-000000000002","kind":"payment","amount_cents":10000,"paid_on":"2026-11-13","payer_id":"00000000-0000-0000-0000-000000000002"}';
 perform pg_temp.denied(format('select public.create_expense(%L::jsonb,%L::jsonb)',e,p || '{"amount_cents":9999}'::jsonb),'partial purchase rollback');
 perform pg_temp.assert(not exists(select 1 from public.expenses where id=(e->>'id')::uuid),'failed full purchase leaves no expense');
 perform public.create_expense(e,p); perform public.create_expense(e,p);
 perform pg_temp.assert((select count(*)=1 from public.payments where id=(p->>'id')::uuid),'paid-in-full retry one payment');
 perform pg_temp.assert((select count(*)=1 from public.expenses where id=(e->>'id')::uuid),'paid-in-full retry one expense');
end;$$;
select pg_temp.denied($s$insert into public.payments(id,wedding_id,expense_id,installment_id,kind,amount_cents,paid_on,payer_id) values(gen_random_uuid(),'10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','payment',1,current_date,'00000000-0000-0000-0000-000000000001')$s$,'installment must belong to same expense');
select pg_temp.denied($s$update public.categories set wedding_id='10000000-0000-0000-0000-000000000002' where id='20000000-0000-0000-0000-000000000001'$s$,'ownership cannot change');
-- Unrelated authenticated account: every exposed table is inaccessible.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$declare t text;n int;begin
 foreach t in array array['weddings','wedding_members','categories','vendors','expenses','quotes','installments','payments','contract_amendments'] loop
   execute format('select count(*) from public.%I',t) into n;
   perform pg_temp.assert(n=0,'outsider cannot read '||t);
 end loop;
end;$$;
select pg_temp.assert(public.budget_snapshot('10000000-0000-0000-0000-000000000001')->'wedding'='null'::jsonb,'outsider snapshot empty');
select pg_temp.denied($s$insert into public.vendors(wedding_id,name) values('10000000-0000-0000-0000-000000000001','Unauthorized')$s$,'outsider cannot insert');
do $$declare n int;begin
 update public.expenses set title='Unauthorized' where id='40000000-0000-0000-0000-000000000001';
 get diagnostics n=row_count;perform pg_temp.assert(n=0,'outsider cannot update');
end;$$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.denied('select * from public.weddings','signed-out reads denied');
select pg_temp.denied('select public.budget_snapshot(''10000000-0000-0000-0000-000000000001'')','signed-out RPC denied');
reset role;
select pg_temp.assert((select count(*)=9 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),'RLS enabled on every exposed table');
select 'All budget/access SQL assertions passed' as result;
rollback;
