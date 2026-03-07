# SafePool — Backend Implementation Plan
## Members 2 & 3 | APIs · ClickHouse · Open Payments · SMTP · Cron

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Read `CLAUDE.md` first for full project context.

**Goal:** Build the entire SafePool backend — ClickHouse schema, all API routes, Interledger payment flows, SMTP email confirmations, disaster polling cron, and automated payout engine.

**Architecture:** Next.js 14 App Router API routes write to ClickHouse Cloud. Open Payments SDK handles ILP incoming/outgoing payments. Nodemailer sends SMTP confirmation emails via Gmail. Two Vercel cron jobs poll disaster APIs and trigger payouts.

**Tech Stack:** `@clickhouse/client`, `@interledger/open-payments`, `nodemailer`, `next-auth`, TypeScript, USGS/GDACS/OWM APIs (all free).

---

## Phase 0 — Project Bootstrap (One person runs this, then push to GitHub)

### Task 0.1: Create Next.js app

**Files:**
- Create: `safepool/` (project root)

**Step 1: Run create-next-app**
```bash
cd "C:/Users/kenne/OneDrive/Desktop/nicholas stuff/CODE"
npx create-next-app@latest safepool --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --yes
cd safepool
```

**Step 2: Verify it works**
```bash
npm run dev
# Visit http://localhost:3000 — should show Next.js default page
# Ctrl+C to stop
```

---

### Task 0.2: Install all dependencies

**Step 1: Install backend + UI deps**
```bash
npm install @clickhouse/client @interledger/open-payments nodemailer next-auth
npm install recharts @tanstack/react-query react-leaflet leaflet react-globe.gl
npm install --save-dev @types/nodemailer @types/leaflet
```

**Step 2: Install shadcn/ui**
```bash
npx shadcn@latest init
# When prompted: Default style → New York, Base color → Slate, CSS variables → yes
npx shadcn@latest add button card input label badge progress tabs alert dialog select textarea
```

**Step 3: Verify package.json has all deps**
```bash
cat package.json | grep -E "(clickhouse|open-payments|nodemailer|next-auth|recharts)"
# Should show all 5 packages
```

---

### Task 0.3: Create .env.example and .env.local

**Files:**
- Create: `safepool/.env.example`
- Create: `safepool/.env.local` (fill in real values, never commit)

**Step 1: Create .env.example**
```bash
cat > .env.example << 'EOF'
# ClickHouse Cloud (free: clickhouse.cloud → New Service → free tier)
CLICKHOUSE_HOST=https://xxxxxxxx.clickhouse.cloud
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=safepool

# Open Payments Testnet (free: wallet.interledger-test.dev)
OPEN_PAYMENTS_KEY_ID=
OPEN_PAYMENTS_PRIVATE_KEY=
POOL_WALLET_ADDRESS=https://wallet.interledger-test.dev/safepool

# Disaster APIs
OPENWEATHERMAP_API_KEY=

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# SMTP Email (Gmail — enable 2FA → myaccount.google.com → App Passwords)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourteam@gmail.com
SMTP_PASS=
SMTP_FROM="SafePool <yourteam@gmail.com>"

# Cron security (any random string)
CRON_SECRET=changeme
EOF
```

**Step 2: Copy to .env.local and fill real values**
```bash
cp .env.example .env.local
# Open .env.local and fill in real credentials
```

**Step 3: Add .env.local to .gitignore**
```bash
echo ".env.local" >> .gitignore
```

---

### Task 0.4: Initialize git and push to GitHub

**Step 1: Copy CLAUDE.md into project**
```bash
cp "../CLAUDE.md" ./CLAUDE.md
```

**Step 2: Init git and first commit**
```bash
git init
git add .
git commit -m "chore: bootstrap safepool next.js project"
```

**Step 3: Create GitHub repo and push**
```bash
# Create repo at github.com (free, name: safepool-hackomania)
# Then:
git remote add origin https://github.com/YOUR_USERNAME/safepool-hackomania.git
git branch -M main
git push -u origin main
```

**Step 4: Other members clone**
```bash
git clone https://github.com/YOUR_USERNAME/safepool-hackomania.git
cd safepool-hackomania
npm install
cp .env.example .env.local  # fill in values
```

---

## Phase 1 — Foundation (Member 2 and Member 3 work in parallel after clone)

### Task 1.1: Create shared TypeScript types [Member 2]

**Files:**
- Create: `safepool/types/index.ts`

**Step 1: Write the file**
```typescript
// types/index.ts
export type DistributionModel = 'equal_split' | 'severity_based' | 'household_size' | 'capped'
export type ContributionFrequency = 'daily' | 'weekly' | 'monthly' | 'event_based'
export type DisasterType = 'earthquake' | 'flood' | 'typhoon' | 'cyclone' | 'volcanic' | 'tsunami' | 'fire'
export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface Pool {
  id: string
  name: string
  description: string
  created_by: string
  distribution_model: DistributionModel
  contribution_frequency: ContributionFrequency
  contribution_amount: number
  currency: string
  trigger_rules: string  // JSON string
  governance_rules: string  // JSON string
  payout_cap: number
  created_at: string
  is_active: number
}

export interface TriggerRules {
  minMagnitude: number
  disasterTypes: DisasterType[]
  radius_km: number
}

export interface Member {
  id: string
  pool_id: string
  user_id: string
  wallet_address: string
  location_lat: number
  location_lon: number
  household_size: number
  joined_at: string
  is_active: number
}

export interface Contribution {
  id: string
  pool_id: string
  member_id: string
  amount: number
  currency: string
  incoming_payment_id: string
  contributed_at: string
  status: 'pending' | 'completed' | 'failed'
}

export interface DisasterEvent {
  id: string
  source: string
  external_id: string
  disaster_type: DisasterType
  magnitude: number
  severity: Severity
  location_name: string
  location_lat: number
  location_lon: number
  occurred_at: string
  raw_data: string
  processed: number
}

export interface Payout {
  id: string
  pool_id: string
  disaster_event_id: string
  member_id: string
  amount: number
  currency: string
  outgoing_payment_id: string
  distribution_rule: string
  payout_at: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  failure_reason: string
}

export interface Proposal {
  id: string
  pool_id: string
  proposed_by: string
  title: string
  description: string
  change_type: 'trigger_rules' | 'distribution_model' | 'payout_cap' | 'contribution_amount'
  new_value: string
  created_at: string
  voting_ends_at: string
  status: 'open' | 'passed' | 'rejected' | 'expired'
}

export interface Vote {
  id: string
  proposal_id: string
  member_id: string
  pool_id: string
  vote: 'yes' | 'no' | 'abstain'
  voted_at: string
}

export interface User {
  id: string
  email: string
  name: string
  created_at: string
}

// Ticker event for NASDAQ-style bar
export interface TickerEvent {
  memberName: string
  poolName: string
  amount: number
  currency: string
  contributed_at: string
}
```

