-- Couple's validated feedback. Review and approve the target before hosted application.
-- Deletion removes records from active snapshots, retaining private history for corrections.
alter table public.weddings add column pinterest_board_url text not null default ''
  check(pinterest_board_url='' or pinterest_board_url ~ '^https://www[.]pinterest[.]com/[^/?#]+/[^/?#]+/$');
alter table public.vendors add column rating integer check(rating between 1 and 5);
alter table public.vendors add column vendor_kind text not null default 'vendor' check(vendor_kind in ('vendor','venue'));
alter table public.guests add column invited_by uuid;
alter table public.guests add foreign key(wedding_id,invited_by) references public.wedding_members(wedding_id,user_id);
alter table public.payments add column version integer not null default 1;
alter table public.contract_amendments alter column agreed_cents drop not null;

create table public.events (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  title text not null check(length(trim(title)) between 1 and 160),
  kind text not null default 'Appointment' check(kind in ('Tour','Tasting','Appointment','Other')),
  event_date date not null, start_time time(0), location text not null default '' check(length(location)<=500),
  vendor_id uuid, notes text not null default '' check(length(notes)<=4000), completed boolean not null default false,
  version integer not null default 1, unique(wedding_id,id),
  foreign key(wedding_id,vendor_id) references public.vendors(wedding_id,id)
);
create index events_wedding_date on public.events(wedding_id,event_date);
create table public.vendor_photos (
  id uuid primary key, wedding_id uuid not null references public.weddings(id), vendor_id uuid not null,
  caption text not null default '' check(length(caption)<=300), storage_path text not null unique,
  version integer not null default 1, unique(wedding_id,id),
  foreign key(wedding_id,vendor_id) references public.vendors(wedding_id,id),
  check(storage_path ~ ('^'||wedding_id::text||'/'||vendor_id::text||'/'||id::text||'[.](jpg|png|webp)$'))
);
create index photos_wedding_vendor on public.vendor_photos(wedding_id,vendor_id);
create table public.record_history (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  table_name text not null, record_id uuid not null, previous jsonb not null, current_record jsonb not null,
  entered_by uuid not null, created_at timestamptz not null default now(),
  foreign key(wedding_id,entered_by) references public.wedding_members(wedding_id,user_id)
);
create index history_record on public.record_history(wedding_id,table_name,record_id,created_at);
alter table public.record_history enable row level security;
revoke all on public.record_history from public,anon,authenticated;
grant select on public.record_history to authenticated;
create policy member_read on public.record_history for select to authenticated using(private.is_member(wedding_id));

-- Only the private trigger may append audit rows; clients cannot fabricate or alter history.
create function private.audit_record() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid := (to_jsonb(new)->>'wedding_id')::uuid;
begin
  if auth.uid() is null or not private.is_member(w) then raise exception 'Wedding membership required'; end if;
  insert into public.record_history(wedding_id,table_name,record_id,previous,current_record,entered_by)
    values(w,tg_table_name,new.id,to_jsonb(old),to_jsonb(new),auth.uid());
  return new;
end; $$;
revoke all on function private.audit_record() from public,anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['categories','vendors','expenses','quotes','installments','payments','invitations','guests','tasks','events','vendor_photos'] loop
    execute format('alter table public.%I add column deleted boolean not null default false',t);
    execute format('create trigger audit_changes after update on public.%I for each row execute function private.audit_record()',t);
    if t in ('events','vendor_photos') then
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
    end if;
  end loop;
end; $$;
grant update on public.payments to authenticated;
alter table public.categories drop constraint categories_wedding_id_name_key;
create unique index categories_active_name on public.categories(wedding_id,name) where not deleted;
create policy member_update on public.payments for update to authenticated
  using(private.is_member(wedding_id)) with check(private.is_member(wedding_id));
create trigger version_guard before update on public.payments for each row execute function private.guard_edit();

create or replace function private.guard_expense() returns trigger language plpgsql set search_path='' as $$
declare chosen public.quotes;
begin
  if new.deleted then return new; end if;
  if new.booked_quote_id is not null then
    select * into chosen from public.quotes where wedding_id=new.wedding_id and id=new.booked_quote_id and expense_id=new.id and not deleted;
    if not found or new.vendor_id is distinct from chosen.vendor_id then raise exception 'Booked quote must match the expense vendor'; end if;
  end if;
  if tg_op='UPDATE' and old.agreed_cents is not null then
    if new.agreed_cents is null then
      if new.booked_quote_id is not null or new.preferred_quote_id is not null or new.vendor_id is distinct from old.vendor_id or length(trim(new.amendment_reason))<3 then
        raise exception 'Unbooking requires a reason and cleared quote selections';
      end if;
      -- Schedules remain for reference but are removed from active payment reminders by the snapshot.
      insert into public.contract_amendments(wedding_id,expense_id,previous_cents,agreed_cents,reason)
        values(new.wedding_id,new.id,old.agreed_cents,null,'Unbooked: '||new.amendment_reason);
    else
      if new.booked_quote_id is distinct from old.booked_quote_id or new.vendor_id is distinct from old.vendor_id then raise exception 'Unbook before changing the booked vendor or quote'; end if;
      if new.agreed_cents<>old.agreed_cents then
        if length(trim(new.amendment_reason))<3 then raise exception 'Explain the contract amendment'; end if;
        insert into public.contract_amendments(wedding_id,expense_id,previous_cents,agreed_cents,reason)
          values(new.wedding_id,new.id,old.agreed_cents,new.agreed_cents,new.amendment_reason);
      end if;
    end if;
  end if;
  new.amendment_reason:=''; return new;
