-- Separate wedding-day itinerary. Apply after couple_feedback, with explicit hosted approval.
-- Dates derive from the wedding; changing that date does not rewrite activities.
create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null references public.weddings(id),
  title text not null check(length(trim(title)) between 1 and 160),
  track text not null default 'Together' check(length(track) between 1 and 100 and track=trim(track)),
  start_time time(0) not null check(extract(second from start_time)=0 and start_time<'24:00'::time),
  end_time time(0) check(extract(second from end_time)=0 and end_time<'24:00'::time),
  day_offset smallint not null default 0 check(day_offset in (0,1)),
  location text not null default '' check(length(location)<=500),
  notes text not null default '' check(length(notes)<=4000), vendor_id uuid,
  deleted boolean not null default false, version integer not null default 1,
  unique(wedding_id,id),check(end_time is null or end_time<>start_time),
  foreign key(wedding_id,vendor_id) references public.vendors(wedding_id,id)
);
create index itinerary_wedding_time on public.itinerary_items(wedding_id,day_offset,start_time);
create index itinerary_wedding_vendor on public.itinerary_items(wedding_id,vendor_id);
alter table public.itinerary_items enable row level security;
revoke all on public.itinerary_items from public,anon,authenticated;
grant select,insert,update on public.itinerary_items to authenticated;
create policy member_read on public.itinerary_items for select to authenticated using(private.is_member(wedding_id));
create policy member_insert on public.itinerary_items for insert to authenticated with check(private.is_member(wedding_id));
create policy member_update on public.itinerary_items for update to authenticated
  using(private.is_member(wedding_id)) with check(private.is_member(wedding_id));
create trigger active_guard before insert or update on public.itinerary_items for each row execute function private.guard_active_record();
create trigger version_guard before update on public.itinerary_items for each row execute function private.guard_edit();
create trigger audit_changes after update on public.itinerary_items for each row execute function private.audit_record();
create function private.guard_itinerary_vendor() returns trigger language plpgsql set search_path='' as $$
begin
  if not new.deleted and new.vendor_id is not null and not exists(
    select 1 from public.vendors where wedding_id=new.wedding_id and id=new.vendor_id and not deleted
  ) then raise exception 'Related vendor is unavailable. Refresh and review.'; end if;
  return new;
end; $$;
create trigger itinerary_vendor_guard before insert or update on public.itinerary_items for each row execute function private.guard_itinerary_vendor();
create function private.detach_itinerary_vendor() returns trigger language plpgsql set search_path='' as $$
begin
  update public.itinerary_items set vendor_id=null where wedding_id=new.wedding_id and vendor_id=new.id and not deleted;
  return new;
end; $$;
create trigger itinerary_vendor_cleanup after update on public.vendors for each row
  when(new.deleted and not old.deleted) execute function private.detach_itinerary_vendor();

-- Preserve the existing single-statement snapshot and RLS as a non-exposed invoker helper.
alter function public.budget_snapshot(uuid) rename to feedback_snapshot;
alter function public.feedback_snapshot(uuid) set schema private;
revoke all on function private.feedback_snapshot(uuid) from public,anon;
grant execute on function private.feedback_snapshot(uuid) to authenticated;
create function public.budget_snapshot(w uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.feedback_snapshot(w)||jsonb_build_object('itinerary_ready',true,'itinerary_items',
    coalesce((select jsonb_agg(x order by day_offset,start_time,title,id) from public.itinerary_items x where wedding_id=w and not deleted),'[]'::jsonb));
$$;
revoke all on function public.budget_snapshot(uuid) from public,anon;
grant execute on function public.budget_snapshot(uuid) to authenticated;

create or replace function public.delete_record(t text,r uuid,v integer) returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
  if t not in ('categories','vendors','expenses','quotes','installments','payments','invitations','guests','tasks','events','vendor_photos','itinerary_items') then raise exception 'Unsupported record'; end if;
  execute format('select to_jsonb(x) from public.%I x where id=$1',t) into item using r;
  if item is null then raise exception 'Record unavailable'; end if;
  perform 1 from public.weddings where id=(item->>'wedding_id')::uuid for update;
  execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into item using r;
  if (item->>'deleted')::boolean then return; end if;
  if (item->>'version')::integer is distinct from v then raise exception 'Someone changed this record. Reopen it and review the latest values.'; end if;
  execute format('update public.%I set deleted=true where id=$1',t) using r;
end; $$;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.itinerary_items;
  end if;
end; $$;