**Step 2: Commit**
```bash
git add types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 1.2: Create ClickHouse client singleton [Member 2]

**Files:**
- Create: `safepool/lib/clickhouse.ts`

**Step 1: Write the client**
```typescript
// lib/clickhouse.ts
import { createClient } from '@clickhouse/client'

const client = createClient({
  host: process.env.CLICKHOUSE_HOST ?? 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD ?? '',
  database: process.env.CLICKHOUSE_DATABASE ?? 'safepool',
})

export default client

// Helper: run a query and get typed rows back
export async function query<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  })
  return result.json<T>()
}

// Helper: insert a single row
export async function insert(table: string, values: Record<string, unknown>[]) {
  await client.insert({ table, values, format: 'JSONEachRow' })
}
```

**Step 2: Commit**
```bash
git add lib/clickhouse.ts
git commit -m "feat: add ClickHouse client singleton"
```

---

### Task 1.3: Write and run ClickHouse schema [Member 2]

**Files:**
- Create: `safepool/scripts/init-db.sql`

**Step 1: Write the SQL file**
```sql
-- scripts/init-db.sql
-- Run this in ClickHouse Cloud SQL console

CREATE DATABASE IF NOT EXISTS safepool;
USE safepool;

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT generateUUIDv4(),
  email String,
  name String,
  created_at DateTime DEFAULT now()
) ENGINE = MergeTree() ORDER BY (id);

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

-- MATERIALIZED VIEWS

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

CREATE MATERIALIZED VIEW IF NOT EXISTS contribution_streaks
ENGINE = SummingMergeTree()
ORDER BY (pool_id, member_id, week, year)
POPULATE AS
SELECT
  pool_id,
  member_id,
  toISOWeek(contributed_at) AS week,
  toISOYear(contributed_at) AS year,
  countIf(status = 'completed') AS weekly_contributions
FROM contributions
GROUP BY pool_id, member_id, week, year;

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
```

**Step 2: Run it**
- Go to ClickHouse Cloud → your service → SQL Console
- Paste the entire file and click Run
- Verify: run `SHOW TABLES` → should list all 8 tables + 3 views

**Step 3: Commit**
```bash
git add scripts/init-db.sql
git commit -m "feat: add ClickHouse schema (8 tables + 3 mat views)"
```

---

### Task 1.4: Write seed data script [Member 2]

**Files:**
- Create: `safepool/scripts/seed.ts`

**Step 1: Write the seed script**
```typescript
// scripts/seed.ts
// Run with: npx ts-node --project tsconfig.json scripts/seed.ts
import { createClient } from '@clickhouse/client'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const client = createClient({
  host: process.env.CLICKHOUSE_HOST!,
  username: process.env.CLICKHOUSE_USER!,
  password: process.env.CLICKHOUSE_PASSWORD!,
  database: process.env.CLICKHOUSE_DATABASE!,
})

const POOL_ID = '11111111-1111-1111-1111-111111111111'
const USER_IDS = [
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
]
const MEMBER_IDS = [
  'f1111111-1111-1111-1111-111111111111',
  'f2222222-2222-2222-2222-222222222222',
  'f3333333-3333-3333-3333-333333333333',
  'f4444444-4444-4444-4444-444444444444',
  'f5555555-5555-5555-5555-555555555555',
]

async function seed() {
  console.log('Seeding demo data...')

  // Users
  await client.insert({
    table: 'users', format: 'JSONEachRow',
    values: [
      { id: USER_IDS[0], email: 'maria@demo.com', name: 'Maria Santos' },
      { id: USER_IDS[1], email: 'jose@demo.com', name: 'Jose Reyes' },
      { id: USER_IDS[2], email: 'ana@demo.com', name: 'Ana Cruz' },
      { id: USER_IDS[3], email: 'pedro@demo.com', name: 'Pedro Lim' },
      { id: USER_IDS[4], email: 'luz@demo.com', name: 'Luz Garcia' },
    ],
  })

  // Pool
  await client.insert({
    table: 'pools', format: 'JSONEachRow',
    values: [{
      id: POOL_ID,
      name: 'Manila Flood Relief',
      description: 'Emergency fund for Metro Manila flood and earthquake events',
      created_by: USER_IDS[0],
      distribution_model: 'equal_split',
      contribution_frequency: 'monthly',
      contribution_amount: 10.0,
      currency: 'USD',
      trigger_rules: JSON.stringify({ minMagnitude: 5.5, disasterTypes: ['earthquake', 'flood'], radius_km: 100 }),
      governance_rules: JSON.stringify({ quorum_pct: 51, vote_threshold: 66 }),
      payout_cap: 500.0,
      is_active: 1,
    }],
  })

  // Members (Philippine coordinates — Metro Manila area)
  const coords = [
    [14.5995, 120.9842], // Manila
    [14.6760, 121.0437], // Quezon City
    [14.5547, 121.0244], // Makati
    [14.4793, 121.0198], // Taguig
    [14.7099, 121.0528], // Caloocan
  ]
  await client.insert({
    table: 'members', format: 'JSONEachRow',
    values: USER_IDS.map((uid, i) => ({
      id: MEMBER_IDS[i],
      pool_id: POOL_ID,
      user_id: uid,
      wallet_address: `https://wallet.interledger-test.dev/demo-user-${i + 1}`,
      location_lat: coords[i][0],
      location_lon: coords[i][1],
      household_size: i + 1,
      is_active: 1,
    })),
  })

  // Contributions (last 6 months)
  const contributions = []
  for (let month = 5; month >= 0; month--) {
    for (let i = 0; i < 5; i++) {
      const date = new Date()
      date.setMonth(date.getMonth() - month)
      contributions.push({
        id: `c${month}${i}-0000-0000-0000-000000000000`.substring(0, 36),
        pool_id: POOL_ID,
        member_id: MEMBER_IDS[i],
        amount: 10.0,
        currency: 'USD',
        incoming_payment_id: `ip-demo-${month}-${i}`,
        contributed_at: date.toISOString().replace('T', ' ').substring(0, 19),
        status: 'completed',
      })
    }
  }
  await client.insert({ table: 'contributions', format: 'JSONEachRow', values: contributions })

  // A sample disaster event
  await client.insert({
    table: 'disaster_events', format: 'JSONEachRow',
    values: [{
      id: 'd1111111-1111-1111-1111-111111111111',
      source: 'usgs',
      external_id: 'us7000demo',
      disaster_type: 'earthquake',
      magnitude: 6.5,
      severity: 'high',
      location_name: 'Metro Manila, Philippines',
      location_lat: 14.5995,
      location_lon: 120.9842,
      occurred_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      raw_data: '{}',
      processed: 0,
    }],
  })

  console.log('Seed complete!')
  await client.close()
}

