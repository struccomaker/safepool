-- SafePool ClickHouse Schema
-- Run this in ClickHouse Cloud SQL console before first use

-- ─── Core Tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pools (
  id UUID DEFAULT generateUUIDv4(),
  name String,
  description String,
  created_by UUID,
  distribution_model Enum('equal_split','severity_based','household_size','capped'),
  contribution_frequency Enum('daily','weekly','monthly','event_based'),
  contribution_amount Decimal(18,6),
  currency LowCardinality(String),
  trigger_rules String,
  governance_rules String,
  payout_cap Decimal(18,6),
  created_at DateTime DEFAULT now(),
  is_active UInt8 DEFAULT 1
) ENGINE = MergeTree() ORDER BY (id, created_at);

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT generateUUIDv4(),
  email String,
  name String,
  created_at DateTime DEFAULT now()
) ENGINE = MergeTree() ORDER BY (id);

CREATE TABLE IF NOT EXISTS members (
  id UUID DEFAULT generateUUIDv4(),
  pool_id UUID,
  user_id UUID,
  wallet_address String,
  location_lat Float64,
  location_lon Float64,
  household_size UInt8 DEFAULT 1,
  joined_at DateTime DEFAULT now(),
  is_active UInt8 DEFAULT 1
) ENGINE = MergeTree() ORDER BY (pool_id, user_id);

CREATE TABLE IF NOT EXISTS contributions (
  id UUID DEFAULT generateUUIDv4(),
  pool_id UUID,
  member_id UUID,
  amount Decimal(18,6),
  currency LowCardinality(String),
  incoming_payment_id String,
  contributed_at DateTime DEFAULT now(),
  status Enum('pending','completed','failed')
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(contributed_at)
  ORDER BY (pool_id, contributed_at, member_id);

CREATE TABLE IF NOT EXISTS pending_contributions (
  id UUID,
  pool_id UUID,
  member_id UUID,
  amount Decimal(18,6),
  currency LowCardinality(String),
  incoming_payment_id String,
  created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(created_at)
  ORDER BY (pool_id, created_at, member_id, id);

CREATE TABLE IF NOT EXISTS disaster_events (
  id UUID DEFAULT generateUUIDv4(),
  source LowCardinality(String),
  external_id String,
  disaster_type Enum('earthquake','flood','typhoon','cyclone','volcanic','tsunami','fire'),
  magnitude Float64,
  severity Enum('low','medium','high','critical'),
  location_name String,
  location_lat Float64,
  location_lon Float64,
  occurred_at DateTime,
  raw_data String,
  processed UInt8 DEFAULT 0
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(occurred_at)
  ORDER BY (occurred_at, disaster_type, severity);

CREATE TABLE IF NOT EXISTS payouts (
  id UUID DEFAULT generateUUIDv4(),
  pool_id UUID,
  disaster_event_id UUID,
  member_id UUID,
  amount Decimal(18,6),
  currency LowCardinality(String),
  outgoing_payment_id String,
  distribution_rule String,
  payout_at DateTime DEFAULT now(),
  status Enum('pending','processing','completed','failed'),
  failure_reason String DEFAULT ''
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(payout_at)
  ORDER BY (pool_id, payout_at);

CREATE TABLE IF NOT EXISTS disaster_event_processing (
  event_id UUID,
  claim_token UUID,
  status Enum('processing','completed','failed'),
  failure_reason String DEFAULT '',
  processed_at DateTime64(3) DEFAULT now64(3),
  payouts_count UInt32
) ENGINE = ReplacingMergeTree(processed_at)
  PARTITION BY toYYYYMM(processed_at)
  ORDER BY (event_id);

CREATE TABLE IF NOT EXISTS proposals (
  id UUID DEFAULT generateUUIDv4(),
  pool_id UUID,
  proposed_by UUID,
  title String,
  description String,
  change_type Enum('trigger_rules','distribution_model','payout_cap','contribution_amount'),
  new_value String,
  created_at DateTime DEFAULT now(),
  voting_ends_at DateTime,
  status Enum('open','passed','rejected','expired')
) ENGINE = MergeTree() ORDER BY (pool_id, created_at);

CREATE TABLE IF NOT EXISTS votes (
  id UUID DEFAULT generateUUIDv4(),
  proposal_id UUID,
  member_id UUID,
  pool_id UUID,
  vote Enum('yes','no','abstain'),
  voted_at DateTime DEFAULT now()
) ENGINE = MergeTree() ORDER BY (proposal_id, member_id);

-- ─── Materialized Views ───────────────────────────────────────────────────────

-- 1. Pool fund balance (live total)
CREATE MATERIALIZED VIEW IF NOT EXISTS pool_balances
ENGINE = SummingMergeTree()
ORDER BY (pool_id, month)
POPULATE AS
SELECT
  pool_id,
  toYYYYMM(contributed_at) AS month,
  sumIf(amount, status = 'completed') AS total_in,
  count() AS contribution_count
FROM contributions
GROUP BY pool_id, month;

-- 2. Disaster-to-payout latency
CREATE MATERIALIZED VIEW IF NOT EXISTS payout_latency
ENGINE = AggregatingMergeTree()
ORDER BY (pool_id, disaster_type)
POPULATE AS
SELECT
  p.pool_id,
  d.disaster_type,
  avgState(dateDiff('second', d.occurred_at, p.payout_at)) AS avg_latency_seconds,
  countState() AS payout_count
FROM payouts p
JOIN disaster_events d ON p.disaster_event_id = d.id
WHERE p.status = 'completed'
GROUP BY p.pool_id, d.disaster_type;

-- 3. Member contribution streaks
CREATE MATERIALIZED VIEW IF NOT EXISTS contribution_streaks
ENGINE = SummingMergeTree()
ORDER BY (pool_id, member_id, week)
POPULATE AS
SELECT
  pool_id,
  member_id,
  toISOWeek(contributed_at) AS week,
  toISOYear(contributed_at) AS year,
  countIf(status = 'completed') AS weekly_contributions
FROM contributions
GROUP BY pool_id, member_id, week, year;

-- 4. Geographic disaster heatmap
CREATE MATERIALIZED VIEW IF NOT EXISTS disaster_heatmap
ENGINE = SummingMergeTree()
ORDER BY (grid_lat, grid_lon, disaster_type)
POPULATE AS
SELECT
  round(location_lat, 1) AS grid_lat,
  round(location_lon, 1) AS grid_lon,
  disaster_type,
  count() AS event_count,
  max(magnitude) AS max_magnitude
FROM disaster_events
GROUP BY grid_lat, grid_lon, disaster_type;
