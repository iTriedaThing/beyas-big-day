-- Additive planner release. Existing budget records and agreements are unchanged.
alter table public.weddings add column planning_headcount integer check(planning_headcount between 0 and 100000);

create table public.invitations (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  household_name text not null check(length(trim(household_name)) between 1 and 160),
  contact_email text not null default '' check(length(contact_email)<=254),
  phone text not null default '' check(length(phone)<=100),
  mailing_address text not null default '' check(length(mailing_address)<=1000),
  save_the_date_sent_on date, invitation_sent_on date,
  notes text not null default '' check(length(notes)<=4000),
  archived boolean not null default false, version integer not null default 1,
  unique(wedding_id,id)
);
create table public.guests (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  invitation_id uuid not null, name text check(length(trim(name)) between 1 and 120),
  is_companion boolean not null default false,
  rsvp text not null default 'pending' check(rsvp in ('pending','yes','no')),
  tag text not null default '' check(length(tag)<=100), gift_received boolean not null default false,
  dietary_flags text[] not null default '{}' check(dietary_flags <@ array['vegetarian','vegan','gluten_free','dairy_free','nut_allergy','other']::text[] and cardinality(dietary_flags)<=6),
  dietary_notes text not null default '' check(length(dietary_notes)<=2000),
  caterer_confirmation text not null default '' check(length(caterer_confirmation)<=2000),
  archived boolean not null default false, version integer not null default 1,
  check(name is not null or is_companion), unique(wedding_id,id),
  foreign key(wedding_id,invitation_id) references public.invitations(wedding_id,id)
);
create index guests_household on public.guests(wedding_id,invitation_id);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  title text not null check(length(trim(title)) between 1 and 160),
  planning_window text not null check(planning_window in ('12_plus','9_12','6_9','4_6','2_4','1_2','last_month','last_week','two_days','day_before','wedding_day','after')),
  due_date date, assignee_id uuid, completed boolean not null default false,
  notes text not null default '' check(length(notes)<=4000),
  starter_key text check(length(starter_key) between 1 and 100),
  archived boolean not null default false, version integer not null default 1,
  unique(wedding_id,id), unique(wedding_id,starter_key),
  foreign key(wedding_id,assignee_id) references public.wedding_members(wedding_id,user_id)
);
create index tasks_wedding_due on public.tasks(wedding_id,due_date);
do $$ declare t text; begin
  foreach t in array array['invitations','guests','tasks'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
    execute format('create policy member_read on public.%I for select to authenticated using(private.is_member(wedding_id))',t);
    execute format('create policy member_insert on public.%I for insert to authenticated with check(private.is_member(wedding_id))',t);
    execute format('create policy member_update on public.%I for update to authenticated using(private.is_member(wedding_id)) with check(private.is_member(wedding_id))',t);
    execute format('create trigger version_guard before update on public.%I for each row execute function private.guard_edit()',t);
    if exists(select 1 from pg_publication where pubname='supabase_realtime') then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end; $$;

-- A household and its individual seats are saved atomically. Stable client IDs make retries safe.
create function public.create_household(i jsonb, g jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare invitation public.invitations; guest public.guests; person jsonb;
  invitation_id uuid := (i->>'id')::uuid; wedding uuid := (i->>'wedding_id')::uuid;
begin
  if jsonb_typeof(g) is distinct from 'array' or jsonb_array_length(g) not between 1 and 50 then
    raise exception 'A household must contain 1–50 individual guests';
  end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(g)) <> jsonb_array_length(g) then
    raise exception 'Each guest needs a distinct client ID';
  end if;
  insert into public.invitations(id,wedding_id,household_name,contact_email,phone,mailing_address,save_the_date_sent_on,invitation_sent_on,notes)
  values(invitation_id,wedding,trim(i->>'household_name'),coalesce(i->>'contact_email',''),coalesce(i->>'phone',''),
    coalesce(i->>'mailing_address',''),(i->>'save_the_date_sent_on')::date,(i->>'invitation_sent_on')::date,coalesce(i->>'notes',''))
  on conflict(id) do nothing;
  select * into invitation from public.invitations where id=invitation_id;
  if not found or invitation.wedding_id is distinct from wedding or invitation.household_name is distinct from trim(i->>'household_name')
    or invitation.contact_email <> coalesce(i->>'contact_email','') or invitation.phone <> coalesce(i->>'phone','')
    or invitation.mailing_address <> coalesce(i->>'mailing_address','') or invitation.notes <> coalesce(i->>'notes','')
    or invitation.save_the_date_sent_on is distinct from (i->>'save_the_date_sent_on')::date
    or invitation.invitation_sent_on is distinct from (i->>'invitation_sent_on')::date then
    raise exception 'Household retry differs from original; refresh and review';
  end if;
  for person in select value from jsonb_array_elements(g) loop
    insert into public.guests(id,wedding_id,invitation_id,name,is_companion,tag)
    values((person->>'id')::uuid,wedding,invitation_id,nullif(trim(person->>'name'),''),
      coalesce((person->>'is_companion')::boolean,false),coalesce(person->>'tag','')) on conflict(id) do nothing;
    select * into guest from public.guests where id=(person->>'id')::uuid;
    if not found or guest.wedding_id is distinct from wedding or guest.invitation_id is distinct from invitation_id
      or guest.name is distinct from nullif(trim(person->>'name'),'')
      or guest.is_companion is distinct from coalesce((person->>'is_companion')::boolean,false) then
      raise exception 'Guest retry differs from original; refresh and review';
    end if;
  end loop;
  return invitation_id;
end;
$$;
revoke all on function public.create_household(jsonb,jsonb) from public,anon;
grant execute on function public.create_household(jsonb,jsonb) to authenticated;

create or replace function public.budget_snapshot(w uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
  'planner_ready',true,
  'wedding',(select to_jsonb(x) from public.weddings x where id=w),
  'members',coalesce((select jsonb_agg(x) from public.wedding_members x where wedding_id=w),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(x order by name) from public.categories x where wedding_id=w),'[]'::jsonb),
  'vendors',coalesce((select jsonb_agg(x order by name) from public.vendors x where wedding_id=w),'[]'::jsonb),
  'expenses',coalesce((select jsonb_agg(x order by title) from public.expenses x where wedding_id=w),'[]'::jsonb),
  'quotes',coalesce((select jsonb_agg(x) from public.quotes x where wedding_id=w),'[]'::jsonb),
  'installments',coalesce((select jsonb_agg(x order by due_date) from public.installments x where wedding_id=w),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(x order by paid_on,created_at) from public.payments x where wedding_id=w),'[]'::jsonb),
  'amendments',coalesce((select jsonb_agg(x order by created_at) from public.contract_amendments x where wedding_id=w),'[]'::jsonb),
  'invitations',coalesce((select jsonb_agg(x order by household_name) from public.invitations x where wedding_id=w),'[]'::jsonb),
  'guests',coalesce((select jsonb_agg(x order by name nulls last,id) from public.guests x where wedding_id=w),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(x order by title) from public.tasks x where wedding_id=w),'[]'::jsonb)
);
$$;
revoke all on function public.budget_snapshot(uuid) from public,anon;
grant execute on function public.budget_snapshot(uuid) to authenticated;
