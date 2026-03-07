# SafePool

**Community-Powered Emergency Funds** | HACKOMANIA 2026

SafePool is a community-powered emergency fund platform. Communities pool money in advance for disasters — when a disaster hits, we automatically trigger payouts via Interledger (Open Payments) and track everything in real-time with ClickHouse.

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | ClickHouse Cloud |
| Payments | Open Payments (Interledger Testnet) |
| Auth | Supabase Auth |
| Email | Nodemailer + Gmail SMTP |
| 3D Globe | react-globe.gl (Three.js) |
| Charts | Recharts + TanStack Query |
| Maps | MapLibre GL / Leaflet |
| Real-time | Server-Sent Events (SSE) |

---

## Features

- **3D Globe Landing Page** — Interactive globe showing active disaster zones and pool locations
- **Pool Creation** — Create community funds with custom triggers (earthquake, flood) and payout models
- **Real-time Contributions** — LED ticker showing live donations via SSE
- **Disaster Detection** — Automatic polling from USGS, GDACS, and OpenWeatherMap APIs
- **Auto-Payouts** — Instant ILP payments triggered when disasters match pool criteria
- **Governance** — Proposal creation and voting for pool decisions
- **Analytics Dashboard** — ClickHouse materialized views for real-time fund analytics
- **Member Management** — Join pools, view contributions, track payout history

---

## Quick Setup

### 1. Clone & Install

```bash
git clone <repo-url>
cd safepool
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the project root:

```env
# ClickHouse Cloud
CLICKHOUSE_HOST=https://your-instance.clickhouse.cloud
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your-password
CLICKHOUSE_DATABASE=safepool

# Open Payments Testnet
OPEN_PAYMENTS_KEY_ID=your-key-id
OPEN_PAYMENTS_PRIVATE_KEY=your-private-key
POOL_WALLET_ADDRESS=https://wallet.interledger-test.dev/safepool

# Disaster APIs
OPENWEATHERMAP_API_KEY=your-api-key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email (Gmail App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM="SafePool <your-email@gmail.com>"

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Initialize Database

Run the SQL schema in ClickHouse Cloud SQL console:
```bash
# Execute scripts/init-db.sql
```

### 4. Seed Demo Data (Optional)

```bash
npm run seed
```

### 5. Start Development Server

```bash
npm run dev
```

Visit **http://localhost:3000**

---

## Project Structure

```
safepool/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── pools/             # Pool creation & management
│   ├── disasters/         # Live disaster feed
│   ├── analytics/          # ClickHouse analytics
│   └── dashboard/         # User dashboard
├── lib/
│   ├── clickhouse.ts      # ClickHouse client
│   ├── open-payments.ts   # Interledger payment helpers
│   ├── disaster-engine.ts # Haversine & trigger evaluation
│   ├── payout-engine.ts   # Distribution model calculators
│   └── disaster-apis.ts   # USGS, GDACS, OWM fetchers
├── components/            # React components
├── scripts/               # Database init & seed
└── types/                 # TypeScript definitions
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run seed` | Seed demo data |

---

## Demo Flow

1. Landing page — 3D globe spins, LED marquee ticker shows live donations
2. Create pool — set triggers (earthquake/flood) and payout model
3. Join with demo wallets
4. Make contributions via ILP
5. Simulate disaster or wait for auto-detection
6. Watch PayoutTracker — ILP payments sent in ~2s
7. View Analytics — real-time ClickHouse materialized views

---

## License

MIT
