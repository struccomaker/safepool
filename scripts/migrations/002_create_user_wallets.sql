CREATE TABLE IF NOT EXISTS user_wallets (
  id UUID DEFAULT generateUUIDv4(),
  user_id UUID,
  wallet_address String,
  provider LowCardinality(String),
  status Enum('provisioned','verified','manual_required'),
  is_default UInt8 DEFAULT 1,
  created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (user_id, created_at, id);