end; $$;
create or replace function private.guard_quote() returns trigger language plpgsql set search_path='' as $$
begin
  if new.expense_id<>old.expense_id or new.vendor_id<>old.vendor_id then raise exception 'Quote links cannot change'; end if;
  if not new.deleted and exists(select 1 from public.expenses where booked_quote_id=old.id and wedding_id=old.wedding_id and not deleted) then
    raise exception 'Booked quotes are preserved; amend or unbook the agreement first';
  end if;
  return new;
end; $$;

-- Serialize related edits against the wedding so a concurrent insert cannot survive a parent deletion.
-- Guards apply to direct REST writes as well as RPCs. Tombstones cannot be revived or edited.
create function private.guard_active_record() returns trigger language plpgsql set search_path='' as $$
declare j jsonb:=to_jsonb(new); parent_table text; parent_id uuid;
begin
  perform 1 from public.weddings where id=new.wedding_id for update;
  if tg_op='UPDATE' then
    if old.deleted then raise exception 'This record was deleted. Refresh and review.'; end if;
    if tg_table_name='payments' and (j->>'entered_by' is distinct from to_jsonb(old)->>'entered_by' or j->>'created_at' is distinct from to_jsonb(old)->>'created_at') then
      raise exception 'Original payment attribution cannot change';
    end if;
  elsif new.deleted then raise exception 'New records cannot start deleted'; end if;
  if new.deleted then return new; end if;
  for parent_table,parent_id in
    select * from (values
      ('categories',case when tg_table_name='expenses' then (j->>'category_id')::uuid end),
      ('vendors',case when tg_table_name in ('expenses','quotes','events','vendor_photos') then (j->>'vendor_id')::uuid end),
      ('expenses',case when tg_table_name in ('quotes','installments','payments') then (j->>'expense_id')::uuid end),
      ('invitations',case when tg_table_name='guests' then (j->>'invitation_id')::uuid end),
      ('installments',case when tg_table_name='payments' then (j->>'installment_id')::uuid end),
      ('quotes',case when tg_table_name='expenses' then (j->>'preferred_quote_id')::uuid end)
    ) as links(t,id) where id is not null
  loop
    declare active boolean; begin
      execute format('select exists(select 1 from public.%I where id=$1 and wedding_id=$2 and not deleted)',parent_table) into active using parent_id,new.wedding_id;
      if not active then raise exception 'Related record is unavailable. Refresh and review.'; end if;
    end;
  end loop;
  return new;
end; $$;

create function private.cascade_deleted() returns trigger language plpgsql set search_path='' as $$
begin
  if not new.deleted or old.deleted then return new; end if;
  if tg_table_name='categories' then
    update public.expenses set deleted=true where category_id=new.id and wedding_id=new.wedding_id and not deleted;
  elsif tg_table_name='vendors' then
    update public.expenses set deleted=true where vendor_id=new.id and wedding_id=new.wedding_id and not deleted;
    update public.quotes set deleted=true where vendor_id=new.id and wedding_id=new.wedding_id and not deleted;
    update public.vendor_photos set deleted=true where vendor_id=new.id and wedding_id=new.wedding_id and not deleted;
    update public.events set vendor_id=null where vendor_id=new.id and wedding_id=new.wedding_id and not deleted;
  elsif tg_table_name='expenses' then
    update public.quotes set deleted=true where expense_id=new.id and wedding_id=new.wedding_id and not deleted;
    update public.payments set deleted=true where expense_id=new.id and wedding_id=new.wedding_id and not deleted;
    update public.installments set deleted=true where expense_id=new.id and wedding_id=new.wedding_id and not deleted;
  elsif tg_table_name='invitations' then
    update public.guests set deleted=true where invitation_id=new.id and wedding_id=new.wedding_id and not deleted;
  elsif tg_table_name='installments' then
    update public.payments set installment_id=null where installment_id=new.id and wedding_id=new.wedding_id and not deleted;
  elsif tg_table_name='quotes' then
    if exists(select 1 from public.expenses where booked_quote_id=new.id and wedding_id=new.wedding_id and not deleted) then raise exception 'Unbook this agreement before deleting its booked quote'; end if;
    update public.expenses set preferred_quote_id=null where preferred_quote_id=new.id and wedding_id=new.wedding_id and not deleted;
  end if;
  return new;
