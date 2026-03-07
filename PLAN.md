# SafePool – Community-Powered Emergency Funds
## HACKOMANIA 2026 | Interledger + ClickHouse Challenge

---

## Context
Natural disasters devastate communities but emergency financial aid is slow, opaque, and inaccessible. SafePool is a programmable, community-driven emergency fund platform inspired by ROSCAs. Communities pool micro-contributions in advance, set transparent payout rules, and receive automatic Interledger payouts the moment a verified disaster strikes. ClickHouse powers real-time fund analytics, contribution tracking, and disaster correlation — turning raw events into actionable, auditable financial flows.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  SAFEPOOL (Next.js 14 on Vercel)         │
│                                                          │
│  Frontend (RSC + Tailwind)    API Routes (Node runtime)  │
│  /dashboard                   /api/pools                 │
│  /pools/[id]                  /api/payments              │
│  /contribute                  /api/disasters             │
│  /disasters                   /api/governance            │
│  /governance                  /api/analytics             │
│  /analytics                   /api/cron/poll-disasters   │
│  /profile                     /api/cron/process-payouts  │
└───────────────────┬──────────────────────────────────────┘
                    │
     ┌──────────────┼────────────────┐
     ▼              ▼                ▼
┌─────────┐  ┌──────────────┐  ┌──────────────────────┐
│ClickHouse│  │ Open Payments │  │  Disaster APIs       │
│  Cloud   │  │  (Interledger)│  │  USGS Earthquake     │
│          │  │               │  │  GDACS (UN)          │
│ 8 tables │  │ Testnet:      │  │  OpenWeatherMap      │
│ 4 mat.   │  │ wallet.       │  │  ReliefWeb           │
│ views    │  │ interledger-  │  └──────────────────────┘
└─────────┘  │ test.dev      │
             └──────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes (Node.js runtime) |
| Database | ClickHouse Cloud (primary) |
| Payments | `@interledger/open-payments` SDK |
| Auth | NextAuth.js (email/magic link) |
| Disaster | USGS + GDACS + OpenWeatherMap (polling cron) |
| Charts | Recharts / TanStack Query |
| Deploy | Vercel (app) + ClickHouse Cloud (DB) |

---

## ClickHouse Schema

### Core Tables

```sql
-- Communities/pools
CREATE TABLE pools (
  id UUID DEFAULT generateUUIDv4(),
  name String,
  description String,
  created_by UUID,
  distribution_model Enum('equal_split','severity_based','household_size','capped'),
  contribution_frequency Enum('daily','weekly','monthly','event_based'),
  contribution_amount Decimal(18,6),
  currency LowCardinality(String),
  trigger_rules String,        -- JSON: { minMagnitude, disasterTypes, radius_km }
  governance_rules String,     -- JSON: { quorum_pct, vote_threshold }
  payout_cap Decimal(18,6),
  created_at DateTime DEFAULT now(),
  is_active UInt8 DEFAULT 1
) ENGINE = MergeTree() ORDER BY (id, created_at);

-- Pool members
CREATE TABLE members (
  id UUID DEFAULT generateUUIDv4(),
  pool_id UUID,
  user_id UUID,
  wallet_address String,       -- Open Payments wallet address URL
  location_lat Float64,
  location_lon Float64,
  household_size UInt8 DEFAULT 1,
  joined_at DateTime DEFAULT now(),
  is_active UInt8 DEFAULT 1
) ENGINE = MergeTree() ORDER BY (pool_id, user_id);

-- Contributions (time-series, high-volume)
CREATE TABLE contributions (
  id UUID DEFAULT generateUUIDv4(),
  pool_id UUID,
  member_id UUID,
  amount Decimal(18,6),
  currency LowCardinality(String),
  incoming_payment_id String,  -- Open Payments resource ID
  contributed_at DateTime DEFAULT now(),
  status Enum('pending','completed','failed')
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(contributed_at)
  ORDER BY (pool_id, contributed_at, member_id);

-- Disaster events from external APIs
CREATE TABLE disaster_events (
  id UUID DEFAULT generateUUIDv4(),
  source LowCardinality(String), -- 'usgs','gdacs','owm'
  external_id String,
  disaster_type Enum('earthquake','flood','typhoon','cyclone','volcanic','tsunami','fire'),
  magnitude Float64,
  severity Enum('low','medium','high','critical'),
  location_name String,
  location_lat Float64,
  location_lon Float64,
  occurred_at DateTime,
  raw_data String,             -- full JSON response
  processed UInt8 DEFAULT 0
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(occurred_at)
  ORDER BY (occurred_at, disaster_type, severity);

-- Payouts (time-series)
CREATE TABLE payouts (
  id UUID DEFAULT generateUUIDv4(),
  pool_id UUID,
  disaster_event_id UUID,
  member_id UUID,
  amount Decimal(18,6),
  currency LowCardinality(String),
  outgoing_payment_id String,  -- Open Payments resource ID
  distribution_rule String,
  payout_at DateTime DEFAULT now(),
  status Enum('pending','processing','completed','failed'),
  failure_reason String DEFAULT ''
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(payout_at)
  ORDER BY (pool_id, payout_at);

-- Governance proposals
CREATE TABLE proposals (
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

-- Governance votes
CREATE TABLE votes (
  id UUID DEFAULT generateUUIDv4(),
  proposal_id UUID,
  member_id UUID,
  pool_id UUID,
  vote Enum('yes','no','abstain'),
  voted_at DateTime DEFAULT now()
) ENGINE = MergeTree() ORDER BY (proposal_id, member_id);

-- Users
CREATE TABLE users (
  id UUID DEFAULT generateUUIDv4(),
  email String,
  name String,
  created_at DateTime DEFAULT now()
) ENGINE = MergeTree() ORDER BY (id);
```

