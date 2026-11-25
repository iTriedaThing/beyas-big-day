-- Only a project administrator provisions operators. Planner invitations are separate from guest invitations.
create table private.beta_operators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table private.planner_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email=lower(trim(email)) and length(email) between 3 and 254),
  target_wedding uuid references public.weddings(id) on delete cascade,
  issued_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now()+interval '7 days'),
  revoked_at timestamptz,
  accepted_by uuid references auth.users(id), accepted_wedding uuid references public.weddings(id) on delete cascade,
  check ((accepted_by is null) = (accepted_wedding is null)),
  check (accepted_wedding is null or target_wedding is null or accepted_wedding=target_wedding)
);
create index planner_invitation_email on private.planner_invitations(email);
create index planner_invitation_target on private.planner_invitations(target_wedding);
alter table private.beta_operators enable row level security;
alter table private.planner_invitations enable row level security;
revoke all on private.beta_operators, private.planner_invitations from public,anon,authenticated;

-- Enable in Auth before opening email/password signups. The supplied ID selects a server-issued
-- invitation; user metadata never establishes membership or the identity used for acceptance.
create function public.before_beta_signup(event jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  select case when exists (
    select from private.planner_invitations i
    where i.id::text=event#>>'{user,user_metadata,planner_invitation}'
      and i.email=lower(trim(event#>>'{user,email}'))
      and i.revoked_at is null and i.accepted_by is null and i.expires_at>now()
  ) then '{}'::jsonb else jsonb_build_object('error',jsonb_build_object('http_code',403,
    'message','Use a current Our Big Day invitation and its invited email address.')) end;
$$;
grant usage on schema public,private to supabase_auth_admin;
grant select on private.planner_invitations to supabase_auth_admin;
create policy auth_can_check_invitation on private.planner_invitations for select to supabase_auth_admin using(true);
revoke all on function public.before_beta_signup(jsonb) from public,anon,authenticated;
grant execute on function public.before_beta_signup(jsonb) to supabase_auth_admin;

create function private.verified_planner_email() returns text language sql stable security definer set search_path='' as $$
  select lower(trim(email)) from auth.users where id=(select auth.uid()) and email_confirmed_at is not null;
$$;
revoke all on function private.verified_planner_email() from public,anon,authenticated;

create function private.planner_access(link_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  with caller as materialized (select auth.uid() uid, private.verified_planner_email() email),
  member_weddings as materialized (
    select w.id,w.name from public.weddings w join public.wedding_members m on m.wedding_id=w.id
    where m.user_id=(select uid from caller)
  ), active as materialized (
    select i.*,w.name wedding_name from private.planner_invitations i left join public.weddings w on w.id=i.target_wedding
    where i.revoked_at is null and i.accepted_by is null and i.expires_at>now()
      and (i.email=(select email from caller) or i.target_wedding in(select id from member_weddings)
        or (i.target_wedding is null and exists(select from private.beta_operators where user_id=(select uid from caller))))
  )
  select jsonb_build_object(
    'operator',email is not null and exists(select from private.beta_operators where user_id=uid),
    'weddings',coalesce((select jsonb_agg(m order by name,id) from member_weddings m),'[]'),
    'incoming',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'wedding',a.wedding_name) order by a.expires_at)
      from active a where a.email=caller.email),'[]'),
    'outgoing',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'email',a.email,'target',a.target_wedding,
      'wedding',a.wedding_name,'expires_at',a.expires_at) order by a.expires_at) from active a where
      a.target_wedding in(select id from member_weddings) or (a.target_wedding is null and exists(select from private.beta_operators where user_id=uid))),'[]'),
    'accepted_wedding',(select accepted_wedding from private.planner_invitations where id=link_id and accepted_by=uid and accepted_wedding in(select id from member_weddings))
  ) from caller where uid is not null;
$$;

