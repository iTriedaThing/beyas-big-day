-- Interactive menu. Additive; no sample data. Hosted application needs explicit approval.
create table public.menu_courses (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  name text not null check(length(trim(name)) between 1 and 100),
  sort_order integer not null default 0 check(sort_order between 0 and 1000),
  choices_offered boolean not null default true,
  deleted boolean not null default false, version integer not null default 1, unique(wedding_id,id)
);
create unique index menu_course_name on public.menu_courses(wedding_id,lower(name)) where not deleted;
create table public.menu_options (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id), course_id uuid not null,
  name text not null check(length(trim(name)) between 1 and 160), selected boolean not null default false,
  rating integer check(rating between 1 and 5), vendor_id uuid,
  pricing_basis text not null default 'per_person' check(pricing_basis in ('fixed','per_person','per_choice','per_quantity')),
  unit_cents bigint check(unit_cents between 0 and 1000000000), quantity integer not null default 1 check(quantity between 0 and 100000),
  unit text not null default 'serving' check(length(trim(unit)) between 1 and 60), notes text not null default '' check(length(notes)<=4000),
  photo_path text, deleted boolean not null default false, version integer not null default 1,
  unique(wedding_id,id), unique(wedding_id,course_id,id),
  foreign key(wedding_id,course_id) references public.menu_courses(wedding_id,id),
  foreign key(wedding_id,vendor_id) references public.vendors(wedding_id,id),
  check(photo_path is null or photo_path ~ ('^'||wedding_id::text||'/'||id::text||'/[0-9a-f-]{36}[.](jpg|png|webp)$')),
  check(pricing_basis<>'per_quantity' or unit_cents*quantity<=1000000000)
);
create index menu_options_course on public.menu_options(wedding_id,course_id);
create index menu_options_vendor on public.menu_options(wedding_id,vendor_id);
create table public.guest_meals (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  guest_id uuid not null, course_id uuid not null, option_id uuid,
  deleted boolean not null default false, version integer not null default 1,
  unique(wedding_id,id), unique(wedding_id,guest_id,course_id),
  foreign key(wedding_id,guest_id) references public.guests(wedding_id,id),
  foreign key(wedding_id,course_id) references public.menu_courses(wedding_id,id),
  foreign key(wedding_id,course_id,option_id) references public.menu_options(wedding_id,course_id,id)
);
create index guest_meals_course_option on public.guest_meals(wedding_id,course_id,option_id);
alter table public.weddings add column menu_expense_id uuid;
alter table public.weddings add foreign key(id,menu_expense_id) references public.expenses(wedding_id,id);
-- A table label supports a caterer's manifest before the later visual seating planner exists.
alter table public.guests add column meal_table text not null default '' check(length(meal_table)<=100);

create function private.guard_menu_record() returns trigger language plpgsql set search_path='' as $$
declare g public.guests; c public.menu_courses;
begin
  if new.deleted then return new; end if;
  if tg_table_name in ('menu_options','guest_meals') then
    select * into c from public.menu_courses where wedding_id=new.wedding_id and id=new.course_id and not deleted;
    if c.id is null then raise exception 'Course unavailable. Refresh and review.'; end if;
  end if;
  if tg_table_name='menu_options' then
    if new.vendor_id is not null and not exists(select 1 from public.vendors where wedding_id=new.wedding_id and id=new.vendor_id and not deleted) then raise exception 'Vendor unavailable'; end if;
    if new.pricing_basis='per_choice' and not c.choices_offered then raise exception 'Per-choice pricing requires a course with guest choices'; end if;
  elsif tg_table_name='guest_meals' then
    if tg_op='UPDATE' and (new.guest_id<>old.guest_id or new.course_id<>old.course_id) then raise exception 'Meal guest and course cannot change'; end if;
    select * into g from public.guests where wedding_id=new.wedding_id and id=new.guest_id and not deleted and not archived and rsvp='yes';
    if g.id is null or not exists(select 1 from public.invitations where wedding_id=new.wedding_id and id=g.invitation_id and not deleted and not archived) then raise exception 'Only active attending guests can choose meals'; end if;
    if not c.choices_offered then raise exception 'This course does not offer individual choices'; end if;
    if new.option_id is not null and not exists(select 1 from public.menu_options where wedding_id=new.wedding_id and id=new.option_id and course_id=new.course_id and selected and not deleted) then raise exception 'Choose a selected dish in this course, or leave choice pending'; end if;
  elsif tg_table_name='menu_courses' and not new.choices_offered and exists(select 1 from public.menu_options where wedding_id=new.wedding_id and course_id=new.id and not deleted and pricing_basis='per_choice') then
    raise exception 'Change per-choice dish pricing before turning off guest choices';
  end if;
  return new;
