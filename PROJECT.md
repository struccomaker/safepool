# SafePool Project Snapshot

Current state of the SafePool codebase (HACKOMANIA 2026), including stack, coding practices, shipped features, and overlapping/conflicting implementations.

---

## Current Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.1.6 (App Router), React 18, TypeScript |
| Styling/UI | Tailwind CSS, shadcn/ui components |
| Database/Analytics | ClickHouse Cloud via `@clickhouse/client` |
| Payments | Interledger Open Payments via `@interledger/open-payments` |
| Auth | Supabase Auth (`@supabase/ssr`, `@supabase/supabase-js`) with Google OAuth |
| Maps/Geo | MapLibre GL + Leaflet + Turf |
| Visualization | react-globe.gl + Three.js, Recharts |
| Realtime | Server-Sent Events (SSE) |
| Email | Nodemailer SMTP |

---

## Current Coding Practices

- **Server-first with client islands:** Interactive/UI-heavy components are client components; data/query routes stay server-side.
- **Consistent API error handling:** Most route handlers wrap logic in `try/catch` and return JSON status codes.
- **Dynamic routes for live endpoints:** `export const dynamic = 'force-dynamic'` is used in SSE and cron routes.
- **No-cache live fetches:** `cache: 'no-store'` used for real-time data fetches.
- **ClickHouse helper abstraction:** Shared helpers (`queryRows`, `insertRows`, `runCommand`) centralize query patterns.
- **Input validation on critical writes:** UUID checks, wallet URL validation in payment/member routes.
- **Fallback-first integration:** Open Payments routes support demo fallback when grants/config unavailable.

---

## Current Features

### Core
- **Immersive globe landing/app shell** — Interactive 3D globe with country hover/click and drill-down entry (`components/GlobeScene.tsx`, `components/dashboard/GlobeCenterPanel.tsx`)
- **City drill-down impact map** — Country selection opens MapLibre city map with damage heat overlays (`components/dashboard/MapcnDrilldownMap.tsx`)
- **Global emergency fund model** — Single global pool architecture (`lib/global-pool.ts`, `/pool`, `/contribute`, `/members`, `/governance`)
- **Contribution flow** — API + confirmation + optional email receipt (`app/api/payments/contribute/route.ts`, `app/api/payments/confirm/route.ts`)
- **Disaster ingestion & trigger processing** — Polls USGS/GDACS/OWM and processes payouts via cron (`app/api/cron/poll-disasters/route.ts`, `app/api/cron/process-payouts/route.ts`)
- **Manual disaster simulation** — Manual event creation with immediate trigger evaluation (`app/api/disasters/manual-trigger/route.ts`)
- **Governance** — Proposals and voting APIs + UI (`app/api/governance/*`, `app/governance/page.tsx`)
- **Analytics dashboard** — Fund balance, contribution trends, payout stats (`app/analytics/page.tsx`, `app/api/analytics/*`)
- **Live disaster feed** — List + Leaflet map + click-through to city drill-down (`app/disasters/page.tsx`)
- **SSE contribution stream** — Backend endpoint for live ticker (`app/api/sse/contributions/route.ts`)
- **Auth flow** — Supabase Google sign-in + callback (`app/login/page.tsx`, `app/auth/callback/route.ts`)

---

## Conflicted / Overlapping Features

### 1. Auth Strategy Conflict — NextAuth vs Supabase
- **Docs/PLAN describe:** NextAuth.js with email/magic link
- **Runtime uses:** Supabase Auth with Google OAuth
- **Impact:** Onboarding confusion, mismatched setup instructions

### 2. Product Model Conflict — Multi-pool vs Single Global Pool
- **Docs describe:** Multi-pool CRUD (create pools, browse, manage)
- **Runtime uses:** Single global pool with redirects (`/pools/*` → `/pool`)
- **Impact:** Feature expectations mismatch for judges/demo

### 3. Map Stack Overlap — Leaflet + MapLibre
- **Disaster map:** Uses Leaflet (`components/DisasterMapInner.tsx`)
- **City drill-down:** Uses MapLibre (`components/dashboard/MapcnDrilldownMap.tsx`)
- **Impact:** Extra bundle weight, duplicated paradigms, potential styling inconsistency

### 4. Ticker Feature Partially Integrated
- **Component exists:** `LedTicker.tsx` + SSE route (`app/api/sse/contributions/route.ts`)
- **Not mounted:** Not currently in `app/layout.tsx`
- **Impact:** README claims may overstate visible realtime UI

### 5. Route-Protection Mismatch
- **Proxy protects:** `/pools/:id/contribute`
- **Active flow uses:** `/contribute` (global route)
- **Impact:** Intended auth gate may not apply to primary contribution page

### 6. Home Nav Anchor Mismatch
- **Navbar links:** `/#home`, `/#stats`, `/#how-it-works`, etc.
- **Current page:** `app/page.tsx` has no section IDs
- **Impact:** Broken in-page navigation on home view

---

## Notes for Team Alignment

- If demo narrative is **global-fund-first**, update docs to remove multi-pool language
- If narrative remains **multi-pool**, remove redirect-based singleton flow and restore full pool pages
- Pick one auth narrative in docs (Supabase is currently implemented)
- Decide whether ticker is required for demo and wire into `app/layout.tsx` if yes
- Keep both map engines only if dual-map story is intentional; otherwise consolidate
