# SafePool — Shared Claude Context
## HACKOMANIA 2026 | For all 3 team members

> This file gives Claude full context about the project. Keep it open in every session.

---

## What We're Building

**SafePool** is a community-powered emergency fund platform. Think of a neighbourhood savings circle (ROSCA) that automatically pays out the moment a natural disaster hits. People pool small contributions → disaster is detected from USGS/GDACS APIs → Interledger (Open Payments) sends payouts instantly to affected members → Supabase stores transactional state while ClickHouse powers disasters + analytics.

**Architecture status (authoritative):** SafePool is now **single global pool only**. Multi-pool routes/flows are out of scope and should not be reintroduced.

**Hackathon challenges we're targeting:**
1. **Interledger / Open Payments** — automated ILP payouts on disaster trigger
2. **ClickHouse** — materialized views for real-time fund analytics

---

## Team Roles

| Member | Role | Primary Files |
|--------|------|---------------|
| **Member 1** | Frontend Lead | `app/page.tsx`, `app/pool/`, `app/contribute/`, `components/` |
| **Member 2** | Backend Lead | `app/api/global/`, `app/api/analytics/`, `app/api/governance/`, `lib/clickhouse.ts`, `lib/disaster-engine.ts`, `lib/payout-engine.ts` |
| **Member 3** | Integrations Lead | `lib/open-payments.ts`, `lib/disaster-apis.ts`, `lib/email.ts`, `app/api/payments/`, `app/api/cron/`, `app/api/wallet/` |

---

## Tech Stack (All Free for Students)

| Layer | Tool | Free Tier |
|-------|------|-----------|
| Framework | Next.js 16 (App Router) | Free |
| Styling | Tailwind CSS + shadcn/ui | Free |
| Database | Supabase Postgres + ClickHouse Cloud | Free |
| Payments | Open Payments Testnet | Free (`wallet.interledger-test.dev`) |
| Auth | Supabase Auth (Google OAuth) | Free |
| Email | Nodemailer + Gmail SMTP | Free (Gmail App Password) |
| 3D Globe | react-globe.gl (Three.js) | Free npm package |
| Charts | Recharts + TanStack Query | Free |
| Maps | react-leaflet + Leaflet.js | Free |
| Real-time | Server-Sent Events (SSE) | Free, built into Next.js |
| Deploy | Vercel Hobby | Free |
| Repo | GitHub | Free |

---

## Project Structure

```
safepool/
├── app/
│   ├── layout.tsx                    # Root layout + ticker + nav
│   ├── page.tsx                      # Root map entry page
│   ├── pool/page.tsx                 # Single global pool page
│   ├── contribute/page.tsx           # Contribution page
│   ├── governance/page.tsx           # Governance page
│   ├── members/page.tsx              # Global members page
│   ├── profile/page.tsx              # Wallet + contribution history
│   └── api/
│       ├── global/
│       │   ├── pool/route.ts
│       │   ├── members/route.ts
│       │   ├── governance/proposals/route.ts
│       │   ├── payments/history/route.ts
│       │   └── disasters/check/route.ts
│       ├── members/join/route.ts
│       ├── wallet/me/route.ts
│       ├── payments/
│       │   ├── contribute/route.ts
│       │   ├── confirm/route.ts
│       │   ├── callback/route.ts
│       │   └── status/route.ts
│       ├── recurring/create/route.ts
│       ├── disasters/route.ts
│       ├── disasters/manual-trigger/route.ts
│       ├── governance/propose/route.ts
│       ├── governance/vote/route.ts
│       ├── analytics/
│       │   ├── fund-balance/route.ts
│       │   ├── contribution-trend/route.ts
│       │   ├── payout-stats/route.ts
│       │   └── disaster-map/route.ts
│       ├── sse/contributions/route.ts
│       └── cron/
│           ├── poll-disasters/route.ts
│           ├── process-payouts/route.ts
│           └── process-recurring/route.ts
├── lib/
│   ├── clickhouse.ts       # ClickHouse client singleton (disasters + analytics)
│   ├── supabase/admin.ts   # Supabase service-role server client
│   ├── supabase/server.ts  # Supabase auth server client
│   ├── open-payments.ts    # ILP authenticated client + helpers
│   ├── disaster-engine.ts  # Haversine + trigger rule evaluation
│   ├── payout-engine.ts    # 4 distribution model calculators
│   ├── disaster-apis.ts    # USGS + GDACS + OWM API fetchers
│   └── email.ts            # Nodemailer SMTP client + templates
├── components/
│   ├── LedTicker.tsx           # Physical LED marquee donor feed (SSE, amber glow)
│   ├── GlobeScene.tsx          # react-globe.gl 3D Earth — dark, cyan atmosphere, pulsing rings
│   ├── FundMeter.tsx           # Animated pool balance gauge
│   ├── DisasterMap.tsx         # Leaflet map with disaster pins + radii
│   ├── ContributionTimeline.tsx # Recharts area chart (ClickHouse data)
│   ├── PayoutTracker.tsx       # Real-time payout status list
│   ├── GovernanceVote.tsx      # Proposal cards with vote counts
│   └── DisasterTriggerAlert.tsx # Red alert banner on auto-trigger
├── types/index.ts              # All shared TypeScript types
├── scripts/
│   ├── init-db.sql             # ClickHouse disaster + analytics schema
│   ├── init-supabase.sql       # Supabase transactional schema
│   ├── trim-clickhouse-transactional.sql  # Drops deprecated ClickHouse transactional tables
│   └── seed.ts                 # Insert demo data into ClickHouse
├── .env.local                  # Never commit this
├── .env.example                # Commit this (no secrets)
└── CLAUDE.md                   # This file
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```env
# ClickHouse Cloud (free tier: clickhouse.cloud → New Service)
CLICKHOUSE_HOST=https://xxxxxxxx.clickhouse.cloud
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=safepool