end; $$;
do $$ declare t text; begin
  foreach t in array array['menu_courses','menu_options','guest_meals'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
    execute format('create policy member_read on public.%I for select to authenticated using(private.is_member(wedding_id))',t);
    execute format('create policy member_insert on public.%I for insert to authenticated with check(private.is_member(wedding_id))',t);
    execute format('create policy member_update on public.%I for update to authenticated using(private.is_member(wedding_id)) with check(private.is_member(wedding_id))',t);
    execute format('create trigger active_guard before insert or update on public.%I for each row execute function private.guard_active_record()',t);
    execute format('create trigger menu_guard before insert or update on public.%I for each row execute function private.guard_menu_record()',t);
    execute format('create trigger version_guard before update on public.%I for each row execute function private.guard_edit()',t);
    execute format('create trigger audit_changes after update on public.%I for each row execute function private.audit_record()',t);
  end loop;
end; $$;
create function private.guard_menu_expense() returns trigger language plpgsql set search_path='' as $$
begin
  if new.currency is distinct from old.currency and exists(select 1 from public.menu_options where wedding_id=new.id and not deleted and unit_cents is not null) then
    raise exception 'Currency is fixed after recording menu prices';
  end if;
  if new.menu_expense_id is not null and not exists(select 1 from public.expenses where wedding_id=new.id and id=new.menu_expense_id and not deleted) then raise exception 'Catering expense unavailable'; end if;
  return new;
end; $$;
create trigger menu_expense_guard before update on public.weddings for each row execute function private.guard_menu_expense();
create function private.menu_cleanup() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='vendors' then
    update public.menu_options set vendor_id=null where wedding_id=new.wedding_id and vendor_id=new.id and not deleted;
  elsif tg_table_name='expenses' then
    update public.weddings set menu_expense_id=null where id=new.wedding_id and menu_expense_id=new.id;
  elsif tg_table_name='menu_courses' then
    update public.menu_options set deleted=true where wedding_id=new.wedding_id and course_id=new.id and not deleted;
  end if;
  -- Choices are retained as history. Invalid/declined/archived choices are excluded from current counts.
  return new;
end; $$;
create trigger menu_vendor_cleanup after update on public.vendors for each row when(new.deleted and not old.deleted) execute function private.menu_cleanup();
create trigger menu_expense_cleanup after update on public.expenses for each row when(new.deleted and not old.deleted) execute function private.menu_cleanup();
create trigger menu_course_cleanup after update on public.menu_courses for each row when(new.deleted and not old.deleted) execute function private.menu_cleanup();

-- The single estimate is calculated with integer cents under the caller's membership RLS.
create function private.menu_estimate(w uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  with diners as (
    select g.id from public.guests g join public.invitations i on i.wedding_id=g.wedding_id and i.id=g.invitation_id
    where g.wedding_id=w and not g.deleted and not g.archived and g.rsvp='yes' and not i.deleted and not i.archived
  ), costs as (
    select o.unit_cents * case o.pricing_basis when 'fixed' then 1 when 'per_quantity' then o.quantity
      when 'per_person' then (select planning_headcount from public.weddings where id=w)
      when 'per_choice' then (select count(*) from public.guest_meals m join diners d on d.id=m.guest_id where m.wedding_id=w and m.course_id=o.course_id and m.option_id=o.id and not m.deleted) end as cost,
      o.unit_cents is null or (o.pricing_basis='per_person' and (select planning_headcount from public.weddings where id=w) is null)
      or (o.pricing_basis='per_choice' and exists(select 1 from diners d where not exists(
        select 1 from public.guest_meals m join public.menu_options chosen on chosen.wedding_id=m.wedding_id and chosen.id=m.option_id
        where m.wedding_id=w and m.guest_id=d.id and m.course_id=o.course_id and not m.deleted and chosen.selected and not chosen.deleted))) as unknown
    from public.menu_options o join public.menu_courses c on c.wedding_id=o.wedding_id and c.id=o.course_id
    where o.wedding_id=w and o.selected and not o.deleted and not c.deleted
  ) select jsonb_build_object('cents',case when count(*)=0 or bool_or(unknown) or sum(cost)>1000000000 then null else sum(cost) end,
    'known_cents',coalesce(sum(cost),0),'selected',count(*),'overflow',coalesce(sum(cost)>1000000000,false)) from costs;
$$;
revoke all on function private.menu_estimate(uuid) from public,anon;
grant execute on function private.menu_estimate(uuid) to authenticated;
alter function public.budget_snapshot(uuid) rename to itinerary_snapshot;
alter function public.itinerary_snapshot(uuid) set schema private;
revoke all on function private.itinerary_snapshot(uuid) from public,anon;
grant execute on function private.itinerary_snapshot(uuid) to authenticated;
create function public.budget_snapshot(w uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  with base as (select private.itinerary_snapshot(w) as b), estimate as (select private.menu_estimate(w) as e)
  select b||jsonb_build_object('menu_ready',true,'menu_estimate',e,
    'menu_courses',coalesce((select jsonb_agg(x order by sort_order,name,id) from public.menu_courses x where wedding_id=w and not deleted),'[]'::jsonb),
    'menu_options',coalesce((select jsonb_agg(x order by name,id) from public.menu_options x where wedding_id=w and not deleted),'[]'::jsonb),
    'guest_meals',coalesce((select jsonb_agg(x) from public.guest_meals x where wedding_id=w and not deleted),'[]'::jsonb),
    'expenses',coalesce((select jsonb_agg(x||case when x->>'id'=b->'wedding'->>'menu_expense_id' then jsonb_build_object('menu_linked',true,'menu_estimate_cents',e->'cents') else '{}'::jsonb end)
      from jsonb_array_elements(b->'expenses') x),'[]'::jsonb)) from base,estimate;
$$;
revoke all on function public.budget_snapshot(uuid) from public,anon;
grant execute on function public.budget_snapshot(uuid) to authenticated;
create or replace function public.delete_record(t text,r uuid,v integer) returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
  if t not in ('categories','vendors','expenses','quotes','installments','payments','invitations','guests','tasks','events','vendor_photos','itinerary_items','menu_courses','menu_options') then raise exception 'Unsupported record'; end if;
  execute format('select to_jsonb(x) from public.%I x where id=$1',t) into item using r;
  if item is null then raise exception 'Record unavailable'; end if;
  perform 1 from public.weddings where id=(item->>'wedding_id')::uuid for update;
  execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into item using r;
  if (item->>'deleted')::boolean then return; end if;
  if (item->>'version')::integer is distinct from v then raise exception 'Someone changed this record. Reopen it and review the latest values.'; end if;
  execute format('update public.%I set deleted=true where id=$1',t) using r;
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('menu-photos','menu-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create function private.can_access_menu_photo(path text) returns boolean language sql stable security invoker set search_path='' as $$
  select path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
    and exists(select 1 from public.menu_options o join public.menu_courses c on c.wedding_id=o.wedding_id and c.id=o.course_id
      where o.wedding_id::text=split_part(path,'/',1) and o.id::text=split_part(path,'/',2) and not o.deleted and not c.deleted and private.is_member(o.wedding_id));
$$;
revoke all on function private.can_access_menu_photo(text) from public,anon;
grant execute on function private.can_access_menu_photo(text) to authenticated;
create policy menu_photo_read on storage.objects for select to authenticated using(bucket_id='menu-photos' and private.can_access_menu_photo(name));
create policy menu_photo_insert on storage.objects for insert to authenticated with check(bucket_id='menu-photos' and private.can_access_menu_photo(name));
create policy menu_photo_update on storage.objects for update to authenticated using(bucket_id='menu-photos' and private.can_access_menu_photo(name)) with check(bucket_id='menu-photos' and private.can_access_menu_photo(name));
do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['menu_courses','menu_options','guest_meals'] loop execute format('alter publication supabase_realtime add table public.%I',t); end loop;
  end if;
end; $$;