seed().catch(console.error)
```

**Step 2: Run it**
```bash
npx ts-node --project tsconfig.json scripts/seed.ts
# Expected: "Seed complete!"
```

**Step 3: Commit**
```bash
git add scripts/seed.ts
git commit -m "feat: add demo seed data script"
```

---

### Task 1.5: Create Disaster Engine [Member 2]

**Files:**
- Create: `safepool/lib/disaster-engine.ts`

**Step 1: Write the engine**
```typescript
// lib/disaster-engine.ts
import { Pool, Member, DisasterEvent, TriggerRules } from '@/types'

/** Haversine formula — returns distance in km between two lat/lon points */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Returns the members affected by a disaster event given pool trigger rules */
export function getAffectedMembers(
  pool: Pool,
  members: Member[],
  disaster: DisasterEvent
): Member[] {
  let rules: TriggerRules
  try {
    rules = JSON.parse(pool.trigger_rules)
  } catch {
    return []
  }

  // 1. Check disaster type
  if (!rules.disasterTypes.includes(disaster.disaster_type)) return []

  // 2. Check magnitude threshold
  if (disaster.magnitude < rules.minMagnitude) return []

  // 3. Geographic radius check
  return members.filter((m) => {
    const dist = haversineDistance(m.location_lat, m.location_lon, disaster.location_lat, disaster.location_lon)
    return dist <= rules.radius_km
  })
}

/** Checks if a pool should trigger a payout for a disaster event */
export function shouldTrigger(pool: Pool, members: Member[], disaster: DisasterEvent): Member[] | false {
  const affected = getAffectedMembers(pool, members, disaster)
  return affected.length > 0 ? affected : false
}
```

**Step 2: Commit**
```bash
git add lib/disaster-engine.ts
git commit -m "feat: add disaster trigger engine with haversine geo-check"
```

---

### Task 1.6: Create Payout Engine [Member 2]

**Files:**
- Create: `safepool/lib/payout-engine.ts`

**Step 1: Write the engine**
```typescript
// lib/payout-engine.ts
import { Pool, Member, DisasterEvent } from '@/types'

const severityMultiplier: Record<string, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.8,
  critical: 1.0,
}

interface PayoutResult {
  member_id: string
  wallet_address: string
  amount: number
}

/** Calculates payout amounts for each affected member based on the pool's distribution model */
export function calculatePayouts(
  pool: Pool,
  affectedMembers: Member[],
  totalFunds: number,
  disaster: DisasterEvent
): PayoutResult[] {
  if (affectedMembers.length === 0) return []

  switch (pool.distribution_model) {
    case 'equal_split': {
      const amount = totalFunds / affectedMembers.length
      return affectedMembers.map((m) => ({ member_id: m.id, wallet_address: m.wallet_address, amount }))
    }

    case 'severity_based': {
      const multiplier = severityMultiplier[disaster.severity] ?? 0.5
      const amount = (totalFunds * multiplier) / affectedMembers.length
      return affectedMembers.map((m) => ({ member_id: m.id, wallet_address: m.wallet_address, amount }))
    }

    case 'household_size': {
      const totalUnits = affectedMembers.reduce((s, m) => s + m.household_size, 0)
      return affectedMembers.map((m) => ({
        member_id: m.id,
        wallet_address: m.wallet_address,
        amount: (m.household_size / totalUnits) * totalFunds,
      }))
    }

    case 'capped': {
      const rawAmount = totalFunds / affectedMembers.length
      const amount = Math.min(rawAmount, pool.payout_cap)
      return affectedMembers.map((m) => ({ member_id: m.id, wallet_address: m.wallet_address, amount }))
    }

    default:
      return []
  }
}
```

**Step 2: Commit**
```bash
git add lib/payout-engine.ts
git commit -m "feat: add payout distribution engine (4 models)"
```

---

### Task 1.7: Create Open Payments client [Member 3]

**Files:**
- Create: `safepool/lib/open-payments.ts`

**Step 1: Get testnet wallet**
- Go to https://wallet.interledger-test.dev
- Sign up free → create a wallet → note the wallet address URL
- Go to Developer Keys → generate a key pair → copy key ID and private key
- Put both in `.env.local`

**Step 2: Write the client**
```typescript
// lib/open-payments.ts
import { createAuthenticatedClient, OpenPaymentsClientError } from '@interledger/open-payments'

let _client: Awaited<ReturnType<typeof createAuthenticatedClient>> | null = null

export async function getOpenPaymentsClient() {
  if (_client) return _client
  _client = await createAuthenticatedClient({
    walletAddressUrl: process.env.POOL_WALLET_ADDRESS!,
    privateKey: process.env.OPEN_PAYMENTS_PRIVATE_KEY!,
    keyId: process.env.OPEN_PAYMENTS_KEY_ID!,
  })
  return _client
}

/** Creates an incoming payment on the pool's wallet so a member can pay in */
export async function createIncomingPayment(amountValue: string, currency: string, description: string) {
  const client = await getOpenPaymentsClient()
  const walletAddress = await client.walletAddress.get({ url: process.env.POOL_WALLET_ADDRESS! })

  const grant = await client.grant.request(
    { url: walletAddress.authServer },
    {
      access_token: {
        access: [{ type: 'incoming-payment', actions: ['create', 'read', 'list', 'complete'] }],
      },
    }
  )

  if (!('access_token' in grant)) throw new Error('Grant requires interaction — use testnet wallet')

  const incomingPayment = await client.incomingPayment.create(
    { url: walletAddress.resourceServer, accessToken: grant.access_token.value },
    {
      walletAddress: process.env.POOL_WALLET_ADDRESS!,
      incomingAmount: { value: amountValue, assetCode: currency, assetScale: 2 },
      metadata: { description },
    }
  )

  return incomingPayment
}

