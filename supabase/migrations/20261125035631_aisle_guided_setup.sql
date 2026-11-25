-- Keep existing weddings opt-in. New weddings start at the settings step.
alter table public.weddings
  add column aisle_step text check (aisle_step in ('settings','first_action','complete')),
  add column aisle_paused boolean not null default false;
alter table public.weddings alter column aisle_step set default 'settings';

-- An undated follow-up belongs on the existing vendor record.
alter table public.vendors
  add column next_step text check (length(next_step) <= 500);
