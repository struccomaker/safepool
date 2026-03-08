# SafePool Project Snapshot

Current state of the SafePool codebase (HACKOMANIA 2026), based on the routes and files currently present in this repository.

---

## Current Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.1.6 (App Router), React 18, TypeScript |
| Styling/UI | Tailwind CSS, shadcn/ui-style components |
| Auth + Transactional Data | Supabase Auth + Supabase Postgres (`@supabase/ssr`, `@supabase/supabase-js`) |
| Analytics/Event Mirror | ClickHouse Cloud (`@clickhouse/client`) |
| Payments | Interledger Open Payments (`@interledger/open-payments`) |
| Maps/Geo | react-globe.gl + Three.js, MapLibre GL, Leaflet |
| Charts | Recharts + TanStack Query |
| Realtime | Server-Sent Events (SSE) |
| Notifications | Nodemailer SMTP |

---

## Architecture Notes

- **Single global pool model:** The platform enforces one global fund via `GLOBAL_POOL_ID` in `lib/global-pool.ts`.
- **Split persistence:** Supabase is the system of record for users, memberships, wallet bindings, sessions, and governance; ClickHouse is used for disaster and analytics/event workloads.
- **Supabase-first auth:** Main auth flow is Supabase OAuth (`app/auth/callback/route.ts`); legacy NextAuth endpoint is intentionally deprecated and returns `410`.
- **Payments are grant-session based:** Contribution, recurring, and payout flows persist Open Payments grant/session state; sensitive continuation/access data is encrypted at rest.
- **Cron-driven automation:** Disaster polling, payout processing, and recurring processing run through protected cron routes using a bearer secret.
- **Demo-friendly behavior:** The app includes manual and mock disaster/payment triggers and UI demo overlays/hotkeys for live presentations.

---

## Major User-Facing Surfaces

- **Main experience (`/`):** 3D globe, drilldown map, sidebars, modals, governance and donation interactions (`app/page.tsx`, `components/GlobeScene.tsx`, `components/dashboard/*`).
- **Profile experience (`/profile`):** authenticated user profile, wallet, and account-related details (`app/profile/page.tsx`).
- **OAuth popup completion:** popup helper page for OAuth flow completion (`app/auth/popup-complete/page.tsx`).

Notable UI components:

- `components/GlobeScene.tsx`
- `components/dashboard/CountryDrilldownMap.tsx`
- `components/dashboard/TopNavigationMenu.tsx`
- `components/dashboard/LeftConfigSidebar.tsx`
- `components/dashboard/RightConfigSidebar.tsx`
- `components/dashboard/GovernanceModal.tsx`
- `components/dashboard/VotingModal.tsx`
- `components/EarthquakeDemoOverlay.tsx`
- `components/WalletSetupForm.tsx`

---

## Canonical Routes

### App Routes

- `/` - Main map/dashboard entry
- `/profile` - Authenticated profile page
- `/auth/callback` - Supabase OAuth callback handler
- `/auth/popup-complete` - OAuth popup completion page

### API Routes

Global pool reads:

- `/api/global/pool`
- `/api/global/members`
- `/api/global/payments/history`
- `/api/global/governance/proposals`
- `/api/global/donations/sidebar`
- `/api/global/disasters/check`

Payments and recurring:

- `/api/payments/contribute`
- `/api/payments/confirm`
- `/api/payments/status`
- `/api/payments/callback`
- `/api/payments/mock-trigger`
- `/api/recurring/create`

Membership, profile, wallet:

- `/api/members/join`
- `/api/profile/me`
- `/api/wallet/me`

Governance:

- `/api/governance/parameters`
- `/api/governance/propose`
- `/api/governance/vote`
- `/api/governance/seed-round`
- `/api/governance/resolve`

Disaster, analytics, realtime:

- `/api/disasters`
- `/api/disasters/manual-trigger`
- `/api/disasters/demo-payout`
- `/api/earthquake/demo-data`
- `/api/analytics/fund-balance`
- `/api/analytics/contribution-trend`
- `/api/analytics/payout-stats`
- `/api/analytics/disaster-map`
- `/api/sse/contributions`

Cron endpoints (bearer-protected):

- `/api/cron/poll-disasters`
- `/api/cron/process-payouts`
- `/api/cron/process-recurring`

Deprecated endpoint:

- `/api/auth/[...nextauth]` (returns HTTP `410`)

---

## Scripts and Data Setup

NPM scripts (`package.json`):

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run seed`

Database and migration scripts:

- `scripts/init-supabase.sql`
- `scripts/init-db.sql`
- `scripts/migrations/002_create_user_wallets.sql`
- `scripts/migrations/003_payments_phase2_phase3.sql`
- `scripts/supabase-anon-donor-migration.sql`
- `scripts/supabase-country-migration.sql`
- `scripts/trim-clickhouse-transactional.sql`

Seed and utility scripts:

- `scripts/seed.ts`
- `scripts/seed-governance.ts`
- `scripts/truncate-tables.ts`

---

## Team Alignment (Current)

- Product narrative: **global-fund-first**
- Auth direction: **Supabase OAuth (Google)**
- Realtime story: **enabled via SSE and live sidebars**
- Platform shape: **single-pool architecture with root-route map UX**
