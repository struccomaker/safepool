alter table public.pending_contributions
  add column if not exists donor_name text;

alter table public.pending_contributions
  add column if not exists is_anonymous boolean;

update public.pending_contributions
set donor_name = coalesce(nullif(trim(donor_name), ''), 'SafePool Member')
where donor_name is null or trim(donor_name) = '';

update public.pending_contributions
set is_anonymous = coalesce(is_anonymous, false)
where is_anonymous is null;

alter table public.pending_contributions
  alter column donor_name set default 'SafePool Member';

alter table public.pending_contributions
  alter column donor_name set not null;

alter table public.pending_contributions
  alter column is_anonymous set default false;

alter table public.pending_contributions
  alter column is_anonymous set not null;

alter table public.contributions
  add column if not exists donor_name text;

alter table public.contributions
  add column if not exists is_anonymous boolean;

update public.contributions
set donor_name = coalesce(nullif(trim(donor_name), ''), 'SafePool Member')
where donor_name is null or trim(donor_name) = '';

update public.contributions
set is_anonymous = coalesce(is_anonymous, false)
where is_anonymous is null;

alter table public.contributions
  alter column donor_name set default 'SafePool Member';

alter table public.contributions
  alter column donor_name set not null;

alter table public.contributions
  alter column is_anonymous set default false;

alter table public.contributions
  alter column is_anonymous set not null;

alter table public.recurring_contributions
  add column if not exists donor_name text;

alter table public.recurring_contributions
  add column if not exists is_anonymous boolean;

update public.recurring_contributions
set donor_name = coalesce(nullif(trim(donor_name), ''), 'SafePool Member')
where donor_name is null or trim(donor_name) = '';

update public.recurring_contributions
set is_anonymous = coalesce(is_anonymous, false)
where is_anonymous is null;

alter table public.recurring_contributions
  alter column donor_name set default 'SafePool Member';

alter table public.recurring_contributions
  alter column donor_name set not null;

alter table public.recurring_contributions
  alter column is_anonymous set default false;

alter table public.recurring_contributions
  alter column is_anonymous set not null;