/** Creates an outgoing payment from the pool wallet to a member's wallet */
export async function createOutgoingPayment(
  destinationWalletAddress: string,
  amountValue: string,
  currency: string
) {
  const client = await getOpenPaymentsClient()
  const poolWallet = await client.walletAddress.get({ url: process.env.POOL_WALLET_ADDRESS! })

  // Get quote
  const grant = await client.grant.request(
    { url: poolWallet.authServer },
    {
      access_token: {
        access: [
          { type: 'quote', actions: ['create', 'read'] },
          { type: 'outgoing-payment', actions: ['create', 'read', 'list'], identifier: process.env.POOL_WALLET_ADDRESS! },
        ],
      },
    }
  )

  if (!('access_token' in grant)) throw new Error('Grant requires interaction')

  const destWallet = await client.walletAddress.get({ url: destinationWalletAddress })
  const incomingPayment = await client.incomingPayment.create(
    { url: destWallet.resourceServer, accessToken: grant.access_token.value },
    {
      walletAddress: destinationWalletAddress,
      incomingAmount: { value: amountValue, assetCode: currency, assetScale: 2 },
    }
  )

  const quote = await client.quote.create(
    { url: poolWallet.resourceServer, accessToken: grant.access_token.value },
    { walletAddress: process.env.POOL_WALLET_ADDRESS!, receiver: incomingPayment.id, method: 'ilp' }
  )

  const outgoingPayment = await client.outgoingPayment.create(
    { url: poolWallet.resourceServer, accessToken: grant.access_token.value },
    { walletAddress: process.env.POOL_WALLET_ADDRESS!, quoteId: quote.id }
  )

  return outgoingPayment
}
```

**Step 3: Commit**
```bash
git add lib/open-payments.ts
git commit -m "feat: add Open Payments ILP client helpers"
```

---

### Task 1.8: Create Disaster API fetchers [Member 3]

**Files:**
- Create: `safepool/lib/disaster-apis.ts`

**Step 1: Write the fetchers**
```typescript
// lib/disaster-apis.ts
import { DisasterEvent } from '@/types'

/** USGS Earthquake API — no API key needed, completely free */
export async function fetchUSGSEarthquakes(minMagnitude = 5.0): Promise<Partial<DisasterEvent>[]> {
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=${minMagnitude}&limit=50&orderby=time`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) return []
  const data = await res.json()

  return (data.features ?? []).map((f: any) => ({
    source: 'usgs',
    external_id: f.id,
    disaster_type: 'earthquake' as const,
    magnitude: f.properties.mag ?? 0,
    severity: magnitudeToSeverity(f.properties.mag ?? 0),
    location_name: f.properties.place ?? 'Unknown',
    location_lat: f.geometry.coordinates[1],
    location_lon: f.geometry.coordinates[0],
    occurred_at: new Date(f.properties.time).toISOString().replace('T', ' ').substring(0, 19),
    raw_data: JSON.stringify(f.properties),
    processed: 0,
  }))
}

/** GDACS UN Disaster API — free RSS/XML feed, parses floods/cyclones/etc */
export async function fetchGDACSDisasters(): Promise<Partial<DisasterEvent>[]> {
  const url = 'https://www.gdacs.org/xml/rss.xml'
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) return []
  const text = await res.text()

  // Simple regex-based XML parse (no dependency needed)
  const items = text.match(/<item>([\s\S]*?)<\/item>/g) ?? []
  return items.slice(0, 20).map((item) => {
    const title = item.match(/<title[^>]*>(.*?)<\/title>/)?.[1] ?? ''
    const lat = parseFloat(item.match(/geo:lat>(.*?)<\/geo:lat>/)?.[1] ?? '0')
    const lon = parseFloat(item.match(/geo:long>(.*?)<\/geo:long>/)?.[1] ?? '0')
    const eventType = item.match(/gdacs:eventtype>(.*?)<\/gdacs:eventtype>/)?.[1]?.toLowerCase() ?? 'flood'
    const severity = item.match(/gdacs:alertlevel>(.*?)<\/gdacs:alertlevel>/)?.[1]?.toLowerCase() ?? 'medium'
    const eventId = item.match(/gdacs:eventid>(.*?)<\/gdacs:eventid>/)?.[1] ?? Date.now().toString()

    return {
      source: 'gdacs',
      external_id: `gdacs-${eventId}`,
      disaster_type: gdacsTypeMap(eventType),
      magnitude: 0,
      severity: gdacsSeverityMap(severity),
      location_name: title,
      location_lat: lat,
      location_lon: lon,
      occurred_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      raw_data: JSON.stringify({ title }),
      processed: 0,
    }
  })
}

function magnitudeToSeverity(mag: number): 'low' | 'medium' | 'high' | 'critical' {
  if (mag >= 7) return 'critical'
  if (mag >= 6) return 'high'
  if (mag >= 5) return 'medium'
  return 'low'
}

function gdacsTypeMap(t: string): DisasterEvent['disaster_type'] {
  const map: Record<string, DisasterEvent['disaster_type']> = {
    fl: 'flood', tc: 'typhoon', eq: 'earthquake', vo: 'volcanic', ts: 'tsunami',
  }
  return map[t] ?? 'flood'
}

function gdacsSeverityMap(s: string): 'low' | 'medium' | 'high' | 'critical' {
  const map: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
    green: 'low', orange: 'medium', red: 'high',
  }
  return map[s] ?? 'medium'
}
```

**Step 2: Commit**
```bash
git add lib/disaster-apis.ts
git commit -m "feat: add USGS + GDACS disaster API fetchers (free, no key)"
```

---

### Task 1.9: Create SMTP email client [Member 3]

**Files:**
- Create: `safepool/lib/email.ts`

**Step 1: Get Gmail App Password**
- Go to myaccount.google.com → Security → 2-Step Verification (must be on)
- Scroll down → App Passwords → Select app: Mail → Generate
- Copy the 16-character password into `SMTP_PASS` in `.env.local`

**Step 2: Write the email client**
```typescript
// lib/email.ts
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendContributionConfirmation({
  toEmail,
  toName,
  poolName,
  amount,
  currency,
  paymentId,
}: {
  toEmail: string
  toName: string
  poolName: string
  amount: number
  currency: string
  paymentId: string
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #fff; padding: 32px;">
      <div style="max-width: 520px; margin: 0 auto; background: #111; border: 1px solid #333; border-radius: 12px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px;">🌐</span>
          <h1 style="color: #22c55e; margin: 8px 0; font-size: 24px;">SafePool</h1>
        </div>
        <h2 style="color: #fff; margin-bottom: 8px;">Contribution Confirmed</h2>
        <p style="color: #aaa;">Hi ${toName},</p>
        <p style="color: #aaa;">Your contribution to <strong style="color: #fff">${poolName}</strong> has been successfully received.</p>
        <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #aaa;">Amount</span>
            <span style="color: #22c55e; font-size: 20px; font-weight: bold;">${currency} ${amount.toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #aaa;">Pool</span>
            <span style="color: #fff;">${poolName}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #aaa;">Payment ID</span>
            <span style="color: #666; font-size: 12px;">${paymentId}</span>
          </div>
        </div>
        <p style="color: #aaa; font-size: 14px;">Your funds are pooled and ready to automatically distribute to affected members when a verified disaster is detected. Thank you for making a difference.</p>
        <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #333;">
          <p style="color: #555; font-size: 12px;">SafePool • HACKOMANIA 2026</p>
        </div>
      </div>
    </body>
    </html>
  `

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: toEmail,
    subject: `✅ SafePool: ${currency} ${amount.toFixed(2)} contribution confirmed — ${poolName}`,
    html,
  })
}