end; $$;
do $$ declare t text; begin
  foreach t in array array['categories','vendors','expenses','quotes','installments','payments','invitations','guests','tasks','events','vendor_photos'] loop
    execute format('create trigger active_guard before insert or update on public.%I for each row execute function private.guard_active_record()',t);
    execute format('create trigger cascade_deletion after update on public.%I for each row execute function private.cascade_deleted()',t);
  end loop;
end; $$;

-- Version filtering and tombstone short-circuit make retrying a deletion harmless.
create function public.delete_record(t text,r uuid,v integer) returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
  if t not in ('categories','vendors','expenses','quotes','installments','payments','invitations','guests','tasks','events','vendor_photos') then raise exception 'Unsupported record'; end if;
  execute format('select to_jsonb(x) from public.%I x where id=$1',t) into item using r;
  if item is null then raise exception 'Record unavailable'; end if;
  perform 1 from public.weddings where id=(item->>'wedding_id')::uuid for update;
  execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into item using r;
  if (item->>'deleted')::boolean then return; end if;
  if (item->>'version')::integer is distinct from v then raise exception 'Someone changed this record. Reopen it and review the latest values.'; end if;
  execute format('update public.%I set deleted=true where id=$1',t) using r;
end; $$;
revoke all on function public.delete_record(text,uuid,integer) from public,anon;
grant execute on function public.delete_record(text,uuid,integer) to authenticated;

create or replace function public.budget_snapshot(w uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'planner_ready',true,'feedback_ready',true,
  'wedding',(select to_jsonb(x) from public.weddings x where id=w),
  'members',coalesce((select jsonb_agg(x) from public.wedding_members x where wedding_id=w),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(x order by name) from public.categories x where wedding_id=w and not deleted),'[]'::jsonb),
  'vendors',coalesce((select jsonb_agg(x order by rating desc nulls last,name) from public.vendors x where wedding_id=w and not deleted),'[]'::jsonb),
  'expenses',coalesce((select jsonb_agg(x order by title) from public.expenses x where wedding_id=w and not deleted),'[]'::jsonb),
  'quotes',coalesce((select jsonb_agg(x) from public.quotes x where wedding_id=w and not deleted),'[]'::jsonb),
  'installments',coalesce((select jsonb_agg(x order by due_date) from public.installments x where wedding_id=w and not deleted and exists(select 1 from public.expenses e where e.id=x.expense_id and e.agreed_cents is not null and not e.deleted)),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(x order by paid_on,created_at) from public.payments x where wedding_id=w and not deleted),'[]'::jsonb),
  'amendments',coalesce((select jsonb_agg(x order by created_at) from public.contract_amendments x where wedding_id=w),'[]'::jsonb),
  'invitations',coalesce((select jsonb_agg(x order by household_name) from public.invitations x where wedding_id=w and not deleted),'[]'::jsonb),
  'guests',coalesce((select jsonb_agg(x order by name nulls last,id) from public.guests x where wedding_id=w and not deleted),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(x order by title) from public.tasks x where wedding_id=w and not deleted),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(x order by event_date,start_time) from public.events x where wedding_id=w and not deleted),'[]'::jsonb),
  'vendor_photos',coalesce((select jsonb_agg(x) from public.vendor_photos x where wedding_id=w and not deleted),'[]'::jsonb)
); $$;

-- Private, membership-scoped photos. No public bucket or anonymous photo access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vendor-photos','vendor-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create function private.can_access_photo(path text) returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.vendors v where v.wedding_id::text=split_part(path,'/',1)
    and v.id::text=split_part(path,'/',2) and not v.deleted and private.is_member(v.wedding_id))
    and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$';
$$;
revoke all on function private.can_access_photo(text) from public,anon;
grant execute on function private.can_access_photo(text) to authenticated;
create policy wedding_photo_read on storage.objects for select to authenticated
  using(bucket_id='vendor-photos' and private.can_access_photo(name));
create policy wedding_photo_insert on storage.objects for insert to authenticated
  with check(bucket_id='vendor-photos' and private.can_access_photo(name));
create policy wedding_photo_update on storage.objects for update to authenticated
  using(bucket_id='vendor-photos' and private.can_access_photo(name))
  with check(bucket_id='vendor-photos' and private.can_access_photo(name));

create or replace function public.create_household(i jsonb, g jsonb) returns uuid
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
    insert into public.guests(id,wedding_id,invitation_id,name,is_companion,tag,invited_by)
    values((person->>'id')::uuid,wedding,invitation_id,nullif(trim(person->>'name'),''),
      coalesce((person->>'is_companion')::boolean,false),coalesce(person->>'tag',''),(person->>'invited_by')::uuid) on conflict(id) do nothing;
    select * into guest from public.guests where id=(person->>'id')::uuid;
    if not found or guest.wedding_id is distinct from wedding or guest.invitation_id is distinct from invitation_id
      or guest.name is distinct from nullif(trim(person->>'name'),'')
      or guest.invited_by is distinct from (person->>'invited_by')::uuid
      or guest.is_companion is distinct from coalesce((person->>'is_companion')::boolean,false) then
      raise exception 'Guest retry differs from original; refresh and review';
    end if;
  end loop;
  return invitation_id;
end;
$$;