### Materialized Views (Real-Time Analytics)

```sql
-- 1. Pool fund balance (live total)
CREATE MATERIALIZED VIEW pool_balances
ENGINE = SummingMergeTree()
ORDER BY (pool_id, month)
POPULATE AS
SELECT
  pool_id,
  toYYYYMM(contributed_at) AS month,
  sumIf(amount, status='completed') AS total_in,
  count() AS contribution_count
FROM contributions
GROUP BY pool_id, month;

-- 2. Disaster-to-payout latency tracking
CREATE MATERIALIZED VIEW payout_latency
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
CREATE MATERIALIZED VIEW contribution_streaks
ENGINE = SummingMergeTree()
ORDER BY (pool_id, member_id, week)
POPULATE AS
SELECT
  pool_id,
  member_id,
  toISOWeek(contributed_at) AS week,
  toISOYear(contributed_at) AS year,
  countIf(status='completed') AS weekly_contributions
FROM contributions
GROUP BY pool_id, member_id, week, year;

-- 4. Geographic disaster heatmap
CREATE MATERIALIZED VIEW disaster_heatmap
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
```

---

## API Route Structure

```
/api/
├── auth/[...nextauth]          # NextAuth login
├── pools/
│   ├── GET /                   # List all pools
│   ├── POST /                  # Create pool
│   ├── GET /[id]               # Pool details
│   └── GET /[id]/analytics     # ClickHouse fund stats
├── members/
│   ├── POST /join              # Join pool (register wallet)
│   └── GET /[poolId]           # List pool members
├── payments/
│   ├── POST /contribute        # Create ILP incoming payment
│   ├── POST /confirm           # Confirm contribution received
│   └── GET /history/[poolId]   # Contribution history from CH
├── disasters/
│   ├── GET /                   # List disaster events
│   ├── GET /check/[poolId]     # Check if pool triggered
│   └── POST /manual-trigger    # Demo: manually trigger payout
├── governance/
│   ├── GET /proposals/[poolId] # List proposals
│   ├── POST /propose           # Create proposal
│   └── POST /vote              # Cast vote
├── analytics/
│   ├── GET /fund-balance       # Real-time ClickHouse balance
│   ├── GET /contribution-trend # Time-series contributions
│   ├── GET /payout-stats       # Payout analytics
│   └── GET /disaster-map       # Geographic heatmap data
└── cron/
    ├── GET /poll-disasters      # Fetch new disaster events
    └── GET /process-payouts     # Auto-trigger eligible payouts
```

---

## Open Payments Integration Flow

```
CONTRIBUTION FLOW:
1. Member clicks "Contribute" → frontend calls POST /api/payments/contribute
2. Backend: authenticatedClient.incomingPayment.create()
   - Creates incoming payment on pool's wallet address
   - Returns payment URL + amount
3. Frontend: redirect member to their wallet provider to authorize
4. On webhook/polling confirm: insert into contributions table (ClickHouse)
5. Materialized view auto-updates pool_balances

PAYOUT FLOW (auto-triggered):
1. Cron /api/cron/poll-disasters runs every 5 minutes
2. Fetches latest events from USGS/GDACS/OWM
3. Inserts new events into disaster_events table
4. Cron /api/cron/process-payouts:
   a. Queries: SELECT pools where trigger_rules match new events
   b. For each affected member (geo-radius check):
      - Calculate payout amount (per distribution_model)
      - authenticatedClient.outgoingPayment.create() → sends ILP payment
      - Insert payout record into payouts table
5. Dashboard updates in real-time from ClickHouse materialized views
```

