create table public.comparison_lists (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id),
  name text not null check (name = trim(name) and length(name) between 1 and 80),
  unique (wedding_id, id)
);
create unique index comparison_list_name on public.comparison_lists (wedding_id, lower(name));

create table public.comparison_criteria (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null, list_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 160),
  section text not null default '' check (length(section) <= 80),
  position integer not null check (position between 0 and 1000000),
  must_have boolean not null default false, removed boolean not null default false,
  version integer not null default 1 check (version > 0),
  foreign key (wedding_id, list_id) references public.comparison_lists(wedding_id, id),
  unique (wedding_id, list_id, id)
);

create table public.comparison_options (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null, list_id uuid not null,
  vendor_id uuid not null, quote_id uuid, selected boolean not null default true,
  version integer not null default 1 check (version > 0),
  foreign key (wedding_id, list_id) references public.comparison_lists(wedding_id, id),
  foreign key (wedding_id, vendor_id) references public.vendors(wedding_id, id),
  foreign key (wedding_id, quote_id) references public.quotes(wedding_id, id),
  unique nulls not distinct (wedding_id, list_id, vendor_id, quote_id),
  unique (wedding_id, list_id, id)
);

create table public.comparison_answers (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null, list_id uuid not null,
  criterion_id uuid not null, option_id uuid not null,
  offer text not null check (offer in ('included','extra','conditional','unavailable','unknown','inherit')),
  fit text not null default 'auto' check (fit in ('auto','yes','no')),
  notes text not null default '' check (length(notes) <= 4000),
  version integer not null default 1 check (version > 0),
  check (offer not in ('unknown','unavailable','inherit') or fit='auto'),
  check (offer <> 'inherit' or notes=''),
  foreign key (wedding_id, list_id, criterion_id) references public.comparison_criteria(wedding_id, list_id, id),
  foreign key (wedding_id, list_id, option_id) references public.comparison_options(wedding_id, list_id, id),
  unique (wedding_id, criterion_id, option_id)
);

do $$ declare t text;
begin
  foreach t in array array['comparison_lists','comparison_criteria','comparison_options','comparison_answers'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert on public.%I to authenticated',t);
    execute format('create policy members on public.%I for all to authenticated using (private.is_member(wedding_id)) with check (private.is_member(wedding_id))',t);
    if t <> 'comparison_lists' then
      execute format('create trigger version_guard before update on public.%I for each row execute function private.guard_edit()',t);
      execute format('create trigger audit_changes after update on public.%I for each row execute function private.audit_record()',t);
    end if;
    if exists(select 1 from pg_publication where pubname='supabase_realtime') then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
-- The parent links identify a cell permanently. Only its editable fields can change.
grant update(label,section,position,must_have,removed,version) on public.comparison_criteria to authenticated;
grant update(selected,version) on public.comparison_options to authenticated;
grant update(offer,fit,notes,version) on public.comparison_answers to authenticated;

create function private.guard_comparison_option() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.vendors where id=new.vendor_id and wedding_id=new.wedding_id and not deleted)
    or (new.quote_id is not null and not exists(select 1 from public.quotes
      where id=new.quote_id and vendor_id=new.vendor_id and wedding_id=new.wedding_id and not deleted))
  then raise exception 'Vendor or package is unavailable. Refresh the comparison.'; end if;
  return new;
end $$;
create trigger option_guard before insert or update on public.comparison_options
  for each row execute function private.guard_comparison_option();

create function private.guard_comparison_answer() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.comparison_criteria c where c.id=new.criterion_id and not c.removed)
    or not exists(select 1 from public.comparison_options o join public.vendors v on v.id=o.vendor_id
      left join public.quotes q on q.id=o.quote_id
      where o.id=new.option_id and not v.deleted and (o.quote_id is null or not q.deleted)
        and (new.offer <> 'inherit' or o.quote_id is not null))
  then raise exception 'The comparison row or option is unavailable.'; end if;
  return new;
end $$;
create trigger answer_guard before insert or update on public.comparison_answers
  for each row execute function private.guard_comparison_answer();

-- Create the list and its editable starter rows in one transaction. A replay
-- with the same client-generated ID must not recreate rows edited by a partner.
create function public.create_comparison(w uuid, list uuid, title text, starters jsonb,
  vendor uuid default null, quote uuid default null) returns uuid
language plpgsql security invoker set search_path='' as $$
begin
  if not private.is_member(w) then raise exception 'Wedding membership required'; end if;
  if jsonb_typeof(starters) is distinct from 'array' or jsonb_array_length(starters)>100 then
    raise exception 'Invalid starter criteria';
  end if;
  insert into public.comparison_lists(id,wedding_id,name) values(list,w,trim(title)) on conflict(id) do nothing;
  if not found then
    if not exists(select 1 from public.comparison_lists where id=list and wedding_id=w and name=trim(title))
    then raise exception 'Comparison already exists. Refresh and review.'; end if;
    return list;
  end if;
  insert into public.comparison_criteria(wedding_id,list_id,label,section,position)
    select w,list,item->>'label',coalesce(item->>'section',''),ordinality*10
    from jsonb_array_elements(starters) with ordinality as rows(item,ordinality);
  if vendor is not null or quote is not null then
    insert into public.comparison_options(wedding_id,list_id,vendor_id,quote_id) values(w,list,vendor,quote);
  end if;
  return list;
end $$;
revoke all on function public.create_comparison(uuid,uuid,text,jsonb,uuid,uuid) from public,anon;
grant execute on function public.create_comparison(uuid,uuid,text,jsonb,uuid,uuid) to authenticated;

alter function public.budget_snapshot(uuid) rename to pre_comparison_snapshot;
alter function public.pre_comparison_snapshot(uuid) set schema private;
revoke all on function private.pre_comparison_snapshot(uuid) from public,anon;
grant execute on function private.pre_comparison_snapshot(uuid) to authenticated;
create function public.budget_snapshot(w uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  with criteria as materialized (select c.* from public.comparison_criteria c where wedding_id=w and not removed),
  options as materialized (
    select o.* from public.comparison_options o join public.vendors v on v.id=o.vendor_id
    left join public.quotes q on q.id=o.quote_id
    where o.wedding_id=w and not v.deleted and (o.quote_id is null or not q.deleted)
  )
  select private.pre_comparison_snapshot(w) || jsonb_build_object(
    'comparison_ready',true,'comparison_lists',coalesce((select jsonb_agg(l order by name,id)
      from public.comparison_lists l where wedding_id=w),'[]'),
    'comparison_criteria',coalesce((select jsonb_agg(c order by position,id) from criteria c),'[]'),
    'comparison_options',coalesce((select jsonb_agg(o order by id) from options o),'[]'),
    'comparison_answers',coalesce((select jsonb_agg(a) from public.comparison_answers a
      join criteria c on c.id=a.criterion_id join options o on o.id=a.option_id where a.wedding_id=w),'[]'));
$$;
revoke all on function public.budget_snapshot(uuid) from public,anon;
grant execute on function public.budget_snapshot(uuid) to authenticated;
