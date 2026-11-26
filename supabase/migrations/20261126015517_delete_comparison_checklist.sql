alter table public.comparison_lists
  add column deleted boolean not null default false,
  add column version integer not null default 1 check (version > 0);
grant update(deleted,version) on public.comparison_lists to authenticated;

drop index public.comparison_list_name;
create unique index comparison_list_name on public.comparison_lists (wedding_id,lower(name)) where not deleted;

create trigger active_guard before insert or update on public.comparison_lists
  for each row execute function private.guard_active_record();
create trigger version_guard before update on public.comparison_lists
  for each row execute function private.guard_edit();
create trigger audit_changes after update on public.comparison_lists
  for each row execute function private.audit_record();

-- A share lock orders child writes against deletion without taking a wedding-wide lock.
create function private.guard_active_comparison_list() returns trigger language plpgsql set search_path='' as $$
begin
  perform 1 from public.comparison_lists
    where wedding_id=new.wedding_id and id=new.list_id and not deleted for share;
  if not found then raise exception 'This checklist was deleted or is unavailable. Refresh and review.'; end if;
  return new;
end $$;

create trigger active_list_guard before insert or update on public.comparison_criteria
  for each row execute function private.guard_active_comparison_list();
create trigger active_list_guard before insert or update on public.comparison_options
  for each row execute function private.guard_active_comparison_list();
create trigger active_list_guard before insert or update on public.comparison_answers
  for each row execute function private.guard_active_comparison_list();

create or replace function public.delete_record(t text,r uuid,v integer) returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
  if t not in ('categories','vendors','expenses','quotes','installments','payments','invitations','guests','tasks','events','vendor_photos','itinerary_items','menu_courses','menu_options','comparison_lists') then raise exception 'Unsupported record'; end if;
  execute format('select to_jsonb(x) from public.%I x where id=$1',t) into item using r;
  if item is null then raise exception 'Record unavailable'; end if;
  perform 1 from public.weddings where id=(item->>'wedding_id')::uuid for update;
  execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into item using r;
  if (item->>'deleted')::boolean then return; end if;
  if (item->>'version')::integer is distinct from v then raise exception 'Someone changed this record. Reopen it and review the latest values.'; end if;
  execute format('update public.%I set deleted=true where id=$1',t) using r;
end; $$;

create or replace function public.budget_snapshot(w uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  with lists as materialized (
    select l.* from public.comparison_lists l where wedding_id=w and not deleted
  ),
  criteria as materialized (
    select c.* from public.comparison_criteria c join lists l on l.id=c.list_id
    where c.wedding_id=w and not c.removed
  ),
  options as materialized (
    select o.* from public.comparison_options o join lists l on l.id=o.list_id
    join public.vendors v on v.id=o.vendor_id
    left join public.quotes q on q.id=o.quote_id
    where o.wedding_id=w and not v.deleted and (o.quote_id is null or not q.deleted)
  )
  select private.pre_comparison_snapshot(w) || jsonb_build_object(
    'comparison_ready',true,'comparison_lists',coalesce((select jsonb_agg(l order by name,id)
      from lists l),'[]'),
    'comparison_criteria',coalesce((select jsonb_agg(c order by position,id) from criteria c),'[]'),
    'comparison_options',coalesce((select jsonb_agg(o order by id) from options o),'[]'),
    'comparison_answers',coalesce((select jsonb_agg(a) from public.comparison_answers a
      join criteria c on c.id=a.criterion_id join options o on o.id=a.option_id where a.wedding_id=w),'[]'));
$$;