---

## Disaster Trigger Engine Logic

```typescript
// Trigger evaluation pseudocode
async function evaluateTrigger(pool, disasterEvent) {
  const rules = JSON.parse(pool.trigger_rules);

  // Check disaster type
  if (!rules.disasterTypes.includes(disasterEvent.disaster_type)) return false;

  // Check magnitude/severity
  if (disasterEvent.magnitude < rules.minMagnitude) return false;

  // Check geographic radius (using Haversine formula)
  const affectedMembers = pool.members.filter(m =>
    haversineDistance(m.lat, m.lon, disasterEvent.lat, disasterEvent.lon)
    <= rules.radius_km
  );

  return affectedMembers.length > 0 ? affectedMembers : false;
}

// Distribution models
function calculatePayout(pool, affectedMembers, totalFunds) {
  switch(pool.distribution_model) {
    case 'equal_split':
      return totalFunds / affectedMembers.length;
    case 'severity_based':
      return (totalFunds * severityMultiplier[disaster.severity]) / affectedMembers.length;
    case 'household_size':
      const totalUnits = affectedMembers.reduce((s,m) => s + m.household_size, 0);
      return (m.household_size / totalUnits) * totalFunds;
    case 'capped':
      return Math.min(totalFunds / affectedMembers.length, pool.payout_cap);
  }
}
```

---

## Frontend Page Structure

```
app/
├── page.tsx                    # Landing/hero page
├── dashboard/page.tsx          # User dashboard (pools, recent activity)
├── pools/
│   ├── page.tsx                # Browse pools
│   ├── create/page.tsx         # Create new pool
│   └── [id]/
│       ├── page.tsx            # Pool overview + analytics
│       ├── contribute/page.tsx # Make contribution (ILP flow)
│       ├── governance/page.tsx # Proposals + voting
│       └── members/page.tsx    # Member list
├── disasters/page.tsx          # Live disaster feed + map
├── analytics/page.tsx          # Global ClickHouse analytics
└── profile/page.tsx            # User wallet, history
```

### Key UI Components:
- `FundMeter` — real-time pool balance gauge
- `DisasterMap` — Leaflet.js map with disaster pins + affected pool radius
- `ContributionTimeline` — Recharts area chart (ClickHouse time-series)
- `PayoutTracker` — real-time payout status feed
- `GovernanceVote` — proposal cards with live vote counts
- `DisasterTriggerAlert` — red alert banner when payout auto-triggered

---

## Innovation Highlights (for Judges)

1. **ClickHouse as the Intelligence Layer**: Not just storage — materialized views compute real-time fund balances, disaster-to-payout latency, contribution streaks, and geographic heatmaps at sub-second speed. Enables transparent, auditable analytics.

2. **Fully Automated Payout**: Zero manual steps — disaster detected → geo-match → ILP payment sent. Demonstrates Open Payments programmatic disbursement.

3. **ROSCA Modernized**: Traditional rotating savings made digital, borderless, and disaster-responsive with Web Monetization standards.

4. **Privacy by Design**: Wallet addresses (not bank details), no public hardship disclosure, consent-based location sharing.

5. **Community Governance**: On-chain-inspired voting for rules, thresholds, allocation models — built on ClickHouse vote aggregation.

---

## 4-Day Hackathon Timeline

### Day 1 — Foundation (Hours 1-8)
**Morning (1-4h)**:
- [ ] `npx create-next-app@latest safepool --typescript --tailwind`
- [ ] Set up ClickHouse Cloud account + get connection string
- [ ] Install deps: `@clickhouse/client`, `@interledger/open-payments`, `next-auth`, `shadcn/ui`, `recharts`
- [ ] Create all 8 ClickHouse tables + 4 materialized views
- [ ] Basic NextAuth setup (email magic link)

**Afternoon (5-8h)**:
- [ ] ClickHouse client singleton (`lib/clickhouse.ts`)
- [ ] Seed demo data (pools, members, contributions, disasters)
- [ ] Open Payments testnet accounts setup (`wallet.interledger-test.dev`)
- [ ] Environment variables + Vercel project setup