create function private.issue_planner_invite(w uuid, recipient text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); address text:=lower(trim(recipient)); invitation uuid;
begin
  if actor is null or private.verified_planner_email() is null then raise exception 'Confirm your email before inviting anyone'; end if;
  if w is null then
    if not exists(select from private.beta_operators where user_id=actor) then raise exception 'Beta operator access required'; end if;
  elsif not private.is_member(w) then raise exception 'Wedding unavailable'; end if;
  if address is null or length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email address'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(w::text,'new')||':'||address,0));
  if w is not null and exists(select from auth.users u join public.wedding_members m on m.user_id=u.id
    where m.wedding_id=w and lower(u.email)=address and u.email_confirmed_at is not null) then raise exception 'That person already belongs to this wedding'; end if;
  if w is null and exists(select from private.planner_invitations where target_wedding is null and email=address and accepted_by is not null)
    then raise exception 'That beta invitation has already been accepted'; end if;
  select id into invitation from private.planner_invitations where target_wedding is not distinct from w and email=address
    and expires_at>clock_timestamp() and accepted_by is null and revoked_at is null;
  if invitation is null then
    insert into private.planner_invitations(email,target_wedding,issued_by) values(address,w,actor) returning id into invitation;
  end if;
  return invitation;
end $$;

create function private.revoke_planner_invite(invitation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare i private.planner_invitations;
begin
  select * into i from private.planner_invitations where id=invitation for update;
  if not found or auth.uid() is null or (i.target_wedding is null and not exists(select from private.beta_operators where user_id=auth.uid()))
    or (i.target_wedding is not null and not private.is_member(i.target_wedding)) then raise exception 'Invitation unavailable'; end if;
  if i.accepted_by is not null then raise exception 'This invitation has already been accepted'; end if;
  update private.planner_invitations set revoked_at=coalesce(revoked_at,now()) where id=i.id;
end $$;

create function private.accept_planner_invite(invitation uuid, member_name text, wedding_name text, zone text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i private.planner_invitations; w uuid; actor uuid:=auth.uid(); verified text:=private.verified_planner_email();
begin
  select * into i from private.planner_invitations where id=invitation for update;
  if not found or verified is null or i.email<>verified or i.revoked_at is not null then raise exception 'Invitation unavailable for this account'; end if;
  if i.accepted_by=actor and private.is_member(i.accepted_wedding) then return i.accepted_wedding; end if;
  if i.accepted_by is not null or i.expires_at<=clock_timestamp() then raise exception 'Invitation expired or already used. Ask for a new link.'; end if;
  if coalesce(length(trim(member_name)),0) not between 1 and 100 then raise exception 'Enter your display name (1–100 characters)'; end if;
  w:=i.target_wedding;
  if w is null then
    if coalesce(length(trim(wedding_name)),0) not between 1 and 120 then raise exception 'Enter a wedding name (1–120 characters)'; end if;
    if not exists(select from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Choose a valid wedding time zone'; end if;
    insert into public.weddings(name,time_zone) values(trim(wedding_name),zone) returning id into w;
  end if;
  insert into public.wedding_members(wedding_id,user_id,display_name) values(w,actor,trim(member_name)) on conflict do nothing;
  update private.planner_invitations set accepted_by=actor,accepted_wedding=w where id=i.id;
  return w;
end $$;

-- Exposed RPCs run as the caller. Privileged implementations check the account at each boundary.
create function public.planner_access(link_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.planner_access(link_id);
$$;
create function public.issue_planner_invite(w uuid,recipient text) returns uuid language sql security invoker set search_path='' as $$
  select private.issue_planner_invite(w,recipient);
$$;
create function public.revoke_planner_invite(invitation uuid) returns void language sql security invoker set search_path='' as $$
  select private.revoke_planner_invite(invitation);
$$;
create function public.accept_planner_invite(invitation uuid,member_name text,wedding_name text,zone text) returns uuid language sql security invoker set search_path='' as $$
  select private.accept_planner_invite(invitation,member_name,wedding_name,zone);
$$;
do $$ declare s text; signature text; begin
  foreach s in array array['private','public'] loop
    foreach signature in array array['planner_access(uuid)','issue_planner_invite(uuid,text)','revoke_planner_invite(uuid)','accept_planner_invite(uuid,text,text,text)'] loop
      execute format('revoke all on function %I.%s from public,anon,authenticated',s,signature);
      execute format('grant execute on function %I.%s to authenticated',s,signature);
    end loop;
  end loop;
end $$;
