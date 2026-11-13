-- Shared budget. Apply to a new, dedicated Supabase project after review.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  currency text not null default 'USD' check (currency in ('USD','CAD','GBP','EUR','AUD','NZD')),
  cap_cents bigint not null default 0 check (cap_cents between 0 and 1000000000),
  wedding_date date,
  time_zone text not null default 'America/New_York',
  version integer not null default 1
);
create table public.wedding_members (
  wedding_id uuid not null references public.weddings(id),
  user_id uuid not null references auth.users(id),
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  primary key (wedding_id,user_id)
);
create index wedding_members_user on public.wedding_members(user_id,wedding_id);
-- Deliberately private, narrowly scoped definer lookup avoids recursive membership RLS.
create function private.is_member(w uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.wedding_members m where m.wedding_id = w and m.user_id = auth.uid()
  );
$$;
revoke all on function private.is_member(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  name text not null check (length(trim(name)) between 1 and 100), version integer not null default 1,
  unique(wedding_id,id), unique(wedding_id,name)
);
create table public.vendors (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  name text not null check (length(trim(name)) between 1 and 120),
  contact_name text not null default '', email text not null default '', phone text not null default '',
  website text not null default '', notes text not null default '', version integer not null default 1,
  unique(wedding_id,id)
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  category_id uuid not null, vendor_id uuid,
  title text not null check (length(trim(title)) between 1 and 160),
  target_cents bigint check(target_cents between 0 and 1000000000),
  preferred_quote_id uuid, booked_quote_id uuid,
  agreed_cents bigint check(agreed_cents between 0 and 1000000000),
  notes text not null default '', amendment_reason text not null default '', version integer not null default 1,
  unique(wedding_id,id),
  foreign key(wedding_id,category_id) references public.categories(wedding_id,id),
  foreign key(wedding_id,vendor_id) references public.vendors(wedding_id,id),
  check(booked_quote_id is null or agreed_cents is not null)
);
create table public.quotes (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  expense_id uuid not null, vendor_id uuid not null,
  package_name text not null check(length(trim(package_name)) between 1 and 160),
  pricing_basis text not null check(pricing_basis in ('fixed','per_person')),
  unit_cents bigint not null check(unit_cents between 0 and 1000000000),
  headcount integer not null default 1 check(headcount between 1 and 100000),
  details text not null default '', rating integer check(rating between 1 and 5), notes text not null default '',
  version integer not null default 1,
  unique(wedding_id,id), unique(wedding_id,expense_id,id),
  foreign key(wedding_id,expense_id) references public.expenses(wedding_id,id),
  foreign key(wedding_id,vendor_id) references public.vendors(wedding_id,id),
  check(unit_cents * case when pricing_basis = 'per_person' then headcount else 1 end <= 1000000000)
);
alter table public.expenses add foreign key(wedding_id,id,preferred_quote_id)
  references public.quotes(wedding_id,expense_id,id);
alter table public.expenses add foreign key(wedding_id,id,booked_quote_id)
  references public.quotes(wedding_id,expense_id,id);
create table public.installments (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id), expense_id uuid not null,
  label text not null check(length(trim(label)) between 1 and 120),
  amount_cents bigint not null check(amount_cents between 1 and 1000000000), due_date date not null,
  version integer not null default 1, unique(wedding_id,id), unique(wedding_id,expense_id,id),
  foreign key(wedding_id,expense_id) references public.expenses(wedding_id,id)
);
create table public.payments (
  id uuid primary key, wedding_id uuid not null references public.weddings(id), expense_id uuid not null, installment_id uuid,
  kind text not null check(kind in ('payment','refund')),
  amount_cents bigint not null check(amount_cents between 1 and 1000000000), paid_on date not null,
  payer_id uuid not null, entered_by uuid not null default auth.uid(), notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key(wedding_id,expense_id) references public.expenses(wedding_id,id),
  foreign key(wedding_id,expense_id,installment_id) references public.installments(wedding_id,expense_id,id),
  foreign key(wedding_id,payer_id) references public.wedding_members(wedding_id,user_id),
  foreign key(wedding_id,entered_by) references public.wedding_members(wedding_id,user_id)
);
create table public.contract_amendments (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null, expense_id uuid not null,
  previous_cents bigint not null, agreed_cents bigint not null, reason text not null,
  entered_by uuid not null default auth.uid(), created_at timestamptz not null default now(),
  foreign key(wedding_id,expense_id) references public.expenses(wedding_id,id),
  foreign key(wedding_id,entered_by) references public.wedding_members(wedding_id,user_id)
);
create index payments_wedding_expense_installment on public.payments(wedding_id,expense_id,installment_id);
create index amendments_wedding_expense on public.contract_amendments(wedding_id,expense_id);