export async function sendPayoutNotification({
  toEmail,
  toName,
  poolName,
  amount,
  currency,
  disasterName,
}: {
  toEmail: string
  toName: string
  poolName: string
  amount: number
  currency: string
  disasterName: string
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; background: #0a0a0a; color: #fff; padding: 32px;">
      <div style="max-width: 520px; margin: 0 auto; background: #111; border: 1px solid #ef4444; border-radius: 12px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 48px;">🚨</span>
          <h1 style="color: #ef4444; margin: 8px 0;">Emergency Payout Sent</h1>
        </div>
        <p style="color: #aaa;">Hi ${toName},</p>
        <p style="color: #aaa;">A disaster has been detected in your area. Your SafePool emergency payout has been automatically sent to your wallet.</p>
        <div style="background: #1a0000; border: 1px solid #ef4444; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <div style="margin-bottom: 8px;">
            <span style="color: #aaa;">Disaster</span><br>
            <span style="color: #fff; font-weight: bold;">${disasterName}</span>
          </div>
          <div style="margin-bottom: 8px;">
            <span style="color: #aaa;">Pool</span><br>
            <span style="color: #fff;">${poolName}</span>
          </div>
          <div>
            <span style="color: #aaa;">Amount Sent</span><br>
            <span style="color: #22c55e; font-size: 24px; font-weight: bold;">${currency} ${amount.toFixed(2)}</span>
          </div>
        </div>
        <p style="color: #aaa; font-size: 14px;">Funds have been sent via Interledger to your registered wallet. Please stay safe.</p>
      </div>
    </body>
    </html>
  `

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: toEmail,
    subject: `🚨 SafePool Emergency Payout: ${currency} ${amount.toFixed(2)} sent to you`,
    html,
  })
}
```

**Step 3: Commit**
```bash
git add lib/email.ts
git commit -m "feat: add Nodemailer SMTP email templates (contribution + payout)"
```

---

### Task 1.10: Set up NextAuth [Member 3]

**Files:**
- Create: `safepool/app/api/auth/[...nextauth]/route.ts`

**Step 1: Write NextAuth route (credentials provider for demo)**
```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { query } from '@/lib/clickhouse'
import type { User } from '@/types'

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Demo Login',
      credentials: {
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        const users = await query<User>(
          `SELECT * FROM users WHERE email = {email:String} LIMIT 1`,
          { email: credentials.email }
        )
        if (users.length > 0) return { id: users[0].id, email: users[0].email, name: users[0].name }
        // Auto-create for demo
        return { id: 'guest', email: credentials.email, name: credentials.email.split('@')[0] }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
})

export { handler as GET, handler as POST }
```

**Step 2: Commit**
```bash
git add app/api/auth
git commit -m "feat: add NextAuth credentials provider"
```

---

## Phase 2 — Backend API Routes [Member 2]

### Task 2.1: Pools API — GET list + POST create

**Files:**
- Create: `safepool/app/api/pools/route.ts`

```typescript
// app/api/pools/route.ts
import { NextResponse } from 'next/server'
import { query, insert } from '@/lib/clickhouse'
import { Pool } from '@/types'
import { randomUUID } from 'crypto'

export async function GET() {
  const pools = await query<Pool>('SELECT * FROM pools WHERE is_active = 1 ORDER BY created_at DESC')
  return NextResponse.json(pools)
}

export async function POST(req: Request) {
  const body = await req.json()
  const pool = {
    id: randomUUID(),
    name: body.name,
    description: body.description,
    created_by: body.created_by ?? randomUUID(),
    distribution_model: body.distribution_model ?? 'equal_split',
    contribution_frequency: body.contribution_frequency ?? 'monthly',
    contribution_amount: body.contribution_amount ?? 10,
    currency: body.currency ?? 'USD',
    trigger_rules: typeof body.trigger_rules === 'string' ? body.trigger_rules : JSON.stringify(body.trigger_rules ?? {}),
    governance_rules: typeof body.governance_rules === 'string' ? body.governance_rules : JSON.stringify(body.governance_rules ?? {}),
    payout_cap: body.payout_cap ?? 500,
    is_active: 1,
  }
  await insert('pools', [pool])
  return NextResponse.json(pool, { status: 201 })
}
```

**Verify:**
```bash
curl http://localhost:3000/api/pools
# Should return array with Manila Flood Relief pool
```

**Commit:**
```bash
git add app/api/pools/route.ts
git commit -m "feat: add pools GET+POST API"
```

---

### Task 2.2: Single pool GET + members list

**Files:**
- Create: `safepool/app/api/pools/[id]/route.ts`
- Create: `safepool/app/api/members/[poolId]/route.ts`

```typescript
// app/api/pools/[id]/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/clickhouse'
import { Pool } from '@/types'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const pools = await query<Pool>('SELECT * FROM pools WHERE id = {id:String} LIMIT 1', { id: params.id })
  if (!pools.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(pools[0])
}
```

```typescript
// app/api/members/[poolId]/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/clickhouse'
import { Member } from '@/types'

export async function GET(_: Request, { params }: { params: { poolId: string } }) {
  const members = await query<Member>(
    'SELECT * FROM members WHERE pool_id = {pool_id:String} AND is_active = 1',
    { pool_id: params.poolId }
  )
  return NextResponse.json(members)
}
```

**Commit:**
```bash
git add app/api/pools/[id]/route.ts app/api/members
git commit -m "feat: add single pool + members list API"
```

---

### Task 2.3: Join pool API

**Files:**
- Create: `safepool/app/api/members/join/route.ts`

```typescript
// app/api/members/join/route.ts
import { NextResponse } from 'next/server'
import { insert } from '@/lib/clickhouse'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  const body = await req.json()
  const member = {
    id: randomUUID(),
    pool_id: body.pool_id,
    user_id: body.user_id,
    wallet_address: body.wallet_address,
    location_lat: body.location_lat ?? 0,
    location_lon: body.location_lon ?? 0,
    household_size: body.household_size ?? 1,
    is_active: 1,
  }
  await insert('members', [member])
  return NextResponse.json(member, { status: 201 })
}
```

**Commit:**
```bash
git add app/api/members/join/route.ts
git commit -m "feat: add join pool API"
```

---

### Task 2.4: Disasters list API

**Files:**
- Create: `safepool/app/api/disasters/route.ts`

```typescript
// app/api/disasters/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/clickhouse'
import { DisasterEvent } from '@/types'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get('limit') ?? '50'
  const events = await query<DisasterEvent>(
    'SELECT * FROM disaster_events ORDER BY occurred_at DESC LIMIT {limit:UInt32}',
    { limit: Number(limit) }
  )
  return NextResponse.json(events)
}
```

**Commit:**
```bash
git add app/api/disasters/route.ts
git commit -m "feat: add disasters list API"
```

---

### Task 2.5: Analytics APIs (4 endpoints)

**Files:**
- Create: `safepool/app/api/analytics/fund-balance/route.ts`
- Create: `safepool/app/api/analytics/contribution-trend/route.ts`
- Create: `safepool/app/api/analytics/payout-stats/route.ts`
- Create: `safepool/app/api/analytics/disaster-map/route.ts`

```typescript
// app/api/analytics/fund-balance/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/clickhouse'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const poolId = searchParams.get('poolId')
  const sql = poolId
    ? 'SELECT pool_id, sum(total_in) AS balance, sum(contribution_count) AS count FROM pool_balances WHERE pool_id = {pool_id:String} GROUP BY pool_id'
    : 'SELECT pool_id, sum(total_in) AS balance, sum(contribution_count) AS count FROM pool_balances GROUP BY pool_id ORDER BY balance DESC'
  const rows = await query(sql, poolId ? { pool_id: poolId } : {})
  return NextResponse.json(rows)
}
```

```typescript
// app/api/analytics/contribution-trend/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/clickhouse'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const poolId = searchParams.get('poolId')
  const sql = `
    SELECT
      toDate(contributed_at) AS date,
      sum(amount) AS daily_total,
      count() AS tx_count
    FROM contributions
    WHERE status = 'completed'
      ${poolId ? 'AND pool_id = {pool_id:String}' : ''}
    GROUP BY date
    ORDER BY date DESC
    LIMIT 90
  `
  const rows = await query(sql, poolId ? { pool_id: poolId } : {})
  return NextResponse.json(rows)
}
```

```typescript
// app/api/analytics/payout-stats/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/clickhouse'

export async function GET() {
  const rows = await query(`
    SELECT
      p.pool_id,
      d.disaster_type,
      count() AS payout_count,
      sum(p.amount) AS total_paid,
      avg(dateDiff('second', d.occurred_at, p.payout_at)) AS avg_latency_seconds
    FROM payouts p
    JOIN disaster_events d ON p.disaster_event_id = d.id
    WHERE p.status = 'completed'
    GROUP BY p.pool_id, d.disaster_type
  `)
  return NextResponse.json(rows)
}
```

```typescript
// app/api/analytics/disaster-map/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/clickhouse'

export async function GET() {
  const rows = await query(
    'SELECT grid_lat, grid_lon, disaster_type, sum(event_count) AS count, max(max_magnitude) AS max_mag FROM disaster_heatmap GROUP BY grid_lat, grid_lon, disaster_type'
  )
  return NextResponse.json(rows)
}
```

**Commit:**
```bash
git add app/api/analytics/
git commit -m "feat: add 4 ClickHouse analytics API endpoints"
```

---

### Task 2.6: Governance APIs

**Files:**
- Create: `safepool/app/api/governance/proposals/[poolId]/route.ts`
- Create: `safepool/app/api/governance/propose/route.ts`
- Create: `safepool/app/api/governance/vote/route.ts`

```typescript
// app/api/governance/proposals/[poolId]/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/clickhouse'

export async function GET(_: Request, { params }: { params: { poolId: string } }) {
  const rows = await query(
    'SELECT p.*, count(v.id) AS vote_count FROM proposals p LEFT JOIN votes v ON v.proposal_id = p.id WHERE p.pool_id = {pool_id:String} GROUP BY p.id, p.pool_id, p.proposed_by, p.title, p.description, p.change_type, p.new_value, p.created_at, p.voting_ends_at, p.status ORDER BY p.created_at DESC',
    { pool_id: params.poolId }
  )
  return NextResponse.json(rows)
}
```

```typescript
// app/api/governance/propose/route.ts
import { NextResponse } from 'next/server'
import { insert } from '@/lib/clickhouse'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  const body = await req.json()
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const proposal = {
    id: randomUUID(),
    pool_id: body.pool_id,
    proposed_by: body.proposed_by,
    title: body.title,
    description: body.description,
    change_type: body.change_type,
    new_value: body.new_value,
    voting_ends_at: ends.toISOString().replace('T', ' ').substring(0, 19),
    status: 'open',
  }
  await insert('proposals', [proposal])
  return NextResponse.json(proposal, { status: 201 })
}
```

```typescript
// app/api/governance/vote/route.ts
import { NextResponse } from 'next/server'
import { insert } from '@/lib/clickhouse'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  const body = await req.json()
  const vote = {
    id: randomUUID(),
    proposal_id: body.proposal_id,
    member_id: body.member_id,
    pool_id: body.pool_id,
    vote: body.vote,
  }
  await insert('votes', [vote])
  return NextResponse.json(vote, { status: 201 })
}
```

**Commit:**
```bash
git add app/api/governance/
git commit -m "feat: add governance proposals + voting APIs"
```

---

### Task 2.7: SSE endpoint for real-time NASDAQ ticker

**Files:**
- Create: `safepool/app/api/sse/contributions/route.ts`

```typescript
// app/api/sse/contributions/route.ts
import { query } from '@/lib/clickhouse'
import { TickerEvent } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          const rows = await query<{
            member_name: string
            pool_name: string
            amount: number
            currency: string
            contributed_at: string
          }>(`
            SELECT u.name AS member_name, pl.name AS pool_name, c.amount, c.currency, c.contributed_at
            FROM contributions c
            JOIN members m ON c.member_id = m.id
            JOIN users u ON m.user_id = u.id
            JOIN pools pl ON c.pool_id = pl.id
            WHERE c.status = 'completed'
            ORDER BY c.contributed_at DESC
            LIMIT 20
          `)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(rows)}\n\n`))
        } catch {
          controller.enqueue(encoder.encode(`data: []\n\n`))
        }
      }

      await send()
      const interval = setInterval(send, 5000)

      // Clean up when client disconnects
      return () => clearInterval(interval)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
