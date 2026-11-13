-- ADMINISTRATIVE TEMPLATE. Review target project and obtain approval before running.
-- First create two confirmed, password-enabled Auth users in the dashboard.
-- Replace the two UUID placeholders with their Auth user IDs. Never add passwords here.
-- Run once via the Supabase SQL editor as the administrator, NOT via the browser.
begin;
do $$
declare
  partner_a uuid := 'REPLACE_WITH_FIRST_AUTH_USER_UUID';
  partner_b uuid := 'REPLACE_WITH_SECOND_AUTH_USER_UUID';
  wedding uuid := gen_random_uuid();
begin
  if partner_a = partner_b or (select count(*) from auth.users where id in (partner_a,partner_b)) <> 2 then
    raise exception 'Two distinct existing Auth users are required';
  end if;
  if exists(select 1 from public.wedding_members where user_id in (partner_a,partner_b)) then
    raise exception 'A partner already has a wedding. Review existing memberships instead of provisioning twice.';
  end if;
  insert into public.weddings(id,name,currency,cap_cents,time_zone)
    values(wedding,'Beya’s big day','USD',0,'America/New_York');
  insert into public.wedding_members(wedding_id,user_id,display_name)
    values(wedding,partner_a,'Maya'),(wedding,partner_b,'Ben');
  insert into public.categories(wedding_id,name)
    select wedding,name from unnest(array['Rentals','Food','Décor','Invitations','Photography','Music','Favors','Attire','Venue']) name;
  raise notice 'Provisioned wedding ID: %',wedding;
end;
$$;
commit;