### Day 2 — Core Backend (Hours 9-16)
**Morning (9-12h)**:
- [ ] API: `/api/pools` CRUD
- [ ] API: `/api/members/join` with wallet address registration
- [ ] API: `/api/payments/contribute` → ILP IncomingPayment create
- [ ] API: `/api/payments/confirm` → insert to ClickHouse

**Afternoon (13-16h)**:
- [ ] Disaster polling service: USGS + GDACS fetch + insert
- [ ] `/api/cron/poll-disasters` endpoint
- [ ] Trigger evaluation engine (geo-radius + rules matching)
- [ ] Payout calculation engine (all 4 distribution models)
- [ ] `/api/cron/process-payouts` → ILP OutgoingPayment create

### Day 3 — Frontend + Analytics (Hours 17-24)
**Morning (17-20h)**:
- [ ] Landing page + dashboard
- [ ] Pool listing + creation form
- [ ] Pool detail page with `FundMeter` + `ContributionTimeline`
- [ ] Contribution flow (ILP payment redirect)

**Afternoon (21-24h)**:
- [ ] Disaster feed page + `DisasterMap` (Leaflet.js)
- [ ] Governance page (proposals + voting)
- [ ] Analytics page (ClickHouse real-time charts)
- [ ] `PayoutTracker` real-time component
- [ ] Profile page

### Day 4 — Polish + Demo (Hours 25-32)
**Morning (25-28h)**:
- [ ] End-to-end demo flow test
- [ ] Manual trigger demo button (for presentation)
- [ ] Mobile responsive tweaks
- [ ] Error handling + loading states

**Afternoon (29-32h)**:
- [ ] Deploy to Vercel production
- [ ] ClickHouse Cloud production config
- [ ] Demo script preparation
- [ ] Presentation slides
- [ ] README + architecture diagram

---

## Files to Create

```
safepool/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── dashboard/page.tsx
│   ├── pools/
│   │   ├── page.tsx
│   │   ├── create/page.tsx
│   │   └── [id]/page.tsx
│   ├── disasters/page.tsx
│   ├── analytics/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── pools/route.ts
│       ├── payments/contribute/route.ts
│       ├── disasters/route.ts
│       ├── governance/route.ts
│       ├── analytics/route.ts
│       └── cron/
│           ├── poll-disasters/route.ts
│           └── process-payouts/route.ts
├── lib/
│   ├── clickhouse.ts           # CH client singleton
│   ├── open-payments.ts        # ILP client + helpers
│   ├── disaster-engine.ts      # Trigger evaluation
│   ├── payout-engine.ts        # Distribution logic
│   └── disaster-apis.ts        # USGS/GDACS/OWM fetchers
├── components/
│   ├── FundMeter.tsx
│   ├── DisasterMap.tsx
│   ├── ContributionTimeline.tsx
│   ├── PayoutTracker.tsx
│   └── GovernanceVote.tsx
└── types/
    └── index.ts                # Shared TypeScript types
```

---

## Environment Variables Required

```env
# ClickHouse Cloud
CLICKHOUSE_HOST=https://xxx.clickhouse.cloud
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=xxx
CLICKHOUSE_DATABASE=safepool

# Open Payments (Interledger)
OPEN_PAYMENTS_KEY_ID=xxx
OPEN_PAYMENTS_PRIVATE_KEY=xxx
POOL_WALLET_ADDRESS=https://wallet.interledger-test.dev/safepool

# Disaster APIs
OPENWEATHERMAP_API_KEY=xxx

# NextAuth
NEXTAUTH_SECRET=xxx
NEXTAUTH_URL=https://safepool.vercel.app

# Cron security
CRON_SECRET=xxx
```

---

## Verification / Demo Flow

1. Create a pool "Manila Flood Relief" with earthquake + flood triggers, equal split distribution
2. Add 5 demo members with Philippine coordinates and test wallets
3. Make 3 contributions via ILP → verify in ClickHouse `contributions` table
4. Check analytics page → fund balance updates in real-time (materialized view)
5. Click "Simulate Disaster" → magnitude 6.5 earthquake in Metro Manila
6. Watch cron trigger → payout records created → ILP outgoing payments sent
7. Show `PayoutTracker` updating live → "Payout completed in 2.3 seconds"
8. Show ClickHouse analytics: contribution trends, payout latency, disaster heatmap