```

**Commit:**
```bash
git add app/api/sse/
git commit -m "feat: add SSE endpoint for real-time contribution ticker"
```

---

## Phase 3 — Integration APIs [Member 3]

### Task 3.1: Payment contribute API (ILP IncomingPayment)

**Files:**
- Create: `safepool/app/api/payments/contribute/route.ts`

```typescript
// app/api/payments/contribute/route.ts
import { NextResponse } from 'next/server'
import { createIncomingPayment } from '@/lib/open-payments'
import { insert } from '@/lib/clickhouse'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  const body = await req.json()
  const { pool_id, member_id, amount, currency = 'USD' } = body

  try {
    // Create ILP incoming payment on pool wallet
    const incoming = await createIncomingPayment(
      String(Math.round(amount * 100)), // value in cents
      currency,
      `Contribution to pool ${pool_id}`
    )

    // Insert pending contribution into ClickHouse
    const contribution = {
      id: randomUUID(),
      pool_id,
      member_id,
      amount,
      currency,
      incoming_payment_id: incoming.id,
      status: 'pending',
    }
    await insert('contributions', [contribution])

    return NextResponse.json({
      contribution_id: contribution.id,
      payment_url: incoming.id,
      amount,
      currency,
    })
  } catch (err: any) {
    // Demo fallback: create pending contribution without real ILP
    const contribution = {
      id: randomUUID(),
      pool_id,
      member_id,
      amount,
      currency,
      incoming_payment_id: `demo-${randomUUID()}`,
      status: 'pending',
    }
    await insert('contributions', [contribution])
    return NextResponse.json({ contribution_id: contribution.id, demo: true, amount, currency })
  }
}
```

**Commit:**
```bash
git add app/api/payments/contribute/route.ts
git commit -m "feat: add ILP contribution API with demo fallback"
```

---

### Task 3.2: Payment confirm API + SMTP email

**Files:**
- Create: `safepool/app/api/payments/confirm/route.ts`

```typescript
// app/api/payments/confirm/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/clickhouse'
import { sendContributionConfirmation } from '@/lib/email'
import { Contribution, Member, User, Pool } from '@/types'

