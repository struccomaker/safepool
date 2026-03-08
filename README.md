# SafePool

**Community-powered emergency fund platform** | HACKOMANIA 2026

SafePool is a single global emergency fund where users contribute before disasters happen and payouts can be triggered when disaster conditions are met. The app combines Supabase-backed transactional flows with ClickHouse-powered analytics, while Open Payments handles contribution and payout rails. The main user experience is an interactive 3D globe dashboard with live disaster and contribution activity.

---

## Core Features

1. **Single global fund model**
2. **Open Payments contribution and payout flows**
3. **Automated disaster polling and payout processing**
4. **Governance proposals and voting**
5. **Realtime dashboard (SSE + globe + analytics)**

---

## Platform Overview

- **Frontend**
  - Next.js 16 App Router + React 18 + TypeScript
  - Tailwind CSS + reusable dashboard components
  - 3D globe (`react-globe.gl`) + drilldown maps (MapLibre/Leaflet)

- **Backend**
  - API routes in `app/api/*` for payments, governance, disasters, analytics, and profile/wallet
  - Cron endpoints for disaster polling, payout processing, and recurring processing
  - Supabase OAuth callback and popup completion flow

- **Data model**
  - Supabase Postgres: users, wallets, memberships, payment sessions, contributions, governance
  - ClickHouse: disaster analytics and event mirror tables

- **Payments**
  - Interledger Open Payments for incoming and outgoing payments
  - Recurring contribution grant/session support
  - Encrypted persisted grant continuation/access state

---

## Quick Route Map

- **App routes**
  - `/` (main dashboard)
  - `/profile` (authenticated account page)
  - `/auth/callback` and `/auth/popup-complete` (OAuth flow)

- **High-traffic API groups**
  - `/api/global/*` (pool, members, history, governance proposals, sidebar donations)
  - `/api/payments/*` and `/api/recurring/create`
  - `/api/governance/*`
  - `/api/disasters*`, `/api/analytics/*`, `/api/sse/contributions`
  - `/api/cron/*` (bearer-protected automation endpoints)

---

## Installation

### 1) Clone and install

```bash
git clone <repo-url>
cd safepool
npm install
```

### 2) Create `.env.local`

```env
# ClickHouse
CLICKHOUSE_HOST=https://your-instance.clickhouse.cloud
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your-password
CLICKHOUSE_DATABASE=safepool

# Open Payments (Interledger testnet)
OPEN_PAYMENTS_KEY_ID=your-key-id
OPEN_PAYMENTS_PRIVATE_KEY=your-private-key
POOL_WALLET_ADDRESS=https://ilp.interledger-test.dev/safepool

# Disaster APIs
OPENWEATHERMAP_API_KEY=your-api-key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM="SafePool <your-email@gmail.com>"

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=your-cron-secret
```

### 3) Initialize databases

- Supabase schema: run `scripts/init-supabase.sql`
- ClickHouse schema: run `scripts/init-db.sql`
- Optional migrations:
  - `scripts/migrations/002_create_user_wallets.sql`
  - `scripts/migrations/003_payments_phase2_phase3.sql`
  - `scripts/supabase-anon-donor-migration.sql`
  - `scripts/supabase-country-migration.sql`

### 4) Seed demo data (optional)

```bash
npm run seed
```

### 5) Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build production app
- `npm run start` - Start production server
- `npm run lint` - Run linting
- `npm run seed` - Seed demo data

---

## License

MIT