# Open Payments Testnet (free: ilp.interledger-test.dev)
OPEN_PAYMENTS_KEY_ID=
OPEN_PAYMENTS_PRIVATE_KEY=
POOL_WALLET_ADDRESS=https://ilp.interledger-test.dev/safepool
DEMO_MODE=

# NOTE: `ilp.interledger-test.dev/<walletName>` is the canonical Open Payments wallet-address host.
# `wallet.interledger-test.dev` is the UI portal and should not be used as POOL_WALLET_ADDRESS.

# Disaster APIs
OPENWEATHERMAP_API_KEY=        # Free tier at openweathermap.org

# App URL / encryption
NEXT_PUBLIC_SITE_URL=http://localhost:3000
APP_ENCRYPTION_KEY=

# SMTP Email (Gmail — enable 2FA → App Passwords → generate one)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourteam@gmail.com
SMTP_PASS=                     # 16-char app password (not your real password)
SMTP_FROM="SafePool <yourteam@gmail.com>"

# Cron security (any random string)
CRON_SECRET=

#supabase key 
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Key Patterns

### ClickHouse Client (`lib/clickhouse.ts`)
```typescript
import { createClient } from '@clickhouse/client'

const client = createClient({
  host: process.env.CLICKHOUSE_HOST!,
  username: process.env.CLICKHOUSE_USER!,
  password: process.env.CLICKHOUSE_PASSWORD!,
  database: process.env.CLICKHOUSE_DATABASE!,
})

export default client
```

### API Route Pattern (Transactional on Supabase)
```typescript
// app/api/global/pool/route.ts
import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('members')
    .select('id,pool_id,user_id,wallet_address')
    .eq('is_active', true)
    .limit(100)
  return NextResponse.json(data)
}
```

### SSE Pattern (for NASDAQ ticker)
```typescript
// app/api/sse/contributions/route.ts
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(async () => {
        const data = await getLatestContributions()
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
      }, 3000)
      return () => clearInterval(interval)
    }
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
```

---

## Database Quick Reference

**Supabase transactional tables:** `users`, `user_wallets`, `members`, `pending_contributions`, `contributions`, `payment_grant_sessions`, `payment_status_cache`, `recurring_contributions`, `proposals`, `votes`, `payouts`

**ClickHouse disaster/analytics tables + MVs:** `disaster_events`, `disaster_event_processing`, `pool_balances`, `payout_latency`, `contribution_streaks`, `disaster_heatmap`

Run `scripts/init-supabase.sql` in Supabase SQL editor to create transactional schema.
Run `scripts/init-db.sql` in ClickHouse Cloud SQL console to create disasters + analytics schema.
Run `scripts/trim-clickhouse-transactional.sql` after cutover to drop deprecated ClickHouse transactional tables.
Run `npx ts-node scripts/seed.ts` to load demo data.

---

## Development Commands

```bash
npm run dev          # Start dev server at localhost:3000
npm run build        # Production build
npx ts-node scripts/seed.ts   # Seed demo data
```

---

## Bug Guardrails (Do Not Regress)