-- History can only be appended by the expense update trigger, not fabricated via REST.
create function private.guard_amendment() returns trigger language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() <> 2 then raise exception 'Amendments are created by an expense agreement update'; end if;
  return new;
end;
$$;
create trigger amendment_rules before insert on public.contract_amendments for each row execute function private.guard_amendment();

create function private.guard_edit() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or (to_jsonb(new)->>'wedding_id') is distinct from (to_jsonb(old)->>'wedding_id') then
    raise exception 'Record ownership cannot change';
  end if;
  if new.version <> old.version then raise exception 'Version conflict: refresh and review'; end if;
  new.version := old.version + 1;
  return new;
end;
$$;
create function private.guard_wedding() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'Unknown IANA time zone';
  end if;
  if tg_op = 'UPDATE' and new.currency <> old.currency and exists(select 1 from public.expenses where wedding_id = old.id) then
    raise exception 'Currency cannot change after the first expense';
  end if;
  return new;
end;
$$;
create trigger wedding_rules before insert or update on public.weddings for each row execute function private.guard_wedding();
create function private.guard_expense() returns trigger language plpgsql set search_path = '' as $$
declare chosen public.quotes;
begin
  if new.booked_quote_id is not null then
    select * into chosen from public.quotes where wedding_id = new.wedding_id and id = new.booked_quote_id and expense_id = new.id;
    if not found or new.vendor_id is distinct from chosen.vendor_id then raise exception 'Booked quote must match the expense vendor'; end if;
  end if;
  if tg_op = 'UPDATE' then
    if old.agreed_cents is not null then
      if new.agreed_cents is null or new.booked_quote_id is distinct from old.booked_quote_id or new.vendor_id is distinct from old.vendor_id then
        raise exception 'A booked agreement cannot be removed or reassigned';
      end if;
      if new.agreed_cents <> old.agreed_cents then
        if length(trim(new.amendment_reason)) < 3 then raise exception 'Explain the contract amendment'; end if;
        insert into public.contract_amendments(wedding_id,expense_id,previous_cents,agreed_cents,reason)
        values(new.wedding_id,new.id,old.agreed_cents,new.agreed_cents,new.amendment_reason);
      end if;
    end if;
  end if;
  -- The explanation is consumed into history; a future amendment needs a fresh one.
  new.amendment_reason := '';
  return new;
end;
$$;
create trigger expense_rules before insert or update on public.expenses for each row execute function private.guard_expense();
create function private.guard_quote() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.expense_id <> old.expense_id or new.vendor_id <> old.vendor_id then raise exception 'Quote links cannot change'; end if;
  if exists(select 1 from public.expenses where booked_quote_id = old.id and wedding_id = old.wedding_id) then
    raise exception 'Booked quotes are preserved; record an explicit contract amendment on the expense';
  end if;
  return new;
end;
$$;
create trigger quote_rules before update on public.quotes for each row execute function private.guard_quote();

-- No anonymous grants, no client deletes, and no client membership provisioning.
alter table public.wedding_members enable row level security;
revoke all on public.wedding_members from public,anon,authenticated;
create policy member_read on public.wedding_members for select to authenticated using(private.is_member(wedding_id));
grant select on public.wedding_members to authenticated;
do $$
declare t text; key text;
begin
  foreach t in array array['weddings','categories','vendors','expenses','quotes','installments','payments','contract_amendments'] loop
    key := case when t = 'weddings' then 'id' else 'wedding_id' end;
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('create policy member_read on public.%I for select to authenticated using(private.is_member(%I))',t,key);
    execute format('grant select on public.%I to authenticated',t);
    if t <> 'weddings' then
      execute format('create policy member_insert on public.%I for insert to authenticated with check(private.is_member(%I))',t,key);
      execute format('grant insert on public.%I to authenticated',t);
    end if;
    if t not in ('payments','contract_amendments') then
      execute format('create policy member_update on public.%I for update to authenticated using(private.is_member(%I)) with check(private.is_member(%I))',t,key,key);
      execute format('grant update on public.%I to authenticated',t);
      execute format('create trigger version_guard before update on public.%I for each row execute function private.guard_edit()',t);
    end if;
  end loop;
end;
$$;
create policy recorder_payment on public.payments as restrictive for insert to authenticated with check(entered_by = (select auth.uid()));
create policy recorder_amendment on public.contract_amendments as restrictive for insert to authenticated with check(entered_by = (select auth.uid()));
-- Explicitly revoke default grants that some projects configure for new public tables.
revoke all on public.weddings, public.wedding_members, public.categories, public.vendors, public.expenses, public.quotes, public.installments, public.payments, public.contract_amendments from anon;
revoke insert,update,delete on public.wedding_members from authenticated;
revoke insert,delete on public.weddings from authenticated;
revoke update,delete on public.payments,public.contract_amendments from authenticated;
revoke delete on public.categories,public.vendors,public.expenses,public.quotes,public.installments from authenticated;

