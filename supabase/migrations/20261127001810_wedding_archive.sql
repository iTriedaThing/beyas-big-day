-- Existing owners are explicitly provisioned by verified membership IDs (see README).
alter table public.wedding_members add column is_owner boolean not null default false;
create function private.wedding_owner(w uuid) returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select from public.wedding_members where wedding_id=w and user_id=auth.uid() and is_owner);
$$;

create function private.grant_founding_owner() returns trigger language plpgsql set search_path='' as $$
begin
  update public.wedding_members set is_owner=true where wedding_id=new.accepted_wedding and user_id=new.accepted_by;
  return new;
end $$;
create trigger founding_owner after update on private.planner_invitations for each row
when (old.accepted_by is null and new.accepted_by is not null and new.target_wedding is null)
execute function private.grant_founding_owner();

create table private.archive_types (kind text primary key);
insert into private.archive_types values ('categories'),('expenses'),('vendors'),('quotes'),('installments'),('payments'),
 ('invitations'),('guests'),('tasks'),('events'),('vendor_photos'),('itinerary_items'),('menu_courses'),('menu_options'),
 ('comparison_lists'),('comparison_criteria'),('seating_units');

-- These links define both inherited visibility and which dependent rows belong to a purge.
-- Optional references such as an installment on a payment are handled separately.
create table private.archive_links(child text, parent text, link text, primary key(child,link));
insert into private.archive_links values
 ('expenses','categories','category_id'),('expenses','vendors','vendor_id'),
 ('quotes','expenses','expense_id'),('quotes','vendors','vendor_id'),('payments','expenses','expense_id'),
 ('installments','expenses','expense_id'),('contract_amendments','expenses','expense_id'),
 ('events','vendors','vendor_id'),('vendor_photos','vendors','vendor_id'),('guests','invitations','invitation_id'),
 ('menu_options','menu_courses','course_id'),('menu_options','vendors','vendor_id'),
 ('guest_meals','guests','guest_id'),('guest_meals','menu_courses','course_id'),
 ('comparison_criteria','comparison_lists','list_id'),('comparison_options','comparison_lists','list_id'),
 ('comparison_options','vendors','vendor_id'),('comparison_options','quotes','quote_id'),
 ('comparison_answers','comparison_criteria','criterion_id'),('comparison_answers','comparison_options','option_id'),
 ('seating_placements','seating_units','unit_id'),('seating_placements','guests','guest_id');

create table private.archive_entries (
  token uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  kind text not null references private.archive_types, record_id uuid not null, label text not null,
  archived_at timestamptz, archived_by uuid, unique(kind,record_id)
);
create index archive_entries_wedding on private.archive_entries(wedding_id);
create function private.archive_label(t text, item jsonb) returns text language sql immutable set search_path='' as $$
 select coalesce(nullif(item->>'title',''),nullif(item->>'name',''),nullif(item->>'household_name',''),
   nullif(item->>'package_name',''),nullif(item->>'label',''),nullif(item->>'caption',''),
   case t when 'payments' then initcap(item->>'kind') || ' · ' || (item->>'paid_on')
     when 'guests' then 'Unnamed companion' when 'vendor_photos' then 'Vendor picture' else t end);
$$;

alter table public.seating_units add column version integer not null default 1;
create trigger version_guard before update on public.seating_units for each row execute function private.guard_edit();