export async function POST(req: Request) {
  const { contribution_id } = await req.json()

  // 1. Fetch contribution
  const contribs = await query<Contribution>(
    'SELECT * FROM contributions WHERE id = {id:String} LIMIT 1',
    { id: contribution_id }
  )
  if (!contribs.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const contribution = contribs[0]

  // 2. Mark as completed in ClickHouse
  // ClickHouse doesn't support UPDATE — insert new row, MergeTree will keep latest
  // For demo we re-insert with completed status
  await query(
    `ALTER TABLE contributions UPDATE status = 'completed' WHERE id = {id:String}`,
    { id: contribution_id }
  )

  // 3. Fetch member + user + pool for email
  const members = await query<Member>('SELECT * FROM members WHERE id = {id:String} LIMIT 1', { id: contribution.member_id })
  const member = members[0]
  if (!member) return NextResponse.json({ confirmed: true })

  const users = await query<User>('SELECT * FROM users WHERE id = {id:String} LIMIT 1', { id: member.user_id })
  const user = users[0]

  const pools = await query<Pool>('SELECT * FROM pools WHERE id = {id:String} LIMIT 1', { id: contribution.pool_id })
  const pool = pools[0]

  // 4. Send SMTP confirmation email
  if (user?.email && pool) {
    try {
      await sendContributionConfirmation({
        toEmail: user.email,
        toName: user.name,
        poolName: pool.name,
        amount: Number(contribution.amount),
        currency: contribution.currency,
        paymentId: contribution.incoming_payment_id,
      })
    } catch (e) {
      console.error('Email send failed:', e)
    }
  }

  return NextResponse.json({ confirmed: true, email_sent: !!user?.email })
}
```

**Commit:**
```bash
git add app/api/payments/confirm/route.ts
git commit -m "feat: add payment confirmation API with SMTP email"
```

---

### Task 3.3: Contribution history API

**Files:**
- Create: `safepool/app/api/payments/history/[poolId]/route.ts`

```typescript
// app/api/payments/history/[poolId]/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/clickhouse'

export async function GET(_: Request, { params }: { params: { poolId: string } }) {
  const rows = await query(
    `SELECT c.*, u.name AS member_name
     FROM contributions c
     JOIN members m ON c.member_id = m.id
     JOIN users u ON m.user_id = u.id
     WHERE c.pool_id = {pool_id:String}
     ORDER BY c.contributed_at DESC
     LIMIT 100`,
    { pool_id: params.poolId }
  )
  return NextResponse.json(rows)
}
```

**Commit:**
```bash
git add app/api/payments/history
git commit -m "feat: add contribution history API"
```

---

### Task 3.4: Cron — poll disasters

**Files:**
- Create: `safepool/app/api/cron/poll-disasters/route.ts`

```typescript
// app/api/cron/poll-disasters/route.ts
import { NextResponse } from 'next/server'
import { fetchUSGSEarthquakes, fetchGDACSDisasters } from '@/lib/disaster-apis'
import { query, insert } from '@/lib/clickhouse'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [earthquakes, gdacs] = await Promise.all([
    fetchUSGSEarthquakes(5.0),
    fetchGDACSDisasters(),
  ])

  const allEvents = [...earthquakes, ...gdacs]
  let inserted = 0

  for (const event of allEvents) {
    // Check if already exists by external_id
    const existing = await query(
      'SELECT id FROM disaster_events WHERE external_id = {eid:String} LIMIT 1',
      { eid: event.external_id ?? '' }
    )
    if (existing.length > 0) continue

    await insert('disaster_events', [{ ...event, id: randomUUID() }])
    inserted++
  }

  return NextResponse.json({ fetched: allEvents.length, inserted })
}
```

**Commit:**
```bash
git add app/api/cron/poll-disasters/route.ts
git commit -m "feat: add disaster polling cron (USGS + GDACS)"
```

---

### Task 3.5: Cron — process payouts

**Files:**
- Create: `safepool/app/api/cron/process-payouts/route.ts`

```typescript
// app/api/cron/process-payouts/route.ts
import { NextResponse } from 'next/server'
import { query, insert } from '@/lib/clickhouse'
import { shouldTrigger } from '@/lib/disaster-engine'
import { calculatePayouts } from '@/lib/payout-engine'
import { createOutgoingPayment } from '@/lib/open-payments'
import { sendPayoutNotification } from '@/lib/email'
import { Pool, Member, DisasterEvent, User } from '@/types'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get unprocessed disaster events
  const disasters = await query<DisasterEvent>(
    'SELECT * FROM disaster_events WHERE processed = 0 ORDER BY occurred_at DESC LIMIT 10'
  )
  const activePools = await query<Pool>('SELECT * FROM pools WHERE is_active = 1')

  let payoutsCreated = 0

  for (const disaster of disasters) {
    for (const pool of activePools) {
      const members = await query<Member>(
        'SELECT * FROM members WHERE pool_id = {pool_id:String} AND is_active = 1',
        { pool_id: pool.id }
      )

      const affected = shouldTrigger(pool, members, disaster)
      if (!affected) continue

      // Get pool fund balance from materialized view
      const balances = await query<{ balance: number }>(
        'SELECT sum(total_in) AS balance FROM pool_balances WHERE pool_id = {pool_id:String}',
        { pool_id: pool.id }
      )
      const totalFunds = Number(balances[0]?.balance ?? 0)
      if (totalFunds <= 0) continue

      const payoutAmounts = calculatePayouts(pool, affected, totalFunds, disaster)

      for (const p of payoutAmounts) {
        const payoutId = randomUUID()

        // Record payout
        await insert('payouts', [{
          id: payoutId,
          pool_id: pool.id,
          disaster_event_id: disaster.id,
          member_id: p.member_id,
          amount: p.amount,
          currency: pool.currency,
          outgoing_payment_id: '',
          distribution_rule: pool.distribution_model,
          status: 'processing',
          failure_reason: '',
        }])

        try {
          // Send ILP outgoing payment
          const payment = await createOutgoingPayment(
            p.wallet_address,
            String(Math.round(p.amount * 100)),
            pool.currency
          )

          // Update payout to completed
          await query(
            `ALTER TABLE payouts UPDATE status = 'completed', outgoing_payment_id = {pid:String} WHERE id = {id:String}`,
            { pid: payment.id, id: payoutId }
          )

          // Send email notification
          const memberUsers = await query<User>(
            'SELECT u.* FROM users u JOIN members m ON m.user_id = u.id WHERE m.id = {member_id:String} LIMIT 1',
            { member_id: p.member_id }
          )
          if (memberUsers[0]?.email) {
            await sendPayoutNotification({
              toEmail: memberUsers[0].email,
              toName: memberUsers[0].name,
              poolName: pool.name,
              amount: p.amount,
              currency: pool.currency,
              disasterName: `${disaster.disaster_type} (M${disaster.magnitude}) near ${disaster.location_name}`,
            }).catch(console.error)
          }

          payoutsCreated++
        } catch (err: any) {
          await query(
            `ALTER TABLE payouts UPDATE status = 'failed', failure_reason = {reason:String} WHERE id = {id:String}`,
            { reason: err.message ?? 'Unknown error', id: payoutId }
          )
        }
      }

      // Mark disaster as processed
      await query(
        'ALTER TABLE disaster_events UPDATE processed = 1 WHERE id = {id:String}',
        { id: disaster.id }
      )
    }
  }

  return NextResponse.json({ disasters_processed: disasters.length, payouts_created: payoutsCreated })
}
```

**Commit:**
```bash
git add app/api/cron/process-payouts/route.ts
git commit -m "feat: add automated payout cron (disaster → ILP → email)"
```

---

### Task 3.6: Manual disaster trigger (demo)

**Files:**
- Create: `safepool/app/api/disasters/manual-trigger/route.ts`

```typescript
// app/api/disasters/manual-trigger/route.ts
import { NextResponse } from 'next/server'
import { insert } from '@/lib/clickhouse'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  const body = await req.json()
  const disaster = {
    id: randomUUID(),
    source: 'manual',
    external_id: `manual-${Date.now()}`,
    disaster_type: body.disaster_type ?? 'earthquake',
    magnitude: body.magnitude ?? 6.5,
    severity: body.severity ?? 'high',
    location_name: body.location_name ?? 'Metro Manila, Philippines',
    location_lat: body.location_lat ?? 14.5995,
    location_lon: body.location_lon ?? 120.9842,
    occurred_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
    raw_data: JSON.stringify(body),
    processed: 0,
  }
  await insert('disaster_events', [disaster])
  return NextResponse.json(disaster, { status: 201 })
}
```

**Commit:**
```bash
git add app/api/disasters/manual-trigger/route.ts
git commit -m "feat: add manual disaster trigger for demo"
```

---

## Phase 4 — Vercel Config + Deploy [Member 3]

### Task 4.1: Vercel cron config

**Files:**
- Create: `safepool/vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/poll-disasters",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/process-payouts",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