create function public.record_payment(p jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare existing public.payments; payment_id uuid := (p->>'id')::uuid;
begin
  insert into public.payments(id,wedding_id,expense_id,installment_id,kind,amount_cents,paid_on,payer_id,notes)
  values(payment_id,(p->>'wedding_id')::uuid,(p->>'expense_id')::uuid,(p->>'installment_id')::uuid,
    p->>'kind',(p->>'amount_cents')::bigint,(p->>'paid_on')::date,(p->>'payer_id')::uuid,coalesce(p->>'notes',''))
  on conflict(id) do nothing;
  select * into existing from public.payments where id = payment_id;
  if not found or existing.wedding_id <> (p->>'wedding_id')::uuid or existing.expense_id <> (p->>'expense_id')::uuid
    or existing.installment_id is distinct from (p->>'installment_id')::uuid
    or existing.kind <> p->>'kind' or existing.amount_cents <> (p->>'amount_cents')::bigint
    or existing.paid_on <> (p->>'paid_on')::date or existing.payer_id <> (p->>'payer_id')::uuid
    or existing.notes <> coalesce(p->>'notes','') then raise exception 'Payment retry does not match original'; end if;
  return payment_id;
end;
$$;
-- One transaction for purchase + full payment. The caller retains both UUIDs for retries.
create function public.create_expense(e jsonb, p jsonb default null) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare existing public.expenses; expense_id uuid := (e->>'id')::uuid;
begin
  insert into public.expenses(id,wedding_id,category_id,vendor_id,title,target_cents,agreed_cents,notes)
  values(expense_id,(e->>'wedding_id')::uuid,(e->>'category_id')::uuid,(e->>'vendor_id')::uuid,
    e->>'title',(e->>'target_cents')::bigint,(e->>'agreed_cents')::bigint,coalesce(e->>'notes','')) on conflict(id) do nothing;
  select * into existing from public.expenses where id = expense_id;
  if not found or existing.wedding_id <> (e->>'wedding_id')::uuid or existing.title <> e->>'title'
    or existing.category_id <> (e->>'category_id')::uuid or existing.vendor_id is distinct from (e->>'vendor_id')::uuid
    or existing.target_cents is distinct from (e->>'target_cents')::bigint
    or existing.agreed_cents is distinct from (e->>'agreed_cents')::bigint
    or existing.notes <> coalesce(e->>'notes','') then raise exception 'Expense retry does not match original'; end if;
  if p is not null then
    if existing.agreed_cents is null or existing.agreed_cents <= 0 or (p->>'amount_cents')::bigint is distinct from existing.agreed_cents
      or (p->>'expense_id')::uuid is distinct from expense_id or (p->>'wedding_id')::uuid is distinct from existing.wedding_id
      or p->>'kind' is distinct from 'payment' or p->>'installment_id' is not null then
      raise exception 'Paid-in-full payment must match the purchase';
    end if;
    perform public.record_payment(p);
  end if;
  return expense_id;
end;
$$;
-- One MVCC snapshot prevents mixed totals during a concurrent purchase/booking.
create function public.budget_snapshot(w uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
  'wedding',(select to_jsonb(x) from public.weddings x where id = w),
  'members',coalesce((select jsonb_agg(x) from public.wedding_members x where wedding_id=w),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(x order by name) from public.categories x where wedding_id=w),'[]'::jsonb),
  'vendors',coalesce((select jsonb_agg(x order by name) from public.vendors x where wedding_id=w),'[]'::jsonb),
  'expenses',coalesce((select jsonb_agg(x order by title) from public.expenses x where wedding_id=w),'[]'::jsonb),
  'quotes',coalesce((select jsonb_agg(x) from public.quotes x where wedding_id=w),'[]'::jsonb),
  'installments',coalesce((select jsonb_agg(x order by due_date) from public.installments x where wedding_id=w),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(x order by paid_on,created_at) from public.payments x where wedding_id=w),'[]'::jsonb),
  'amendments',coalesce((select jsonb_agg(x order by created_at) from public.contract_amendments x where wedding_id=w),'[]'::jsonb)
);
$$;
revoke all on function public.record_payment(jsonb),public.create_expense(jsonb,jsonb),public.budget_snapshot(uuid) from public,anon;
grant execute on function public.record_payment(jsonb),public.create_expense(jsonb,jsonb),public.budget_snapshot(uuid) to authenticated;
-- Subscribe to row changes; RLS still filters every subscriber's access.
do $$
declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['weddings','categories','vendors','expenses','quotes','installments','payments','contract_amendments','wedding_members'] loop
      execute format('alter publication supabase_realtime add table public.%I',t);
    end loop;
  end if;
end;
$$;
