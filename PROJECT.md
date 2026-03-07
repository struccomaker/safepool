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
- **Auth flow** — Supabase Google sign-in from top navigation + callback (`components/dashboard/TopNavigationMenu.tsx`, `app/auth/callback/route.ts`)

---

## Canonical Routes

The app is now **single-pool + single-map-first**. The only map entry page is the root route (`/`).

### App Routes

- `/` — Main map page (primary and only map entry)
- `/pool` — Global fund overview
- `/contribute` — Contribution flow (protected)
- `/governance` — Proposals and voting
- `/members` — Global member list
- `/profile` — User profile (protected)
- `/auth/callback` — OAuth callback handler
- `/auth/popup-complete` — OAuth popup completion

### API Routes

- `/api/global/pool` — Global pool details
- `/api/global/members` — Global pool members
- `/api/global/governance/proposals` — Global proposals list
- `/api/global/payments/history` — Global contribution history
- `/api/global/disasters/check` — Recent payout/disaster trigger check
- `/api/payments/contribute` — Create Open Payments incoming payment
- `/api/payments/confirm` — Confirm contribution + persist + email
- `/api/members/join` — Join global pool
- `/api/governance/propose` — Submit proposal
- `/api/governance/vote` — Cast vote
- `/api/disasters` — List disaster events
- `/api/disasters/manual-trigger` — Manual disaster simulation
- `/api/cron/poll-disasters` — Poll disaster providers
- `/api/cron/process-payouts` — Run payout processor
- `/api/analytics/fund-balance` — Fund balance analytics
- `/api/analytics/contribution-trend` — Contribution trend analytics
- `/api/analytics/payout-stats` — Payout statistics
- `/api/analytics/disaster-map` — Disaster geospatial analytics
- `/api/sse/contributions` — Live contribution SSE stream

---

## Team Alignment Decisions (Current)

- Demo narrative: **global-fund-first**
- Auth narrative: **Supabase Google sign-in**
- Realtime claim: **enabled** (ticker mounted + SSE route active)
- Map strategy: **root-only map entry at `/`**
