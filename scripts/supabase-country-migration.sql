alter table public.users
  add column if not exists country text;

update public.users
set country = coalesce(nullif(trim(country), ''), 'SG')
where country is null or trim(country) = '';

alter table public.users
  alter column country set default 'SG';

alter table public.users
  alter column country set not null;

alter table public.pending_contributions
  add column if not exists donor_country text;

update public.pending_contributions
set donor_country = coalesce(nullif(trim(donor_country), ''), 'SG')
where donor_country is null or trim(donor_country) = '';

alter table public.pending_contributions
  alter column donor_country set default 'SG';

alter table public.pending_contributions
  alter column donor_country set not null;

alter table public.contributions
  add column if not exists donor_country text;

update public.contributions
set donor_country = coalesce(nullif(trim(donor_country), ''), 'SG')
where donor_country is null or trim(donor_country) = '';

alter table public.contributions
  alter column donor_country set default 'SG';

alter table public.contributions
  alter column donor_country set not null;

alter table public.recurring_contributions
  add column if not exists donor_country text;

update public.recurring_contributions
set donor_country = coalesce(nullif(trim(donor_country), ''), 'SG')
where donor_country is null or trim(donor_country) = '';

alter table public.recurring_contributions
  alter column donor_country set default 'SG';

alter table public.recurring_contributions
  alter column donor_country set not null;