- Open Payments key parsing: `OPEN_PAYMENTS_PRIVATE_KEY` may be PEM text, escaped-PEM, base64 DER/PEM, or file path. Do not assume PEM-only input.
- Do not hard-code Open Payments amount currency/scale (`USD`, `2`). Always use wallet-native `assetCode` and `assetScale` from wallet address metadata.
- `DEMO_MODE=true` simulates payments (no real wallet popup or on-chain/testnet movement). UI should clearly indicate simulated success.
- In Next/Turbopack runtime, `@interledger/open-payments` OpenAPI spec files may fail to resolve from bundled paths; keep `validateResponses: false` in authenticated client init for stability.

---

## Demo Flow (for judges)

1. Open landing page — 3D globe spins, LED marquee ticker shows live donations
2. Open the global pool page and review trigger + governance settings
3. Join with 5 demo wallets (Philippine coordinates)
4. Make 3 contributions — ILP redirects, SMTP confirmation emails received
5. Click **Simulate Disaster** — M6.5 earthquake, Metro Manila
6. Watch PayoutTracker — ILP payments sent in ~2s
7. Open Analytics — ClickHouse materialized views show live charts

---

## Useful Links

- ClickHouse Cloud: https://clickhouse.cloud (sign up free)
- Open Payments Testnet UI portal: https://wallet.interledger-test.dev
- Open Payments wallet-address host: https://ilp.interledger-test.dev
- USGS Earthquake API: https://earthquake.usgs.gov/fdsnws/event/1/ (no key needed)
- GDACS API: https://www.gdacs.org/xml/rss.xml (no key needed)
- OpenWeatherMap: https://openweathermap.org/api (free tier, 60 calls/min)
- react-globe.gl docs: https://vasturiano.github.io/react-globe.gl/
- shadcn/ui: https://ui.shadcn.com

---

## Coding Practices

> Sourced from Next.js docs, ClickHouse docs, Auth.js docs, Interledger docs, and community best practices (2025–2026). Apply these in every file you touch.

---

### Next.js 14 App Router

**1. Default to Server Components — only add `'use client'` when you need interactivity**
Server Components run on the server, never ship JS to the browser, and can safely read env vars and call ClickHouse directly. Only add `'use client'` when the component needs `useState`, `useEffect`, event handlers, or browser APIs (e.g. `GlobeScene`, `LedTicker`, forms).
```typescript
// ✅ Good — Server Component, no 'use client' needed
export default async function PoolsPage() {
  const pools = await query('SELECT * FROM pools')   // direct DB call, safe
  return <div>{pools.map(...)}</div>
}

// ✅ Good — Client Component, because it has state
'use client'
export default function ContributeForm() { ... }
```

**2. Parallel data fetching — never await sequentially when fetches are independent**
```typescript
// ❌ Bad — waterfall: 3 requests, each waits for previous
const pool = await fetchPool(id)
const members = await fetchMembers(id)
const trend = await fetchTrend(id)

// ✅ Good — all 3 fire at once
const [pool, members, trend] = await Promise.all([
  fetchPool(id), fetchMembers(id), fetchTrend(id)
])
```

**3. All API route handlers must have try/catch and return proper status codes**
```typescript
export async function POST(req: Request) {
  try {
    const body = await req.json()
    // ...
    return NextResponse.json(result, { status: 201 })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
```

**4. Always add `export const dynamic = 'force-dynamic'` to SSE and cron routes**
Without this, Next.js may cache the response and the stream never updates.

**5. Use `cache: 'no-store'` on all server-side `fetch()` calls to live data**
```typescript
const res = await fetch(`${process.env.NEXTAUTH_URL}/api/pools`, { cache: 'no-store' })
```

**6. Create `app/error.tsx` and `app/loading.tsx` at page level for UX polish**
These are auto-used by Next.js as error boundaries and Suspense fallbacks.

---

### ClickHouse

**7. Always use parameterised queries — never string-interpolate user input**
```typescript
// ❌ NEVER do this — SQL injection risk
query(`SELECT * FROM pools WHERE id = '${id}'`)

// ✅ Always use {param:Type} placeholders
query('SELECT * FROM pools WHERE id = {id:String}', { id })
```

**8. Batch inserts — at least group multiple rows into one `insert()` call**
ClickHouse is optimised for bulk inserts. Inserting 1 row at a time is slow.
```typescript
// ❌ Bad — 100 individual inserts
for (const row of rows) await insert('contributions', [row])

// ✅ Good — one batched insert
await insert('contributions', rows)
```

**9. Use `LowCardinality(String)` for repeated low-variety strings**
Fields like `currency`, `source`, `status` should use `LowCardinality` — it compresses better and queries faster. Already applied in our schema.

**10. Never use `SELECT *` in production queries — name every column**
ClickHouse is columnar. `SELECT *` reads every column from disk even if you only display 2 fields.