do $$
declare t text; legacy text; visible text; parents text;
begin
 for t in select kind from private.archive_types loop
   execute format('alter table public.%I add column is_active boolean not null default true',t);
   legacy := case when t='seating_units' then 'false' when t='comparison_criteria' then 'removed'
                  when t in ('tasks','guests','invitations') then 'deleted or archived' else 'deleted' end;
   -- One-time conversion without firing user audit, version, seating or cascade triggers.
   execute format('alter table public.%I disable trigger user',t);
   execute format('update public.%I set is_active=false where %s',t,legacy);
   if t in ('tasks','guests','invitations') then
     execute format('insert into private.archive_entries(wedding_id,kind,record_id,label)
       select wedding_id,%L,id,private.archive_label(%L,to_jsonb(x)) from public.%I x where archived and not deleted',t,t,t);
     execute format('update public.%I set archived=false where archived and not deleted',t);
   end if;
   execute format('alter table public.%I enable trigger user',t);
 end loop;
 for t in select kind from private.archive_types union select child from private.archive_links loop
   visible := case when exists(select from private.archive_types where kind=t) then 'is_active' else 'true' end;
   select string_agg(format('(%1$I.%2$I is null or exists(select from public.%3$I parent where parent.id=%1$I.%2$I))',child,link,parent),' and ')
     into parents from private.archive_links where child=t;
   visible := concat_ws(' and ',visible,parents);
   execute format('create policy archive_visibility on public.%I as restrictive for all to authenticated using (%s) with check (%s)',t,visible,visible);
 end loop;
end $$;

-- Leave the old flags readable for older clients. Direct writes to them fail closed.
create function private.guard_archive_flags() returns trigger language plpgsql set search_path='' as $$
declare flags text[] := array['deleted','archived','removed']; flag text; row_data jsonb:=to_jsonb(new);
begin
 foreach flag in array flags loop
   if coalesce((row_data->>flag)::boolean,false) and
     (tg_op='INSERT' or row_data->flag is distinct from to_jsonb(old)->flag) then
     raise exception 'Refresh the planner to archive this record.';
   end if;
 end loop;
 return new;
end $$;
do $$ declare t text; begin
 for t in select kind from private.archive_types loop
   execute format('create trigger archive_flags before insert or update on public.%I for each row execute function private.guard_archive_flags()',t);
 end loop;
end $$;

drop index public.categories_active_name;
create unique index categories_active_name on public.categories(wedding_id,name) where is_active;
drop index public.comparison_list_name;
create unique index comparison_list_name on public.comparison_lists(wedding_id,lower(name)) where is_active;
drop index public.menu_course_name;
create unique index menu_course_name on public.menu_courses(wedding_id,lower(name)) where is_active;
alter table public.seating_units drop constraint seating_units_wedding_id_event_label_key;
create unique index seating_active_label on public.seating_units(wedding_id,event,label) where is_active;

-- Closure for the owner confirmation dialog. A placement is identified by event and guest.
do $$ declare links_sql text; begin
 select string_agg(format('select wedding_id,%L::text as parent,%I::text as parent_id,%L::text as child,%s as child_id from public.%I where %I is not null',
   parent,link,child,case child when 'seating_placements' then 'event||''/''||guest_id::text' else 'id::text' end,child,link),' union all ')
 into links_sql from private.archive_links;
 execute 'create view private.active_archive_dependencies as ' || links_sql;
end $$;

-- Preserve original composite FK keys. PostgreSQL owns atomic removal of the dependent rows.
do $$ declare edge record; fk record; begin
 for edge in select child,parent,link,'cascade' as action from private.archive_links
   union all select * from (values
     ('payments','installments','installment_id','set null (installment_id)'),
     ('guest_meals','menu_options','option_id','set null (option_id)'),
     ('expenses','quotes','preferred_quote_id','set null (preferred_quote_id)'),
     ('itinerary_items','vendors','vendor_id','set null (vendor_id)'),
     ('weddings','expenses','menu_expense_id','set null (menu_expense_id)')) s
 loop
   select c.conname,split_part(pg_get_constraintdef(c.oid),' ON DELETE ',1) as definition into strict fk
     from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[cardinality(c.conkey)]
     where c.contype='f' and c.conrelid=format('public.%I',edge.child)::regclass
       and c.confrelid=format('public.%I',edge.parent)::regclass and a.attname=edge.link;
   execute format('alter table public.%I drop constraint %I, add constraint %I %s on delete %s',edge.child,fk.conname,fk.conname,fk.definition,edge.action);
 end loop;
end $$;


create table private.held_seats (
  wedding_id uuid not null, event text not null, unit_id uuid not null, guest_id uuid not null, seat integer,
  primary key(wedding_id,event,guest_id),
  foreign key(wedding_id,event,unit_id) references public.seating_units(wedding_id,event,id) on delete cascade,
  foreign key(wedding_id,guest_id) references public.guests(wedding_id,id) on delete cascade
);
create function private.hold_seats(w uuid,t text,r uuid) returns void language sql set search_path='' as $$
 with released as (
   delete from public.seating_placements p using public.guests g where p.wedding_id=w and g.id=p.guest_id and
     ((t='seating_units' and p.unit_id=r) or (t='guests' and g.id=r) or (t='invitations' and g.invitation_id=r))
     returning p.wedding_id,p.event,p.unit_id,p.guest_id,p.seat
 ) insert into private.held_seats(wedding_id,event,unit_id,guest_id,seat) select * from released;
$$;
create function private.restore_seats(w uuid) returns integer language plpgsql set search_path='' as $$
declare p record; adjusted integer:=0;
begin
 for p in select h.*,u.capacity from private.held_seats h join public.seating_units u on u.id=h.unit_id
   join public.guests g on g.id=h.guest_id join public.invitations i on i.id=g.invitation_id
   where h.wedding_id=w and u.is_active and g.is_active and i.is_active order by h.unit_id,h.seat nulls last,h.guest_id
 loop
   if exists(select from public.guests where id=p.guest_id and rsvp<>'no')
     and p.capacity>(select count(*) from public.seating_placements where unit_id=p.unit_id) then
     if p.seat>p.capacity or exists(select from public.seating_placements where unit_id=p.unit_id and seat=p.seat) then
       p.seat:=null;
       adjusted:=adjusted+1;
     end if;
     insert into public.seating_placements values(w,p.event,p.unit_id,p.guest_id,p.seat) on conflict do nothing;
   else adjusted:=adjusted+1;
   end if;
   delete from private.held_seats where wedding_id=w and event=p.event and guest_id=p.guest_id;
 end loop;
 return adjusted;
end $$;

-- Also include held assignments in the purge review after their table/guest has been archived.
create view private.archive_dependencies as select * from private.active_archive_dependencies
 union all select wedding_id,'seating_units',unit_id::text,'seating_placements',event||'/'||guest_id::text from private.held_seats
 union all select wedding_id,'guests',guest_id::text,'seating_placements',event||'/'||guest_id::text from private.held_seats;

-- Legacy tombstones have no archive entry, so check ancestor flags on the underlying rows.
create function private.has_inactive_parent(w uuid,t text,r uuid) returns boolean language plpgsql stable set search_path='' as $$
declare link record; inactive boolean;
begin
 for link in with recursive ancestry(kind,id) as (
   select d.parent,d.parent_id from private.archive_dependencies d where d.wedding_id=w and d.child=t and d.child_id=r::text
   union select d.parent,d.parent_id from ancestry a join private.archive_dependencies d on d.child=a.kind and d.child_id=a.id and d.wedding_id=w
 ) select a.* from ancestry a join private.archive_types supported on supported.kind=a.kind
 loop
   execute format('select not is_active from public.%I where wedding_id=$1 and id=$2',link.kind) into inactive using w,link.id::uuid;
   if inactive then return true; end if;
 end loop;
 return false;
end $$;
-- Run with the wedding locked. The entry token identifies this specific deletion across retries and restores.
create function private.archive_record(t text,r uuid,v integer) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; w uuid; plan_name text;
begin
 if not exists(select from private.archive_types where kind=t) then raise exception 'Unsupported record'; end if;
 execute format('select wedding_id from public.%I where id=$1',t) into w using r;
 if not private.is_member(w) then raise exception 'Record unavailable'; end if;
 perform 1 from public.weddings where id=w for update;
 execute format('select to_jsonb(x) from public.%I x where id=$1 and wedding_id=$2 for update',t) into item using r,w;
 if item is null then raise exception 'Record unavailable'; end if;
 if not (item->>'is_active')::boolean then return; end if;
 if (item->>'version')::int is distinct from v then raise exception 'Someone changed this record. Refresh and review.'; end if;
 if private.has_inactive_parent(w,t,r)
 then raise exception 'Restore the archived parent first'; end if;
 execute format('update public.%I set is_active=false where id=$1',t) using r;
 insert into private.archive_entries(wedding_id,kind,record_id,label,archived_at,archived_by)
 values(w,t,r,private.archive_label(t,item),now(),auth.uid());
 if t in ('seating_units','guests','invitations') then
   perform private.hold_seats(w,t,r);
   if t='seating_units' then
     update public.seating_units set position=position-1 where wedding_id=w and event=item->>'event'
       and is_active and position>(item->>'position')::int;
   end if;
   for plan_name in select event from (values('ceremony'),('reception')) plans(event)
     where t<>'seating_units' or event=item->>'event' loop
     insert into public.seating_changes(wedding_id,event,revision)
       select w,plan_name,coalesce(max(revision),0)+1 from public.seating_changes where wedding_id=w and event=plan_name;
   end loop;
 end if;
end $$;
create or replace function public.delete_record(t text,r uuid,v integer) returns void language sql security invoker set search_path='' as $$
 select private.archive_record(t,r,v);
$$;

-- A member can read history for visible records. Wedding owners can also review retained private history.
do $$ declare predicate text; begin
 select string_agg(format('when %L then exists(select from public.%I x where x.id=record_history.record_id and x.wedding_id=record_history.wedding_id)',kind,kind),' ')
 into predicate from (select kind from private.archive_types union select child from private.archive_links where child<>'seating_placements') supported;
 execute 'create policy archive_history on public.record_history as restrictive for select to authenticated using
   (private.wedding_owner(wedding_id) or case table_name '||predicate||' else false end)';
end $$;

create function private.archive_inventory(w uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when private.wedding_owner(w) then coalesce((select jsonb_agg(to_jsonb(e) order by archived_at desc nulls last,label,token)
   from private.archive_entries e where wedding_id=w),'[]'::jsonb) end;
$$;

create function private.impact_labels(t text,ids jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 if t='seating_placements' then
   select jsonb_agg(jsonb_build_object('id',p.event||'/'||p.guest_id,'label',concat_ws(' · ',u.label,coalesce(g.name,'Companion'))) order by p.event,p.guest_id)
     into result from (select * from public.seating_placements union all select * from private.held_seats) p join public.seating_units u on u.id=p.unit_id join public.guests g on g.id=p.guest_id
     where ids ? (p.event||'/'||p.guest_id::text);
 else
   execute format('select jsonb_agg(jsonb_build_object(''id'',id,''label'',private.archive_label(%L,to_jsonb(x))) order by id)
     from public.%I x where id in(select value::uuid from jsonb_array_elements_text($1))',t,t) into result using ids;
 end if;
 return result;
end $$;
create function private.archive_impact(entry private.archive_entries) returns jsonb language sql stable set search_path='' as $$
 with recursive affected(kind,id) as (
   select entry.kind,entry.record_id::text union select d.child,d.child_id from affected a
     join private.archive_dependencies d on d.parent=a.kind and d.parent_id=a.id and d.wedding_id=entry.wedding_id
 ), records as (
   select kind,private.impact_labels(kind,jsonb_agg(id order by id)) items from affected group by kind
 ), files as (
   select o.bucket_id,o.name from affected a join public.vendor_photos p on a.kind='vendor_photos' and p.id::text=a.id
     join storage.objects o on o.bucket_id='vendor-photos' and o.name=p.storage_path
   union all
   select o.bucket_id,o.name from affected a join storage.objects o on o.bucket_id='menu-photos'
     and o.name like entry.wedding_id::text||'/'||a.id||'/%' where a.kind='menu_options'
 )
 select jsonb_object_agg(kind,items) from (select * from records union all
   select 'picture_files',jsonb_agg(jsonb_build_object('id',bucket_id||'/'||name,'label',name) order by bucket_id,name)
   from files having count(*)>0) impact;
$$;

-- File bytes are removed through the Storage API. A durable queue survives a lost client response.
create table private.archive_files (
 wedding_id uuid not null references public.weddings, bucket text not null, path text not null, primary key(bucket,path)
);
create function private.queue_purged_photo() returns trigger language plpgsql set search_path='' as $$
declare path text; bucket text;
begin
 if tg_table_name='vendor_photos' then path:=old.storage_path; bucket:='vendor-photos';
 else path:=old.photo_path; bucket:='menu-photos'; end if;
 if tg_table_name='menu_options' then
   insert into private.archive_files select old.wedding_id,bucket,o.name from storage.objects o
     where o.bucket_id=bucket and o.name like old.wedding_id::text||'/'||old.id::text||'/%' on conflict do nothing;
 elsif path is not null then
   insert into private.archive_files values(old.wedding_id,bucket,path) on conflict do nothing;
 end if;
 return old;
end $$;
create trigger purge_file after delete on public.vendor_photos for each row execute function private.queue_purged_photo();
create trigger purge_file after delete on public.menu_options for each row execute function private.queue_purged_photo();
create function private.clear_archive_entry() returns trigger language plpgsql set search_path='' as $$
begin
 delete from private.archive_entries where kind=tg_table_name and record_id=old.id;
 return old;
end $$;
do $$ declare t text; begin
 for t in select kind from private.archive_types loop
   execute format('create trigger purge_archive after delete on public.%I for each row execute function private.clear_archive_entry()',t);
 end loop;
end $$;
create function private.purge_file_allowed(bucket text,path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.archive_files f where f.bucket=$1 and f.path=$2 and private.wedding_owner(f.wedding_id));
$$;
create policy owner_purge_file on storage.objects for delete to authenticated using(private.purge_file_allowed(bucket_id,name));
create policy owner_read_purge_file on storage.objects for select to authenticated using(private.purge_file_allowed(bucket_id,name));
-- Archiving an individual gallery photo must also revoke read access to its path.
drop policy wedding_photo_read on storage.objects;
create policy wedding_photo_read on storage.objects for select to authenticated using(
 bucket_id='vendor-photos' and private.can_access_photo(name) and exists(select from public.vendor_photos where storage_path=name));
create function private.pending_archive_files(w uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.wedding_owner(w) then raise exception 'Wedding owner access required'; end if;
 delete from private.archive_files f where wedding_id=w and not exists(select from storage.objects o where o.bucket_id=f.bucket and o.name=f.path);
 return coalesce((select jsonb_agg(jsonb_build_object('bucket',bucket,'path',path)) from private.archive_files where wedding_id=w),'[]'::jsonb);
end $$;
create function public.pending_archive_files(w uuid) returns jsonb language sql security invoker set search_path='' as $$
 select private.pending_archive_files(w);
$$;

create function private.manage_archive(w uuid,entry_token uuid,action text,confirmed jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare entry private.archive_entries; impact jsonb; event_name text; adjusted integer:=0;
begin
 if not private.wedding_owner(w) then raise exception 'Wedding owner access required'; end if;
 perform 1 from public.weddings where id=w for update;
 if not private.wedding_owner(w) then raise exception 'Wedding owner access required'; end if;
 select * into entry from private.archive_entries where token=entry_token and wedding_id=w for update;
 if not found then
   if action in ('restore','purge') then return 'null'; end if;
   raise exception 'Archive entry unavailable. Refresh and review.';
 end if;
 if action='preview' then return private.archive_impact(entry); end if;
 if action='restore' then
   if private.has_inactive_parent(w,entry.kind,entry.record_id)
   then raise exception 'Restore the archived parent first'; end if;
   if entry.kind='seating_units' then
     update public.seating_units u set position=(select coalesce(max(position),0)+1 from public.seating_units a
       where a.wedding_id=w and a.event=u.event and a.is_active) where id=entry.record_id;
   end if;
   execute format('update public.%I set is_active=true where id=$1 and wedding_id=$2',entry.kind) using entry.record_id,w;
   delete from private.archive_entries where token=entry_token;
   if entry.kind in ('guests','invitations','seating_units') then adjusted:=private.restore_seats(w); end if;
 elsif action='purge' then
   impact:=private.archive_impact(entry);
   if impact is distinct from confirmed then raise exception 'The affected records changed. Reopen the confirmation.'; end if;
   execute format('delete from public.%I where id=$1 and wedding_id=$2 and not is_active',entry.kind) using entry.record_id,w;
 else raise exception 'Unsupported archive action'; end if;
 if entry.kind in ('guests','invitations','seating_units') then
   for event_name in select unnest(array['ceremony','reception']) loop
     insert into public.seating_changes(wedding_id,event,revision)
       select w,event_name,coalesce(max(revision),0)+1 from public.seating_changes where wedding_id=w and event=event_name;
   end loop;
 end if;
 return jsonb_build_object('seats_to_review',adjusted);
exception when unique_violation then raise exception 'An active item already uses that name. Rename it and try restoring again.';
end $$;
create function public.manage_archive(w uuid,entry_token uuid,action text,confirmed jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.manage_archive(w,entry_token,action,confirmed); $$;

create function private.has_archive_files(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.wedding_owner(w) and exists(select from private.archive_files where wedding_id=w);
$$;

alter function public.budget_snapshot(uuid) rename to pre_archive_snapshot;
alter function public.pre_archive_snapshot(uuid) set schema private;
create function public.budget_snapshot(w uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with base as materialized (select private.pre_archive_snapshot(w) as doc)
 select doc || jsonb_build_object('archive_ready',true,'archive_entries',private.archive_inventory(w),
   'archive_files_pending',private.has_archive_files(w),
   'guest_meals',coalesce((select jsonb_agg(case when m->>'option_id' is not null and not exists(
     select from public.menu_options o where o.id=(m->>'option_id')::uuid) then m||'{"option_id":null}'::jsonb else m end)
     from jsonb_array_elements(doc->'guest_meals') m),'[]'::jsonb),
   'expenses',coalesce((select jsonb_agg(case when e->>'preferred_quote_id' is not null and not exists(
     select from public.quotes q where q.id=(e->>'preferred_quote_id')::uuid) then e||'{"preferred_quote_id":null}'::jsonb else e end order by ord)
     from jsonb_array_elements(doc->'expenses') with ordinality rows(e,ord)),'[]'::jsonb),
   'payments',coalesce((select jsonb_agg(case when p->>'installment_id' is not null and not exists(
     select from public.installments i where i.id=(p->>'installment_id')::uuid)
     then p||'{"installment_id":null}'::jsonb else p end order by ord)
     from jsonb_array_elements(doc->'payments') with ordinality rows(p,ord)),'[]'::jsonb)) from base;
$$;

create or replace function private.apply_seating(w uuid, plan text, expected bigint, request_id uuid, command jsonb)
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
    select * into unit from public.seating_units where is_active and wedding_id=w and event=plan and id=target;
    if not found then raise exception 'Row or table unavailable'; end if;
  end if;
  if action='add' then
    n := (command->>'quantity')::int;
    if n is null or n not between 1 and 200 then raise exception 'Add between 1 and 200 at a time'; end if;
    select coalesce(max(position),0)+1 into next_position from public.seating_units where is_active and wedding_id=w and event=plan;
    sequence_no := next_position;
    for idx in 1..n loop
      loop
        new_label := case plan when 'ceremony' then 'Row ' else 'Table ' end || sequence_no;
        sequence_no := sequence_no+1;
        exit when not exists(select from public.seating_units where is_active and wedding_id=w and event=plan and label=new_label);
      end loop;
      insert into public.seating_units(wedding_id,event,label,capacity,shape,position,reserved)
      values(w,plan,new_label,capacity_new,command->>'shape',next_position+idx-1,coalesce((command->>'reserved')::boolean,false));
    end loop;
  elsif action='edit' and target is not null then
    if capacity_new < (select count(*) from public.seating_placements where unit_id=target)
       or exists(select from public.seating_placements where unit_id=target and seat>capacity_new)
    then raise exception 'Move guests or clear higher seat numbers before reducing capacity'; end if;
    select count(*) into n from public.seating_units where is_active and wedding_id=w and event=plan;
    if place is null or place not between 1 and n then raise exception 'Choose a position in the plan'; end if;
    update public.seating_units set position=position+case when place<unit.position then 1 else -1 end
    where is_active and wedding_id=w and event=plan and id<>target and position between least(place,unit.position) and greatest(place,unit.position);
    update public.seating_units set position=place,label=trim(command->>'label'),capacity=capacity_new,
      shape=command->>'shape',reserved=coalesce((command->>'reserved')::boolean,false) where id=target;
  elsif action='delete' and target is not null then
    perform private.archive_record('seating_units',target,unit.version);
    update public.seating_changes c set request_id=apply_seating.request_id
      where c.wedding_id=w and c.event=plan and c.revision=revision_now+1;
    return;
  elsif action='assign' then
    select array_agg(g.id) into members from public.guests g join public.invitations i on i.id=g.invitation_id
    where g.wedding_id=w and i.id=(command->>'household_id')::uuid and g.is_active and i.is_active
      and g.rsvp<>'no' and (person is null or g.id=person);
    if members is null then raise exception 'Choose an active household or guest'; end if;
    if person is not null and not coalesce((command->>'split')::boolean,false) then raise exception 'Choose Split household to move one person'; end if;
    if target is not null and unit.capacity < cardinality(members)+(select count(*) from public.seating_placements where unit_id=target and not (guest_id=any(members)))
    then raise exception 'This group needs more open seats. The previous assignments have been kept.'; end if;
    delete from private.held_seats where wedding_id=w and event=plan and guest_id=any(members);
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


create function private.archive_path_pending(bucket text,path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.archive_files f where f.bucket=$1 and f.path=$2 and private.is_member(f.wedding_id));
$$;
create policy preserve_pending_archive_files on storage.objects as restrictive for insert to authenticated
 with check (not private.archive_path_pending(bucket_id,name));
create policy preserve_pending_archive_updates on storage.objects as restrictive for update to authenticated
 using (not private.archive_path_pending(bucket_id,name)) with check (not private.archive_path_pending(bucket_id,name));

revoke all on private.archive_types,private.archive_links,private.archive_entries,private.archive_dependencies,
 private.active_archive_dependencies,private.archive_files,private.held_seats from public,anon,authenticated;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname in ('wedding_owner','grant_founding_owner','has_archive_files','archive_label','guard_archive_flags',
   'has_inactive_parent','impact_labels','hold_seats','restore_seats','archive_record','archive_inventory','archive_impact','queue_purged_photo','clear_archive_entry',
   'purge_file_allowed','pending_archive_files','manage_archive','archive_path_pending')
 loop execute format('revoke all on function %s from public,anon,authenticated',f); end loop;
end $$;
grant execute on function private.has_archive_files(uuid),private.wedding_owner(uuid),private.archive_record(text,uuid,integer),private.archive_inventory(uuid),
 private.manage_archive(uuid,uuid,text,jsonb),private.pending_archive_files(uuid),private.purge_file_allowed(text,text),
 private.archive_path_pending(text,text) to authenticated;
revoke all on function public.manage_archive(uuid,uuid,text,jsonb),public.pending_archive_files(uuid),public.budget_snapshot(uuid) from public,anon;
grant execute on function public.manage_archive(uuid,uuid,text,jsonb),public.pending_archive_files(uuid),public.budget_snapshot(uuid) to authenticated;
create or replace function private.guard_active_record() returns trigger language plpgsql set search_path='' as $$
declare j jsonb:=to_jsonb(new); parent_table text; parent_id uuid;
begin
  perform 1 from public.weddings where id=new.wedding_id for update;
  if tg_op='UPDATE' then
    -- A foreign key may clear an optional link on an old tombstone during purge.
    if old.deleted and pg_trigger_depth()>1 and new.deleted then return new; end if;
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
      ('installments',case when tg_table_name='payments' and (tg_op='INSERT' or j->'installment_id' is distinct from to_jsonb(old)->'installment_id') then (j->>'installment_id')::uuid end),
      ('quotes',case when tg_table_name='expenses' and (tg_op='INSERT' or j->'preferred_quote_id' is distinct from to_jsonb(old)->'preferred_quote_id') then (j->>'preferred_quote_id')::uuid end)
    ) as links(t,id) where id is not null
  loop
    declare active boolean; begin
      execute format('select exists(select 1 from public.%I where id=$1 and wedding_id=$2 and not deleted)',parent_table) into active using parent_id,new.wedding_id;
      if not active then raise exception 'Related record is unavailable. Refresh and review.'; end if;
    end;
  end loop;
  return new;
end; $$;
create or replace function private.guard_menu_record() returns trigger language plpgsql set search_path='' as $$
declare g public.guests; c public.menu_courses;
begin
  if new.deleted then return new; end if;
  if tg_table_name='guest_meals' and tg_op='UPDATE' and pg_trigger_depth()>1 then
    if old.option_id is not null and new.option_id is null then return new; end if;
  end if;
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
create or replace function private.guard_itinerary_vendor() returns trigger language plpgsql set search_path='' as $$
begin
  if not new.deleted and new.vendor_id is not null and (tg_op='INSERT' or new.vendor_id is distinct from old.vendor_id) and not exists(
    select 1 from public.vendors where wedding_id=new.wedding_id and id=new.vendor_id and not deleted
  ) then raise exception 'Related vendor is unavailable. Refresh and review.'; end if;
  return new;
end; $$;
create or replace function private.guard_menu_expense() returns trigger language plpgsql set search_path='' as $$
begin
  if new.currency is distinct from old.currency and private.has_recorded_prices(new.id) then
    raise exception 'Currency is fixed after recording expenses or menu prices';
  end if;
  if new.menu_expense_id is distinct from old.menu_expense_id and new.menu_expense_id is not null and not exists(select 1 from public.expenses where wedding_id=new.id and id=new.menu_expense_id and not deleted) then raise exception 'Catering expense unavailable'; end if;
  return new;
end; $$;

-- Currency remains locked when archived prices could later be restored. The predicate
-- reads through the active-row policies and exposes just the caller's wedding-level answer.
create function private.has_recorded_prices(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(w) and (exists(select from public.expenses where wedding_id=w)
   or exists(select from public.menu_options where wedding_id=w and not deleted and unit_cents is not null));
$$;
revoke all on function private.has_recorded_prices(uuid) from public,anon;
grant execute on function private.has_recorded_prices(uuid) to authenticated;
