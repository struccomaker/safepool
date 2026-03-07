# SafePool Project Snapshot

Current state of the SafePool codebase (HACKOMANIA 2026), including stack, coding practices, shipped features, and active routes.

---

## Current Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.1.6 (App Router), React 18, TypeScript |
| Styling/UI | Tailwind CSS, shadcn/ui components |
| Database/Analytics | Supabase Postgres (transactional) + ClickHouse Cloud (disasters/analytics) |
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
- **Split persistence by workload:** Supabase Postgres is source of truth for transactional flows; ClickHouse is reserved for disaster processing and analytics queries.
- **Input validation on critical writes:** UUID checks, wallet URL validation in payment/member routes.
- **Fallback-first integration:** Open Payments routes support demo fallback when grants/config unavailable.
- **Environment-aware auth redirects:** OAuth uses runtime origin for localhost/domain and callback uses forwarded host/proto in deployment to avoid cross-origin bounce issues.
- **Canonical test wallet addressing:** Use `https://ilp.interledger-test.dev/<walletName>` for `POOL_WALLET_ADDRESS` and member wallet addresses; `https://wallet.interledger-test.dev` is UI-only.
- **Payment lifecycle hardening:** Incoming/outgoing callbacks, status polling, and recurring cron flows are implemented as first-class backend routes.
- **Encrypted sensitive payment state:** Stored Open Payments continuation/access tokens are encrypted at rest before persistence.
- **Unattended payout safety:** Interaction-required outgoing payouts are marked failed in cron flow to avoid indefinite pending states.

---

## Current Features

### Core
- **Immersive globe landing/app shell** — Interactive 3D globe with country hover/click and drill-down entry (`components/GlobeScene.tsx`, `components/dashboard/GlobeCenterPanel.tsx`, `components/dashboard/CountryDrilldownMap.tsx`)
- **Godzilla interaction layer (demo UX)** — Right-click spawn on globe surface, click-to-clear, keyboard controls (`W` forward, `A/D` rotate), optional FPS overlay (`~`), and top-nav mini preview state sync (`components/GlobeScene.tsx`, `components/dashboard/TopNavigationMenu.tsx`)
- **Auth UX polish** — One-time welcome overlay after successful OAuth callback (`auth_welcome` signal + login intent gating), with click-to-dismiss and fade-out (`components/dashboard/TopNavigationMenu.tsx`, `app/auth/callback/route.ts`)
- **Modal UX consistency** — Donation modal now closes on backdrop click, matching governance/voting modals (`components/dashboard/TopNavigationMenu.tsx`)
- **Global emergency fund model** — Single global pool architecture (`lib/global-pool.ts`, `app/api/global/*`)
- **Contribution and payout backend** — Open Payments contribute/confirm/callback/status + recurring and payout cron flows (`app/api/payments/*`, `app/api/recurring/create/route.ts`, `app/api/cron/*`)
- **Transactional backend migrated to Supabase** — Users, wallets, members, payment sessions, pending contributions, confirmed contributions, recurring contribution schedules, proposals, votes, and payout status cache run on Supabase tables (`app/api/wallet/me/route.ts`, `app/api/members/join/route.ts`, `app/api/payments/*`, `app/api/recurring/create/route.ts`, `app/api/cron/process-recurring/route.ts`, `app/api/governance/*`)
- **Payment continuation + status APIs** — Callback continuation and authenticated payment status checks (`app/api/payments/callback/route.ts`, `app/api/payments/status/route.ts`)
- **Wallet onboarding pipeline** — Canonical user wallet fetch/update endpoint (`app/api/wallet/me/route.ts`)
- **Recurring contributions** — Recurring grant creation + scheduled processing (`app/api/recurring/create/route.ts`, `app/api/cron/process-recurring/route.ts`)
- **Disaster ingestion & trigger processing** — Polls USGS/GDACS/OWM and processes payouts via cron (`app/api/cron/poll-disasters/route.ts`, `app/api/cron/process-payouts/route.ts`)
- **Manual disaster simulation** — Manual event creation with immediate trigger evaluation (`app/api/disasters/manual-trigger/route.ts`)
- **Governance backend** — Proposal and voting APIs (`app/api/governance/*`, `app/api/global/governance/proposals/route.ts`)
- **Analytics backend** — Fund balance, contribution trend, payout stats, disaster-map APIs (`app/api/analytics/*`)
- **SSE contribution stream** — Backend endpoint for live ticker (`app/api/sse/contributions/route.ts`)
- **Auth flow** — Supabase OAuth callback + protected profile page (`app/auth/callback/route.ts`, `app/profile/page.tsx`)
- **Legacy auth endpoint retired** — NextAuth handler remains only as explicit deprecation response (`app/api/auth/[...nextauth]/route.ts`)

---

## Canonical Routes

The app is now **single-pool + single-map-first**. The only map entry page is the root route (`/`), and multi-pool routes are removed.

### App Routes

- `/` — Main map page (primary and only map entry)
- `/profile` — User profile (protected)
- `/auth/callback` — Supabase OAuth callback handler
- `/auth/popup-complete` — OAuth popup completion

### API Routes

- `/api/global/pool` — Global pool details
- `/api/global/members` — Global pool members
- `/api/global/governance/proposals` — Global proposals list
- `/api/global/payments/history` — Global contribution history
- `/api/global/disasters/check` — Recent payout/disaster trigger check
- `/api/payments/contribute` — Create Open Payments incoming payment
- `/api/payments/confirm` — Confirm contribution + persist + email
- `/api/payments/callback` — Continue interactive Open Payments grants (incoming/outgoing/recurring)
- `/api/payments/status` — Authenticated status lookup for contribution/payout payments
- `/api/members/join` — Join global pool
- `/api/wallet/me` — Read/update the authenticated user's canonical wallet binding
- `/api/governance/propose` — Submit proposal
- `/api/governance/vote` — Cast vote
- `/api/disasters` — List disaster events
- `/api/disasters/manual-trigger` — Manual disaster simulation
- `/api/cron/poll-disasters` — Poll disaster providers
- `/api/cron/process-payouts` — Run payout processor
- `/api/recurring/create` — Create recurring contribution grant/session
- `/api/cron/process-recurring` — Execute due recurring contributions
- `/api/analytics/fund-balance` — Fund balance analytics
- `/api/analytics/contribution-trend` — Contribution trend analytics
- `/api/analytics/payout-stats` — Payout statistics
- `/api/analytics/disaster-map` — Disaster geospatial analytics
- `/api/sse/contributions` — Live contribution SSE stream
- `/api/auth/[...nextauth]` — Deprecated endpoint; returns HTTP 410 with Supabase migration message

### Database Setup Routes

- Transactional schema bootstrap: `scripts/init-supabase.sql`
- ClickHouse disasters + analytics schema bootstrap: `scripts/init-db.sql`
- ClickHouse transactional cleanup script: `scripts/trim-clickhouse-transactional.sql`

---

## Team Alignment Decisions (Current)

- Demo narrative: **global-fund-first**
- Auth narrative: **Supabase Google sign-in**
- Realtime claim: **enabled** (ticker mounted + SSE route active)
- Map strategy: **root-only map entry at `/`**