**11. Materialized views update automatically on INSERT — don't manually backfill**
Our `pool_balances`, `contribution_streaks`, `disaster_heatmap` views update the moment a new row is inserted into the source table. Never re-insert old rows to trigger them.

**12. Use streaming for large result sets with the Node.js client**
```typescript
const stream = await client.query({ query: '...', format: 'JSONEachRow' })
for await (const row of stream.stream()) { /* process row */ }
```

---

### Supabase Auth

**13. Use Supabase auth sessions and keep API route guards server-side**
Resolve auth with Supabase in each protected route and reject unauthorized access immediately.

**14. Protect API routes by checking the Supabase user**
```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // ...
}
```

**15. Keep Supabase user metadata minimal and canonicalize wallet data in backend tables**
Store only essential metadata in auth profile, while authoritative wallet bindings stay in backend tables.

**16. Use middleware for route-group protection where appropriate**
```typescript
// middleware.ts
export const config = { matcher: ['/profile/:path*', '/contribute/:path*'] }
```

---

### Interledger / Open Payments

**17. Testnet wallets (`wallet.interledger-test.dev`) cannot pay production wallets**
Keep all `.env.local` values pointing to testnet during development. The demo uses `https://wallet.interledger-test.dev/safepool` — never mix testnet and production addresses.

**18. Always wrap Open Payments SDK calls in try/catch — grant flows can fail**
The grant `interact` step can require user interaction (redirect). Our code falls back to a demo mode when the grant requires interaction — this is intentional.

**19. Validate wallet address URLs before calling the SDK**
```typescript
function isValidWalletAddress(url: string): boolean {
  try { new URL(url); return url.startsWith('https://'); }
  catch { return false; }
}
```

**20. Currency amounts in Open Payments are integers (cents/minor units)**
`value: "1000"` means $10.00 USD (scale 2). Always multiply by 100 before passing to the SDK, and divide by 100 when displaying.
```typescript
const valueInCents = String(Math.round(amountInDollars * 100))
```

---

### Tailwind CSS + shadcn/ui

**21. Extract repeated class strings (>8 classes) into a component or `const` variable**
```typescript
// ❌ Messy — hard to read and maintain
<div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-green-500/40 cursor-pointer transition-all hover:bg-white/8">

// ✅ Clean
const cardClass = "bg-white/5 border border-white/10 rounded-xl p-5 hover:border-green-500/40 cursor-pointer transition-all hover:bg-white/8"
<div className={cardClass}>
```

**22. Use CSS variables for theme colours — already set up in `globals.css`**
Don't hard-code `#22c55e` in inline styles. Use `text-green-400` or `var(--green)`. This makes a last-minute theme change a 1-line edit.

**23. shadcn/ui components are copied into your repo — you own them**
If a shadcn component doesn't fit, edit it directly in `components/ui/`. Don't fight the library.

**24. Install the Tailwind Prettier plugin for consistent class ordering**
```bash
npm install -D prettier-plugin-tailwindcss
```
Add to `.prettierrc`: `{ "plugins": ["prettier-plugin-tailwindcss"] }`

---

### TypeScript

**25. Enable strict mode — it's already set in the Next.js default `tsconfig.json`**
Never turn off `strict: true`. It catches null pointer bugs before runtime.

**26. Never use `any` — use `unknown` for truly unknown data, then narrow it**
```typescript
// ❌ Bad
const data: any = await res.json()

// ✅ Good
const data = await res.json() as Pool[]
// or if you don't know the shape:
const data: unknown = await res.json()
if (Array.isArray(data)) { /* narrow */ }
```

**27. All shared types live in `types/index.ts` — import from there, never redefine**
If you find yourself writing `interface Pool { ... }` in a component file, stop — it already exists in `types/index.ts`.

**28. Type all component props explicitly with interfaces**
```typescript
// ✅
interface FundMeterProps {
  current: number
  target: number
  currency: string
}
export default function FundMeter({ current, target, currency }: FundMeterProps) { ... }
```

---

### General / Team

**29. Commit small and often — one feature/fix per commit**
Use the pattern: `feat: add X`, `fix: Y`, `chore: Z`. Don't commit 400 lines of unrelated changes together.

**30. Never commit `.env.local` — only commit `.env.example` with blank values**
Check with `git status` before every commit.

**31. If the backend isn't ready yet, use mock data in the frontend**
All frontend pages have mock data fallbacks so Member 1 can build UI without waiting for Members 2 & 3.

**32. Run `npm run build` before the demo — catch TypeScript errors early**
`npm run dev` hides many TS errors. `npm run build` runs the full type checker and will show real problems.
