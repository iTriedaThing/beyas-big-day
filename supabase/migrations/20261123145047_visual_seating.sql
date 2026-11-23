-- One ordered room layout per event. Only the checked, transactional command can write.
create table public.seating_units (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id),
  event text not null check (event in ('ceremony','reception')),
  label text not null check (length(trim(label)) between 1 and 100),
  shape text not null check (shape in ('row','round','square','rectangle')),
  capacity integer not null check (capacity > 0),
  position integer not null check (position > 0),
  reserved boolean not null default false,
  check ((event='ceremony') = (shape='row')),
  check (not reserved or event='ceremony'),
  unique (wedding_id,event,id), unique (wedding_id,event,label)
);
create table public.seating_placements (
  wedding_id uuid not null, event text not null, unit_id uuid not null, guest_id uuid not null,
  seat integer check (seat > 0),
  primary key (wedding_id,event,guest_id), unique (unit_id,seat),
  foreign key (wedding_id,event,unit_id) references public.seating_units(wedding_id,event,id) on delete cascade,
  foreign key (wedding_id,guest_id) references public.guests(wedding_id,id)
);
create index seating_placements_guest on public.seating_placements(wedding_id,guest_id);
-- Small receipts support optimistic edits, retry after lost responses and Realtime.
create table public.seating_changes (
  wedding_id uuid not null references public.weddings(id), event text not null,
  revision bigint not null, request_id uuid not null default gen_random_uuid(),
  primary key(wedding_id,event,revision), unique(wedding_id,event,request_id)
);
do $$ declare t text; begin
  foreach t in array array['seating_units','seating_placements','seating_changes'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy member_read on public.%I for select to authenticated using(private.is_member(wedding_id))',t);
  end loop;
  if exists(select from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.seating_changes;
  end if;
end $$;

-- Preserve the active guest list's existing caterer assignments, including pending companions.
with labels as (
  select g.wedding_id,trim(g.meal_table) label,count(*)::integer capacity
  from public.guests g join public.invitations i on i.id=g.invitation_id
  where not (g.deleted or g.archived or i.deleted or i.archived) and g.rsvp<>'no' and trim(g.meal_table)<>''
  group by g.wedding_id,trim(g.meal_table)
)
insert into public.seating_units(wedding_id,event,label,shape,capacity,position)
select wedding_id,'reception',label,'round',capacity,row_number() over(partition by wedding_id order by label)
from labels;
insert into public.seating_placements(wedding_id,event,unit_id,guest_id)
select u.wedding_id,u.event,u.id,g.id from public.seating_units u
join public.guests g on g.wedding_id=u.wedding_id and trim(g.meal_table)=u.label
join public.invitations i on i.id=g.invitation_id
where not (g.deleted or g.archived or i.deleted or i.archived) and g.rsvp<>'no';

create function private.apply_seating(w uuid, plan text, expected bigint, request_id uuid, command jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  action text := command->>'action';
  unit public.seating_units;
  target uuid := (command->>'unit_id')::uuid;
  revision_now bigint;
  n integer; next_position integer; sequence_no integer; new_label text;
  capacity_new integer := (command->>'capacity')::int;
  place integer := (command->>'position')::int;
  seat_no integer := (command->>'seat')::int;
  members uuid[]; person uuid := (command->>'guest_id')::uuid;
  numbered_guest uuid := (command->>'number_guest_id')::uuid;
begin
  if auth.uid() is null or not private.is_member(w) then raise exception 'Wedding unavailable'; end if;
  if plan is null or plan not in ('ceremony','reception') or request_id is null then raise exception 'Invalid seating request'; end if;
  -- Guest/invitation writes also acquire this lock through their existing active_guard.
  perform 1 from public.weddings where id=w for update;
  if exists(select from public.seating_changes c where c.wedding_id=w and c.event=plan and c.request_id=apply_seating.request_id) then return; end if;
  select coalesce(max(revision),0) into revision_now from public.seating_changes where wedding_id=w and event=plan;
  if expected is distinct from revision_now then raise exception 'The seating plan changed. Refresh and reopen it before saving.'; end if;
  if target is not null then
    select * into unit from public.seating_units where wedding_id=w and event=plan and id=target;
    if not found then raise exception 'Row or table unavailable'; end if;
  end if;
  if action='add' then
    n := (command->>'quantity')::int;
    if n is null or n not between 1 and 200 then raise exception 'Add between 1 and 200 at a time'; end if;
    select coalesce(max(position),0)+1 into next_position from public.seating_units where wedding_id=w and event=plan;
    sequence_no := next_position;
    for idx in 1..n loop
      loop
        new_label := case plan when 'ceremony' then 'Row ' else 'Table ' end || sequence_no;
        sequence_no := sequence_no+1;
        exit when not exists(select from public.seating_units where wedding_id=w and event=plan and label=new_label);
      end loop;
      insert into public.seating_units(wedding_id,event,label,capacity,shape,position,reserved)
      values(w,plan,new_label,capacity_new,command->>'shape',next_position+idx-1,coalesce((command->>'reserved')::boolean,false));
    end loop;
  elsif action='edit' and target is not null then
    if capacity_new < (select count(*) from public.seating_placements where unit_id=target)
       or exists(select from public.seating_placements where unit_id=target and seat>capacity_new)
    then raise exception 'Move guests or clear higher seat numbers before reducing capacity'; end if;
    select count(*) into n from public.seating_units where wedding_id=w and event=plan;
    if place is null or place not between 1 and n then raise exception 'Choose a position in the plan'; end if;
    update public.seating_units set position=position+case when place<unit.position then 1 else -1 end
    where wedding_id=w and event=plan and id<>target and position between least(place,unit.position) and greatest(place,unit.position);
    update public.seating_units set position=place,label=trim(command->>'label'),capacity=capacity_new,
      shape=command->>'shape',reserved=coalesce((command->>'reserved')::boolean,false) where id=target;
  elsif action='delete' and target is not null then
    delete from public.seating_units where id=target;
    update public.seating_units set position=position-1 where wedding_id=w and event=plan and position>unit.position;
  elsif action='assign' then
    select array_agg(g.id) into members from public.guests g join public.invitations i on i.id=g.invitation_id
    where g.wedding_id=w and i.id=(command->>'household_id')::uuid and not (g.deleted or g.archived or i.deleted or i.archived)
      and g.rsvp<>'no' and (person is null or g.id=person);
    if members is null then raise exception 'Choose an active household or guest'; end if;
    if person is not null and not coalesce((command->>'split')::boolean,false) then raise exception 'Choose Split household to move one person'; end if;
    if target is not null and unit.capacity < cardinality(members)+(select count(*) from public.seating_placements where unit_id=target and not (guest_id=any(members)))
    then raise exception 'This group needs more open seats. The previous assignments have been kept.'; end if;
    -- Preserve numbered seats of household members already at the destination.
    delete from public.seating_placements where wedding_id=w and event=plan and guest_id=any(members) and unit_id is distinct from target;
    if target is not null then
      insert into public.seating_placements(wedding_id,event,unit_id,guest_id)
      select w,plan,target,unnest(members) on conflict(wedding_id,event,guest_id) do nothing;
    end if;
    if seat_no is not null then
      if target is null or numbered_guest is null or not (numbered_guest=any(members)) then
        raise exception 'Choose a guest from this household for the numbered seat';
      end if;
    end if;
  elsif action='number' and target is not null then
    numbered_guest := person;
  else raise exception 'Unsupported seating change';
  end if;
  if action='number' or (action='assign' and seat_no is not null) then
    if seat_no is not null and (seat_no not between 1 and unit.capacity or exists(
      select from public.seating_placements where unit_id=target and seat=seat_no and guest_id<>numbered_guest))
    then raise exception 'Choose an available seat within capacity'; end if;
    update public.seating_placements set seat=seat_no where unit_id=target and guest_id=numbered_guest;
    if not found then raise exception 'Assign this guest to the row or table first'; end if;
  end if;
  insert into public.seating_changes values(w,plan,revision_now+1,request_id);
end $$;
revoke all on function private.apply_seating(uuid,text,bigint,uuid,jsonb) from public,anon;
grant execute on function private.apply_seating(uuid,text,bigint,uuid,jsonb) to authenticated;
create function public.change_seating(w uuid,plan text,expected bigint,request_id uuid,command jsonb)
returns void language sql security invoker set search_path='' as $$
  select private.apply_seating(w,plan,expected,request_id,command);
$$;
revoke all on function public.change_seating(uuid,text,bigint,uuid,jsonb) from public,anon;
grant execute on function public.change_seating(uuid,text,bigint,uuid,jsonb) to authenticated;

create function private.release_seating() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='guests' then
    if not (new.deleted or new.archived or new.rsvp='no') and exists(
      select from public.invitations i where i.id=new.invitation_id and not (i.deleted or i.archived)
    ) then return new; end if;
  end if;
  with released as (
    delete from public.seating_placements p using public.guests g
    where p.wedding_id=new.wedding_id and p.guest_id=g.id and
      ((tg_table_name='guests' and g.id=new.id) or (tg_table_name='invitations' and g.invitation_id=new.id))
    returning p.event
  )
  insert into public.seating_changes(wedding_id,event,revision)
  select new.wedding_id,r.event,1+coalesce((select max(c.revision) from public.seating_changes c where c.wedding_id=new.wedding_id and c.event=r.event),0)
  from (select distinct event from released) r;
  return new;
end $$;
revoke all on function private.release_seating() from public,anon,authenticated;
create trigger release_guest_seating after update on public.guests for each row
when (new.deleted or new.archived or new.rsvp='no' or new.invitation_id<>old.invitation_id) execute function private.release_seating();
create trigger release_household_seating after update on public.invitations for each row
when (new.deleted or new.archived) execute function private.release_seating();

-- Older open guest editors may still submit the retired free-text field.
create function private.check_legacy_table() returns trigger language plpgsql set search_path='' as $$
declare current_label text;
begin
  select u.label into current_label from public.seating_placements p join public.seating_units u on u.id=p.unit_id
  where p.wedding_id=new.wedding_id and p.event='reception' and p.guest_id=new.id;
  if new.meal_table is distinct from coalesce(current_label,'') then
    raise exception 'Use the seating chart to change a reception table. Refresh and reopen the guest.';
  end if;
  return new;
end $$;
create trigger legacy_guest_table before insert or update of meal_table on public.guests for each row
execute function private.check_legacy_table();

alter function public.budget_snapshot(uuid) rename to menu_snapshot;
alter function public.menu_snapshot(uuid) set schema private;
create function public.budget_snapshot(w uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  with base as (select private.menu_snapshot(w) b)
  select b||jsonb_build_object('seating_ready',true,
    'seating_revisions',coalesce((select jsonb_object_agg(event,rev) from
      (select event,max(revision) rev from public.seating_changes where wedding_id=w group by event) r),'{}'::jsonb),
    'seating_units',coalesce((select jsonb_agg(u order by position) from public.seating_units u where wedding_id=w),'[]'::jsonb),
    'seating_placements',coalesce((select jsonb_agg(p) from public.seating_placements p where wedding_id=w),'[]'::jsonb),
    'guests',coalesce((select jsonb_agg(g||jsonb_build_object('meal_table',coalesce(u.label,'')) order by ord)
      from jsonb_array_elements(b->'guests') with ordinality as guests(g,ord)
      left join public.seating_placements p on p.wedding_id=w and p.event='reception' and p.guest_id=(g->>'id')::uuid
      left join public.seating_units u on u.id=p.unit_id),'[]'::jsonb)) from base;
$$;
revoke all on function public.budget_snapshot(uuid) from public,anon;
grant execute on function public.budget_snapshot(uuid) to authenticated;