> **Note:** Vercel cron jobs on free Hobby plan call routes without the Authorization header. For demo purposes, set `CRON_SECRET=` (empty) so the auth check passes. For production, use a Vercel Pro plan with cron authentication.

**Commit:**
```bash
git add vercel.json
git commit -m "chore: add Vercel cron job config"
```

---

### Task 4.2: Deploy to Vercel

**Step 1: Install Vercel CLI**
```bash
npm install -g vercel
```

**Step 2: Link and deploy**
```bash
vercel --prod
# Follow prompts: link to existing project or create new
# Add all env vars from .env.local when prompted
```

**Step 3: Verify**
```bash
curl https://your-safepool.vercel.app/api/pools
# Should return pool data from ClickHouse Cloud
```

**Step 4: Final commit**
```bash
git add .
git commit -m "chore: final backend — all APIs + integrations complete"
git push
```

---

## Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pools` | GET | List all pools |
| `/api/pools` | POST | Create pool |
| `/api/pools/[id]` | GET | Single pool |
| `/api/members/join` | POST | Join pool |
| `/api/members/[poolId]` | GET | Pool members |
| `/api/payments/contribute` | POST | ILP IncomingPayment |
| `/api/payments/confirm` | POST | Confirm + email |
| `/api/disasters` | GET | List events |
| `/api/disasters/manual-trigger` | POST | Demo trigger |
| `/api/governance/proposals/[poolId]` | GET | List proposals |
| `/api/governance/propose` | POST | Create proposal |
| `/api/governance/vote` | POST | Cast vote |
| `/api/analytics/fund-balance` | GET | Pool balances |
| `/api/analytics/contribution-trend` | GET | Time-series |
| `/api/analytics/payout-stats` | GET | Payout analytics |
| `/api/analytics/disaster-map` | GET | Heatmap data |
| `/api/sse/contributions` | GET | SSE ticker stream |
| `/api/cron/poll-disasters` | GET | Cron: fetch disasters |
| `/api/cron/process-payouts` | GET | Cron: send payouts |
