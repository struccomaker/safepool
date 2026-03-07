create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key,
  email text not null default '',
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  wallet_address text not null,
  provider text not null,
  status text not null check (status in ('provisioned', 'verified', 'manual_required')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_user_wallets_user_wallet
  on public.user_wallets (user_id, wallet_address);

create index if not exists ix_user_wallets_default
  on public.user_wallets (user_id, is_default, created_at desc);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  wallet_address text not null,
  location_lat double precision not null,
  location_lon double precision not null,
  household_size integer not null default 1,
  joined_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_members_pool_user
  on public.members (pool_id, user_id)
  where is_active = true;

create index if not exists ix_members_user_active
  on public.members (user_id, is_active, joined_at desc);

create table if not exists public.pending_contributions (
  id uuid primary key,
  pool_id uuid not null,
  member_id uuid not null references public.members(id) on delete cascade,
  amount numeric(18, 6) not null,
  currency text not null,
  incoming_payment_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contributions (
  id uuid primary key,
  pool_id uuid not null,
  member_id uuid not null references public.members(id) on delete cascade,
  amount numeric(18, 6) not null,
  currency text not null,
  incoming_payment_id text not null,
  contributed_at timestamptz not null default now(),
  status text not null check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_contributions_member_time
  on public.contributions (member_id, contributed_at desc);

create index if not exists ix_contributions_pool_time
  on public.contributions (pool_id, contributed_at desc);

create table if not exists public.payment_grant_sessions (
  id uuid primary key,
  flow text not null check (flow in ('incoming', 'outgoing', 'recurring')),
  reference_id uuid not null,
  continue_uri text not null,
  continue_access_token text not null,
  finish_nonce text not null,
  payload_json text not null,
  status text not null check (status in ('pending', 'completed', 'failed', 'expired')),
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_payment_grant_sessions_lookup
  on public.payment_grant_sessions (flow, reference_id, status, updated_at desc);

create table if not exists public.payment_status_cache (
  payment_id text primary key,
  payment_type text not null check (payment_type in ('incoming', 'outgoing')),
  state text not null check (state in ('pending', 'processing', 'completed', 'failed')),
  received_amount numeric(18, 6) not null,
  last_checked timestamptz not null default now()
);

create table if not exists public.recurring_contributions (
  id uuid primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  pool_id uuid not null,
  member_wallet_address text not null,
  amount numeric(18, 6) not null,
  currency text not null,
  interval text not null check (interval in ('P1D', 'P1W', 'P1M')),
  next_payment_date timestamptz not null,
  access_token text not null,
  manage_uri text not null,
  status text not null check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_recurring_due
  on public.recurring_contributions (status, next_payment_date);

create table if not exists public.proposals (
  id uuid primary key,
  pool_id uuid not null,
  proposed_by uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text not null,
  change_type text not null check (change_type in ('trigger_rules', 'distribution_model', 'payout_cap', 'contribution_amount')),
  new_value text not null,
  created_at timestamptz not null default now(),
  voting_ends_at timestamptz not null,
  status text not null check (status in ('open', 'passed', 'rejected', 'expired'))
);

create index if not exists ix_proposals_pool_time
  on public.proposals (pool_id, created_at desc);

create table if not exists public.votes (
  id uuid primary key,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  pool_id uuid not null,
  vote text not null check (vote in ('yes', 'no', 'abstain')),
  voted_at timestamptz not null default now()
);

create unique index if not exists ux_votes_proposal_member
  on public.votes (proposal_id, member_id);

create table if not exists public.payouts (
  id uuid primary key,
  pool_id uuid not null,
  disaster_event_id uuid,
  member_id uuid not null references public.members(id) on delete cascade,
  amount numeric(18, 6) not null,
  currency text not null,
  outgoing_payment_id text not null default '',
  distribution_rule text not null,
  payout_at timestamptz not null default now(),
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  failure_reason text not null default ''
);

create index if not exists ix_payouts_member_time
  on public.payouts (member_id, payout_at desc);

create or replace function public.enforce_single_default_wallet()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.user_wallets
      set is_default = false,
          updated_at = now()
      where user_id = new.user_id
        and id <> new.id
        and is_default = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_single_default_wallet on public.user_wallets;
create trigger trg_enforce_single_default_wallet
before insert or update on public.user_wallets
for each row execute function public.enforce_single_default_wallet();
