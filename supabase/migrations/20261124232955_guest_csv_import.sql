-- Store only the request fingerprint so a lost response can be retried without duplicating guests.
create table private.guest_import_receipts (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  request_id uuid not null, fingerprint bytea not null,
  primary key (wedding_id, request_id)
);
alter table private.guest_import_receipts enable row level security;
revoke all on private.guest_import_receipts from public, anon, authenticated;
grant select,insert on private.guest_import_receipts to authenticated;
create policy member_read on private.guest_import_receipts for select to authenticated using(private.is_member(wedding_id));
create policy member_insert on private.guest_import_receipts for insert to authenticated with check(private.is_member(wedding_id));

create function public.import_guest_csv(w uuid, request_id uuid, households jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare
  batch_hash bytea; prior bytea; h jsonb; g jsonb; guest_count integer:=0;
  invitation uuid; row_label text; guest_names text[]; guest_name text;
begin
  if not private.is_member(w) then raise exception 'Wedding unavailable'; end if;
  if request_id is null or jsonb_typeof(households) is distinct from 'array' then raise exception 'Choose a validated guest CSV'; end if;
  if jsonb_array_length(households) not between 1 and 1000 or octet_length(households::text)>3000000 then
    raise exception 'Import up to 1,000 guests and 1 MiB of CSV at a time';
  end if;
  perform 1 from public.weddings where id=w for update;
  batch_hash:=sha256(convert_to(households::text,'UTF8'));
  select r.fingerprint into prior from private.guest_import_receipts r where r.wedding_id=w and r.request_id=import_guest_csv.request_id;
  if found then
    if prior<>batch_hash then raise exception 'This import request changed. Select the file again.'; end if;
    return;
  end if;
  for h in select value from jsonb_array_elements(households) loop
    if jsonb_typeof(h)<>'object' then raise exception 'Each household must be a guest template record'; end if;
    row_label:=left(coalesce(h->>'line','?'),12);
    if h-array['line','household','email','phone','address','people']<>'{}'::jsonb or
       jsonb_typeof(h->'household') is distinct from 'string' or length(trim(h->>'household')) not between 1 and 160 then
      raise exception 'Line % · household: use a household name of 1–160 characters and only template fields',row_label;
    end if;
    if exists(select from jsonb_each(h) f where key in ('email','phone','address') and jsonb_typeof(value)<>'string')
      then raise exception 'Line % · contacts: use plain text',row_label; end if;
    if length(h->>'email')>254 or (coalesce(h->>'email','')<>'' and h->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
      raise exception 'Line % · email: enter a valid address of up to 254 characters',row_label;
    end if;
    if length(h->>'phone')>100 or length(h->>'address')>1000 then raise exception 'Line % · contacts: phone allows 100 characters and address allows 1,000',row_label; end if;
    if jsonb_typeof(h->'people') is distinct from 'array' then raise exception 'Line % · household: include its guest rows',row_label; end if;
    if jsonb_array_length(h->'people') not between 1 and 50 then raise exception 'Line % · household: include 1–50 people per invitation',row_label; end if;
    guest_count:=guest_count+jsonb_array_length(h->'people');
    if guest_count>1000 then raise exception 'Line % · file exceeds 1,000 guest rows',row_label; end if;
    if exists(select from public.invitations i where i.wedding_id=w and not i.deleted and lower(trim(i.household_name))=lower(trim(h->>'household'))) then
      raise exception 'Line % · household: already in this wedding. Remove its rows from the file or edit the existing household.',row_label;
    end if;
    insert into public.invitations(wedding_id,household_name,contact_email,phone,mailing_address)
      values(w,trim(h->>'household'),coalesce(h->>'email',''),coalesce(h->>'phone',''),coalesce(h->>'address','')) returning id into invitation;
    guest_names:='{}';
    for g in select value from jsonb_array_elements(h->'people') loop
      if jsonb_typeof(g)<>'object' then raise exception 'Household on line % has an invalid guest record',row_label; end if;
      row_label:=left(coalesce(g->>'line','?'),12);
      if g-array['line','name','rsvp','companion','dietary_notes']<>'{}'::jsonb then raise exception 'Line % · guest: unexpected fields',row_label; end if;
      if jsonb_typeof(g->'companion') is distinct from 'boolean' then raise exception 'Line % · companion: use yes or no',row_label; end if;
      guest_name:=nullif(trim(g->>'name'),'');
      if jsonb_typeof(g->'name') is distinct from 'string' or length(guest_name)>120 or (guest_name is null and not (g->>'companion')::boolean) then
        raise exception 'Line % · guest_name: enter a name of up to 120 characters or mark an unnamed companion',row_label;
      end if;
      if lower(guest_name)=any(guest_names) then raise exception 'Line % · guest_name: duplicate name in this household',row_label; end if;
      guest_names:=array_append(guest_names,lower(guest_name));
      if coalesce(g->>'rsvp','') not in ('pending','yes','no') then raise exception 'Line % · rsvp: use yes, no or pending',row_label; end if;
      if (g?'dietary_notes' and jsonb_typeof(g->'dietary_notes')<>'string') or length(g->>'dietary_notes')>2000 then raise exception 'Line % · dietary_notes: enter text up to 2,000 characters',row_label; end if;
      insert into public.guests(wedding_id,invitation_id,name,is_companion,rsvp,dietary_notes)
        values(w,invitation,guest_name,(g->>'companion')::boolean,g->>'rsvp',coalesce(g->>'dietary_notes',''));
    end loop;
  end loop;
  insert into private.guest_import_receipts values(w,request_id,batch_hash);
end $$;
revoke all on function public.import_guest_csv(uuid,uuid,jsonb) from public,anon;
grant execute on function public.import_guest_csv(uuid,uuid,jsonb) to authenticated;

alter function public.budget_snapshot(uuid) rename to seating_snapshot;
alter function public.seating_snapshot(uuid) set schema private;
create function public.budget_snapshot(w uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.seating_snapshot(w)||jsonb_build_object('guest_import_ready',true);
$$;
revoke all on function public.budget_snapshot(uuid) from public,anon;
grant execute on function public.budget_snapshot(uuid) to authenticated;
