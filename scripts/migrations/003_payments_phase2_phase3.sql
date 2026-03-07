CREATE TABLE IF NOT EXISTS payment_grant_sessions (
  id UUID,
  flow Enum('incoming','outgoing','recurring'),
  reference_id UUID,
  continue_uri String,
  continue_access_token String,
  finish_nonce String,
  payload_json String,
  status Enum('pending','completed','failed','expired'),
  error_message String DEFAULT '',
  created_at DateTime DEFAULT now(),
  updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
  ORDER BY (id);

CREATE TABLE IF NOT EXISTS payment_status_cache (
  payment_id String,
  payment_type Enum('incoming','outgoing'),
  state Enum('pending','processing','completed','failed'),
  received_amount Decimal(18,6),
  last_checked DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(last_checked)
  ORDER BY (payment_id);

CREATE TABLE IF NOT EXISTS recurring_contributions (
  id UUID DEFAULT generateUUIDv4(),
  member_id UUID,
  pool_id UUID,
  member_wallet_address String,
  amount Decimal(18,6),
  currency LowCardinality(String),
  interval String,
  next_payment_date DateTime,
  access_token String,
  manage_uri String,
  status Enum('active','paused','cancelled'),
  created_at DateTime DEFAULT now(),
  updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
  ORDER BY (member_id, pool_id, id);
