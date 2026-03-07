# SafePool — Frontend Implementation Plan
## Member 1 | Landing Globe · NASDAQ Ticker · Pages · Components

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Read `CLAUDE.md` first for full project context.

**Goal:** Build the entire SafePool frontend — a 3D spinning globe landing page, real-time NASDAQ-style donor ticker in the top bar, all pool/disaster/analytics/governance pages, and every UI component.

**Architecture:** Next.js 14 App Router with React Server Components. The root layout holds the NASDAQ ticker (SSE client component) and navbar. `react-globe.gl` renders the 3D Earth on the landing page. Recharts draws ClickHouse analytics. Leaflet renders the disaster map. All data fetched from the API routes built by Members 2 & 3.

**Tech Stack:** `react-globe.gl` (Three.js), `react-leaflet`, `recharts`, `@tanstack/react-query`, `shadcn/ui`, Tailwind CSS, SSE (browser EventSource), TypeScript. All free.

> **Assumption:** Backend API routes are running at `localhost:3000/api/...`. If backend isn't ready yet, the pages use mock data (included below for each page).

---

## Phase 1 — Layout + Root Shell

### Task 1.1: Root layout with dark theme + NASDAQ ticker slot

**Files:**
- Modify: `safepool/app/layout.tsx`
- Create: `safepool/app/globals.css` (ensure dark vars)

**Step 1: Update globals.css for dark-first theme**
```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #050508;
  --foreground: #f0f0f0;
  --green: #22c55e;
  --red: #ef4444;
  --amber: #f59e0b;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: 'Inter', sans-serif;
}

/* LED ticker scroll animation */
@keyframes led-scroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

.led-track {
  animation: led-scroll 35s linear infinite;
  display: flex;
  width: max-content;
}

.led-track:hover {
  animation-play-state: paused;
}

/* LED dot-matrix grid overlay — simulates physical LED pixel panel */
.led-panel {
  position: relative;
  background: #080400;
}

.led-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(0,0,0,0.55) 1px, transparent 1px);
  background-size: 3px 3px;
  pointer-events: none;
  z-index: 1;
}

/* LED amber glow text */
.led-text {
  color: #FF8C00;
  text-shadow:
    0 0 4px  #FF8C00,
    0 0 8px  #FF6600,
    0 0 16px #FF4400;
  font-family: 'VT323', monospace;
  letter-spacing: 0.08em;
}
```

**Step 2: Update layout.tsx**
```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import LedTicker from '@/components/LedTicker'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SafePool — Community Emergency Funds',
  description: 'Automated community emergency fund with Interledger payouts',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#050508] text-white min-h-screen`}>
        {/* Physical LED marquee ticker — always at very top */}
        <LedTicker />
        {/* Main navigation */}
        <Navbar />
        {/* Page content */}
        <main>{children}</main>
      </body>
    </html>
  )
}
```

**Step 3: Create Navbar component**
```typescript
// components/Navbar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/pools', label: 'Pools' },
  { href: '/disasters', label: 'Disasters' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/profile', label: 'Profile' },
]

export default function Navbar() {
  const path = usePathname()
  return (
    <nav className="border-b border-white/10 bg-black/80 backdrop-blur-md sticky top-[36px] z-40">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="text-green-400 font-bold text-lg tracking-tight">
          🌐 SafePool
        </Link>
        <div className="flex gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                path === href ? 'bg-green-500/20 text-green-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <Link
          href="/pools/create"
          className="bg-green-500 hover:bg-green-400 text-black font-semibold px-4 py-1.5 rounded text-sm transition-colors"
        >
          + New Pool
        </Link>
      </div>
    </nav>
  )
}
```

**Step 4: Commit**
```bash
git add app/layout.tsx app/globals.css components/Navbar.tsx
git commit -m "feat: add root layout with dark theme and navbar"
```

---

### Task 1.2: Physical LED marquee ticker (real-time donor feed)

**Files:**
- Create: `safepool/components/LedTicker.tsx`
- Modify: `safepool/app/layout.tsx` (rename NasdaqTicker → LedTicker import)

**What it looks like** — a physical amber LED dot-matrix board mounted at the top of the screen:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [SAFEPOOL LIVE] ◆ MARIA S. +$10.00 USD → MANILA FLOOD RELIEF ◆ JOSE R. +$25.00 USD → MANILA ...
└─────────────────────────────────────────────────────────────────────────────┘
Amber glowing text, dot-grid overlay, dark panel — looks like an airport departure board or Times Square LED sign
```

**Step 1: Add VT323 font (free Google Font — perfect dot-matrix look)**

In `app/layout.tsx`, add to the `<head>`:
```typescript
// app/layout.tsx — add inside <head> or use next/font
import { VT323 } from 'next/font/google'

const vt323 = VT323({ weight: '400', subsets: ['latin'] })
```

Then apply `vt323.className` to the `<LedTicker />` wrapper, or pass it as a prop. Simplest: apply it directly inside the component.

**Step 2: Write the LED ticker component**
```typescript
// components/LedTicker.tsx
'use client'
import { useEffect, useState } from 'react'

interface TickerItem {
  member_name: string
  pool_name: string
  amount: number
  currency: string
  contributed_at: string
}

const MOCK: TickerItem[] = [
  { member_name: 'MARIA S.', pool_name: 'MANILA FLOOD RELIEF', amount: 10, currency: 'USD', contributed_at: '' },
  { member_name: 'JOSE R.', pool_name: 'MANILA FLOOD RELIEF', amount: 25, currency: 'USD', contributed_at: '' },
  { member_name: 'ANA C.', pool_name: 'MANILA FLOOD RELIEF', amount: 10, currency: 'USD', contributed_at: '' },
  { member_name: 'PEDRO L.', pool_name: 'MANILA FLOOD RELIEF', amount: 50, currency: 'USD', contributed_at: '' },
  { member_name: 'LUZ G.', pool_name: 'JAKARTA QUAKE POOL', amount: 15, currency: 'USD', contributed_at: '' },
  { member_name: 'AHMED K.', pool_name: 'NEPAL RELIEF FUND', amount: 30, currency: 'USD', contributed_at: '' },
]

export default function LedTicker() {
  const [items, setItems] = useState<TickerItem[]>(MOCK)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const es = new EventSource('/api/sse/contributions')
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as TickerItem[]
        if (data.length > 0) {
          // Uppercase everything for authentic LED board look
          setItems(data.map(d => ({
            ...d,
            member_name: d.member_name.toUpperCase(),
            pool_name: d.pool_name.toUpperCase(),
          })))
          setLive(true)
        }
      } catch {}
    }
    es.onerror = () => setLive(false)
    return () => es.close()
  }, [])

  // Triple-duplicate so seamless infinite loop
  const display = [...items, ...items, ...items]

  return (
    <div
      className="led-panel h-10 overflow-hidden flex items-center z-50 relative border-b border-amber-900/40"
      style={{ fontFamily: "'VT323', monospace" }}
    >
      {/* Fixed left badge */}
      <div
        className="flex-shrink-0 h-full flex items-center px-4 border-r border-amber-800/60 z-10"
        style={{
          background: '#0f0600',
          boxShadow: 'inset 0 0 12px rgba(255,100,0,0.15)',
        }}
      >
        {/* Blinking live dot */}
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${live ? 'animate-pulse' : ''}`}
          style={{
            background: live ? '#FF8C00' : '#664400',
            boxShadow: live ? '0 0 6px #FF8C00, 0 0 12px #FF6600' : 'none',
          }}
        />
        <span
          className="text-lg tracking-widest whitespace-nowrap"
          style={{
            color: '#FF8C00',
            textShadow: '0 0 6px #FF8C00, 0 0 12px #FF6600',
          }}
        >
          SAFEPOOL LIVE
        </span>
      </div>

      {/* Scrolling LED content */}
      <div className="flex-1 overflow-hidden">
        <div className="led-track flex items-center">
          {display.map((item, i) => (
            <span key={i} className="flex items-center whitespace-nowrap text-lg">
              {/* Separator diamond */}
              <span
                className="mx-5 text-base"
                style={{ color: '#FF4400', textShadow: '0 0 8px #FF4400' }}
              >
                ◆
              </span>

              {/* Donor name - bright amber */}
              <span style={{ color: '#FFB830', textShadow: '0 0 6px #FFB830, 0 0 10px #FF8C00' }}>
                {item.member_name}
              </span>

              {/* Amount - bright green (like a positive stock tick) */}
              <span
                className="mx-2"
                style={{ color: '#22FF88', textShadow: '0 0 6px #22FF88, 0 0 12px #00FF66' }}
              >
                +${item.amount.toFixed(2)} {item.currency}
              </span>

              {/* Arrow */}
              <span style={{ color: '#FF6600', textShadow: '0 0 4px #FF6600' }}>→</span>

              {/* Pool name - dimmer amber */}
              <span className="ml-2" style={{ color: '#CC6600', textShadow: '0 0 4px #CC4400' }}>
                {item.pool_name}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Update layout.tsx to use LedTicker**

Replace `NasdaqTicker` import and usage with `LedTicker`:
```typescript
import LedTicker from '@/components/LedTicker'
// ...
<LedTicker />
```

**Step 4: Verify it renders**
```bash
npm run dev
# Visit http://localhost:3000
# Top bar should look like a physical amber LED marquee board
# Text glows orange-amber, dot grid overlay visible, scrolling smoothly
```

**Step 5: Commit**
```bash
git add components/LedTicker.tsx app/layout.tsx app/globals.css
git commit -m "feat: add physical LED marquee ticker with amber glow + dot matrix"
```

---

## Phase 2 — Landing Page with 3D Globe

### Task 2.1: Install react-globe.gl

**Step 1: Install**
```bash
npm install react-globe.gl
npm install --save-dev @types/three
```

**Step 2: Verify install**
```bash
cat package.json | grep globe
# Should show: "react-globe.gl": "^x.x.x"
```

---

### Task 2.2: Create GlobeScene component (conflictly.app style)

**Files:**
- Create: `safepool/components/GlobeScene.tsx`

**Visual target** — dark Earth from space with:
- NASA night satellite texture (city lights visible)
- Thick cyan/teal atmospheric glow around the rim
- Animated green donation arcs flying between cities
- Pulsing red rings expanding outward from disaster zones (like radar pings)
- Deep starfield background
- Slow auto-rotation

> `react-globe.gl` must be a client component with `dynamic` import to avoid SSR crash.

**Step 1: Write the component**
```typescript
// components/GlobeScene.tsx
'use client'
import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'

const Globe = dynamic(() => import('react-globe.gl'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-16 h-16 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  ),
})

// Donation arcs: money flowing from donor cities → disaster zones
const ARCS = [
  { startLat: 37.77,  startLng: -122.42, endLat: 14.60,  endLng: 120.98, color: ['#00ffcc', '#22c55e'] },  // SF → Manila
  { startLat: 51.51,  startLng: -0.13,   endLat: 14.60,  endLng: 120.98, color: ['#00ffcc', '#22c55e'] },  // London → Manila
  { startLat: 35.68,  startLng: 139.65,  endLat: -6.21,  endLng: 106.85, color: ['#00e5ff', '#06b6d4'] },  // Tokyo → Jakarta
  { startLat: 48.86,  startLng: 2.35,    endLat: 27.72,  endLng: 85.32,  color: ['#00ffcc', '#22c55e'] },  // Paris → Nepal
  { startLat: -33.87, startLng: 151.21,  endLat: 13.76,  endLng: 100.50, color: ['#00e5ff', '#06b6d4'] },  // Sydney → Bangkok
  { startLat: 1.35,   startLng: 103.82,  endLat: 14.60,  endLng: 120.98, color: ['#00ffcc', '#22c55e'] },  // Singapore → Manila
  { startLat: 40.71,  startLng: -74.01,  endLat: -6.21,  endLng: 106.85, color: ['#00e5ff', '#06b6d4'] },  // NYC → Jakarta
]

// Disaster zone rings — pulsing outward like a sonar ping
const RINGS = [
  { lat: 14.60,  lng: 120.98, maxR: 4, propagationSpeed: 1.5, repeatPeriod: 900,  color: () => '#ef4444' }, // Manila
  { lat: -6.21,  lng: 106.85, maxR: 3, propagationSpeed: 1.2, repeatPeriod: 1100, color: () => '#f97316' }, // Jakarta
  { lat: 27.72,  lng: 85.32,  maxR: 2.5, propagationSpeed: 1, repeatPeriod: 1300, color: () => '#f59e0b' }, // Nepal
  { lat: 13.76,  lng: 100.50, maxR: 3, propagationSpeed: 1.3, repeatPeriod: 1000, color: () => '#ef4444' }, // Bangkok
]

// Point markers at disaster locations
const POINTS = [
  { lat: 14.60,  lng: 120.98, size: 0.4, color: '#ef4444', label: 'M6.5 Earthquake · Manila' },
  { lat: -6.21,  lng: 106.85, size: 0.3, color: '#f97316', label: 'Flood · Jakarta' },
  { lat: 27.72,  lng: 85.32,  size: 0.25, color: '#f59e0b', label: 'Earthquake · Nepal' },
  { lat: 13.76,  lng: 100.50, size: 0.3, color: '#ef4444', label: 'Flood · Bangkok' },
]

export default function GlobeScene() {
  const ref = useRef<any>(null)

  useEffect(() => {
    if (!ref.current) return
    const ctrl = ref.current.controls()
    ctrl.autoRotate = true
    ctrl.autoRotateSpeed = 0.4      // slow, majestic rotation
    ctrl.enableZoom = false
    ctrl.enablePan = false
    // Start focused on South-East Asia (the disaster zone)
    ref.current.pointOfView({ lat: 8, lng: 118, altitude: 1.9 }, 1200)
  }, [])

  const w = typeof window !== 'undefined' ? window.innerWidth  : 1200
  const h = typeof window !== 'undefined' ? window.innerHeight : 800

  return (
    <Globe
      ref={ref}
      width={w}
      height={h}

      // === EARTH TEXTURE ===
      // NASA night satellite image — shows city lights, dark oceans
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
      bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"

      // === ATMOSPHERE — thick cyan glow like conflictly ===
      atmosphereColor="#06b6d4"        // cyan-500
      atmosphereAltitude={0.28}        // thick outer glow

      // === BACKGROUND — deep space ===
      backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"

      // === DONATION ARCS ===
      arcsData={ARCS}
      arcColor="color"                  // gradient array [start, end]
      arcAltitude={0.35}               // how high arcs rise above surface
      arcStroke={0.6}
      arcDashLength={0.35}
      arcDashGap={0.15}
      arcDashAnimateTime={1800}        // ms per animation cycle
      arcLabel={(d: any) => `Donation arc`}

      // === PULSING RINGS (key conflictly effect) ===
      ringsData={RINGS}
      ringColor="color"
      ringMaxRadius="maxR"
      ringPropagationSpeed="propagationSpeed"
      ringRepeatPeriod="repeatPeriod"

      // === DISASTER POINT MARKERS ===
      pointsData={POINTS}
      pointColor="color"
      pointAltitude={0.015}
      pointRadius="size"
      pointResolution={8}
      pointLabel="label"
    />
  )
}
```

**Step 2: Verify the globe looks right**
```bash
npm run dev
# Visit http://localhost:3000
# Should see:
#   - Dark Earth with glowing city lights
#   - Thick cyan atmospheric rim glow
#   - Animated green arcs flying between cities
#   - Red pulsing rings expanding from Manila, Jakarta, etc.
#   - Slow rotation focused on South-East Asia
```

**Step 3: Commit**
```bash
git add components/GlobeScene.tsx
git commit -m "feat: add dark Earth globe — conflictly style with cyan glow + pulsing disaster rings"
```

---

### Task 2.3: Build landing page

**Files:**
- Modify: `safepool/app/page.tsx`

**Step 1: Write landing page**
```typescript
// app/page.tsx
import Link from 'next/link'
import GlobeScene from '@/components/GlobeScene'

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-[#050508] overflow-hidden">
      {/* Globe — full viewport background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <GlobeScene />
      </div>

      {/* Dark overlay gradient so text is readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#050508]/60 via-transparent to-[#050508]" />

      {/* Hero content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-4">
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-1.5 rounded-full text-sm font-medium">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            HACKOMANIA 2026 · Interledger + ClickHouse
          </span>
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-4 leading-none">
          <span className="text-white">Safe</span>
          <span className="text-green-400">Pool</span>
        </h1>

        <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mb-3 font-light">
          Community-powered emergency funds that pay out automatically when disaster strikes.
        </p>

        <p className="text-gray-500 max-w-xl mb-10 text-sm">
          Pool micro-contributions with your community → disaster detected by USGS/GDACS → Interledger sends payments instantly to every affected member.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href="/pools"
            className="bg-green-500 hover:bg-green-400 text-black font-bold px-8 py-3 rounded-lg text-lg transition-colors"
          >
            Browse Pools
          </Link>
          <Link
            href="/pools/create"
            className="border border-white/20 hover:border-green-500/50 text-white hover:text-green-400 font-semibold px-8 py-3 rounded-lg text-lg transition-colors bg-white/5"
          >
            Start a Pool
          </Link>
        </div>

        {/* Live stats row */}
        <div className="mt-16 flex flex-wrap gap-8 justify-center">
          {[
            { label: 'Active Pools', value: '12' },
            { label: 'Total Contributors', value: '847' },
            { label: 'Funds Protected', value: '$24,300' },
            { label: 'Avg Payout Time', value: '2.3s' },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold text-green-400">{value}</div>
              <div className="text-gray-500 text-sm">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}
```

**Step 2: Verify the globe renders**
```bash
npm run dev
# Visit http://localhost:3000 — should see spinning Earth with green arcs and red points
# NASDAQ ticker scrolling at top
```

**Step 3: Commit**
```bash
git add app/page.tsx
git commit -m "feat: add landing page with 3D globe hero + stats"
```

---

## Phase 3 — Dashboard Page

### Task 3.1: Dashboard page

**Files:**
- Create: `safepool/app/dashboard/page.tsx`

```typescript
// app/dashboard/page.tsx
import Link from 'next/link'

async function getData() {
  try {
    const [pools, disasters] = await Promise.all([
      fetch(`${process.env.NEXTAUTH_URL}/api/pools`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`${process.env.NEXTAUTH_URL}/api/disasters?limit=5`, { cache: 'no-store' }).then(r => r.json()),
    ])
    return { pools: pools ?? [], disasters: disasters ?? [] }
  } catch {
    return { pools: [], disasters: [] }
  }
}

export default async function DashboardPage() {
  const { pools, disasters } = await getData()

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
        <p className="text-gray-400">Your pools and recent activity</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Your Pools', value: pools.length, color: 'text-green-400' },
          { label: 'Disasters Tracked', value: disasters.length, color: 'text-amber-400' },
          { label: 'Total Contributed', value: '$0.00', color: 'text-blue-400' },
          { label: 'Payouts Received', value: '$0.00', color: 'text-purple-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-gray-400 text-sm mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Pools */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Active Pools</h2>
            <Link href="/pools" className="text-green-400 text-sm hover:underline">View all →</Link>
          </div>
          <div className="space-y-3">
            {pools.slice(0, 5).map((pool: any) => (
              <Link key={pool.id} href={`/pools/${pool.id}`}>
                <div className="bg-white/5 border border-white/10 hover:border-green-500/30 rounded-xl p-4 cursor-pointer transition-colors">
                  <div className="font-medium">{pool.name}</div>
                  <div className="text-gray-400 text-sm mt-1 truncate">{pool.description}</div>
                  <div className="flex gap-3 mt-2">
                    <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded">{pool.distribution_model}</span>
                    <span className="text-xs bg-white/5 text-gray-400 px-2 py-0.5 rounded">{pool.currency} {pool.contribution_amount}/mo</span>
                  </div>
                </div>
              </Link>
            ))}
            {pools.length === 0 && (
              <div className="text-gray-500 text-sm py-8 text-center border border-dashed border-white/10 rounded-xl">
                No pools yet.{' '}
                <Link href="/pools/create" className="text-green-400 hover:underline">Create one →</Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Disasters */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Disasters</h2>
            <Link href="/disasters" className="text-green-400 text-sm hover:underline">View all →</Link>
          </div>
          <div className="space-y-3">
            {disasters.slice(0, 5).map((d: any) => (
              <div key={d.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium capitalize">{d.disaster_type} — {d.location_name}</div>
                    <div className="text-gray-400 text-sm mt-0.5">M{d.magnitude} · {d.severity}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    d.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    d.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>{d.severity}</span>
                </div>
              </div>
            ))}
            {disasters.length === 0 && (
              <div className="text-gray-500 text-sm py-8 text-center border border-dashed border-white/10 rounded-xl">
                No disasters recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add app/dashboard/page.tsx
git commit -m "feat: add dashboard page with pools + disaster overview"
```

---

## Phase 4 — Pool Pages

### Task 4.1: Pool listing page

**Files:**
- Create: `safepool/app/pools/page.tsx`

```typescript
// app/pools/page.tsx
import Link from 'next/link'

async function getPools() {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/pools`, { cache: 'no-store' })
    return res.json()
  } catch { return [] }
}

export default async function PoolsPage() {
  const pools = await getPools()

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1">Emergency Pools</h1>
          <p className="text-gray-400">Community funds that pay out automatically on disaster</p>
        </div>
        <Link href="/pools/create" className="bg-green-500 hover:bg-green-400 text-black font-bold px-5 py-2.5 rounded-lg transition-colors">
          + New Pool
        </Link>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {pools.map((pool: any) => (
          <Link key={pool.id} href={`/pools/${pool.id}`}>
            <div className="bg-white/5 border border-white/10 hover:border-green-500/40 rounded-2xl p-6 cursor-pointer transition-all hover:bg-white/8 group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-xl">🏦</div>
                <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full border border-green-500/20">Active</span>
              </div>
              <h3 className="font-bold text-lg mb-1 group-hover:text-green-400 transition-colors">{pool.name}</h3>
              <p className="text-gray-400 text-sm mb-4 line-clamp-2">{pool.description}</p>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs bg-white/5 text-gray-300 px-2 py-1 rounded border border-white/10">{pool.distribution_model.replace('_', ' ')}</span>
                <span className="text-xs bg-white/5 text-gray-300 px-2 py-1 rounded border border-white/10">{pool.currency} {pool.contribution_amount}/{pool.contribution_frequency?.replace('_', ' ')}</span>
              </div>
            </div>
          </Link>
        ))}

        {pools.length === 0 && (
          <div className="col-span-3 text-center py-24 text-gray-500">
            <div className="text-5xl mb-4">🌊</div>
            <p className="text-xl font-medium mb-2">No pools yet</p>
            <p className="mb-6">Be the first to create an emergency fund pool.</p>
            <Link href="/pools/create" className="bg-green-500 text-black font-bold px-6 py-2.5 rounded-lg">Create Pool</Link>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add app/pools/page.tsx
git commit -m "feat: add pool listing page"
```

---

### Task 4.2: Create pool form

**Files:**
- Create: `safepool/app/pools/create/page.tsx`

```typescript
// app/pools/create/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DISASTER_TYPES = ['earthquake', 'flood', 'typhoon', 'cyclone', 'volcanic', 'tsunami', 'fire']

export default function CreatePoolPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    distribution_model: 'equal_split',
    contribution_frequency: 'monthly',
    contribution_amount: 10,
    currency: 'USD',
    payout_cap: 500,
    minMagnitude: 5.5,
    radius_km: 100,
    disasterTypes: ['earthquake', 'flood'] as string[],
  })

  function toggleType(t: string) {
    setForm(f => ({
      ...f,
      disasterTypes: f.disasterTypes.includes(t) ? f.disasterTypes.filter(x => x !== t) : [...f.disasterTypes, t],
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const body = {
      name: form.name,
      description: form.description,
      distribution_model: form.distribution_model,
      contribution_frequency: form.contribution_frequency,
      contribution_amount: Number(form.contribution_amount),
      currency: form.currency,
      payout_cap: Number(form.payout_cap),
      trigger_rules: JSON.stringify({ minMagnitude: form.minMagnitude, disasterTypes: form.disasterTypes, radius_km: form.radius_km }),
      governance_rules: JSON.stringify({ quorum_pct: 51, vote_threshold: 66 }),
    }
    const res = await fetch('/api/pools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      const pool = await res.json()
      router.push(`/pools/${pool.id}`)
    }
    setLoading(false)
  }

  const input = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500/50 focus:outline-none text-sm"
  const label = "block text-sm text-gray-400 mb-1"

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Create Emergency Pool</h1>
      <p className="text-gray-400 mb-8">Set up a community fund with automatic disaster payouts.</p>

      <form onSubmit={submit} className="space-y-6">
        <div>
          <label className={label}>Pool Name *</label>
          <input className={input} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Manila Flood Relief" />
        </div>

        <div>
          <label className={label}>Description *</label>
          <textarea className={`${input} h-24 resize-none`} required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the purpose of this pool..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Contribution Amount</label>
            <input type="number" className={input} value={form.contribution_amount} onChange={e => setForm(f => ({ ...f, contribution_amount: Number(e.target.value) }))} min={1} />
          </div>
          <div>
            <label className={label}>Currency</label>
            <select className={input} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Distribution Model</label>
            <select className={input} value={form.distribution_model} onChange={e => setForm(f => ({ ...f, distribution_model: e.target.value }))}>
              <option value="equal_split">Equal Split</option>
              <option value="severity_based">Severity Based</option>
              <option value="household_size">Household Size</option>
              <option value="capped">Capped Per Member</option>
            </select>
          </div>
          <div>
            <label className={label}>Payout Cap (USD)</label>
            <input type="number" className={input} value={form.payout_cap} onChange={e => setForm(f => ({ ...f, payout_cap: Number(e.target.value) }))} />
          </div>
        </div>

        <div>
          <label className={label}>Trigger Disaster Types</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {DISASTER_TYPES.map(t => (
              <button key={t} type="button"
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  form.disasterTypes.includes(t) ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                }`}
                onClick={() => toggleType(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Min Magnitude</label>
            <input type="number" step="0.5" className={input} value={form.minMagnitude} onChange={e => setForm(f => ({ ...f, minMagnitude: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={label}>Radius (km)</label>
            <input type="number" className={input} value={form.radius_km} onChange={e => setForm(f => ({ ...f, radius_km: Number(e.target.value) }))} />
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold py-3 rounded-lg transition-colors">
          {loading ? 'Creating...' : 'Create Pool'}
        </button>
      </form>
    </div>
  )
}
```

**Commit:**
```bash
git add app/pools/create/page.tsx
git commit -m "feat: add pool creation form"
```

---

### Task 4.3: FundMeter component

**Files:**
- Create: `safepool/components/FundMeter.tsx`

```typescript
// components/FundMeter.tsx
'use client'

interface FundMeterProps {
  current: number
  target: number
  currency: string
}

export default function FundMeter({ current, target, currency }: FundMeterProps) {
  const pct = Math.min((current / target) * 100, 100)
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-gray-400 text-sm mb-0.5">Pool Balance</div>
          <div className="text-3xl font-bold" style={{ color }}>
            {currency} {current.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="text-right">
          <div className="text-gray-500 text-xs">Target</div>
          <div className="text-gray-300 font-medium">{currency} {target.toLocaleString()}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 12px ${color}60` }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-xs text-gray-500">{pct.toFixed(1)}% funded</span>
        <span className="text-xs text-gray-500">{currency} {(target - current).toFixed(2)} to go</span>
      </div>
    </div>
  )
}
```

---

### Task 4.4: ContributionTimeline component (Recharts)

**Files:**
- Create: `safepool/components/ContributionTimeline.tsx`

```typescript
// components/ContributionTimeline.tsx
'use client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface DataPoint {
  date: string
  daily_total: number
}

interface Props {
  data: DataPoint[]
}

export default function ContributionTimeline({ data }: Props) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date)).slice(-30)

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <h3 className="text-sm font-medium text-gray-400 mb-4">Contribution Trend (Last 30 days)</h3>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={sorted}>
          <defs>
            <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
          <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }}
            labelStyle={{ color: '#aaa' }}
            itemStyle={{ color: '#22c55e' }}
          />
          <Area type="monotone" dataKey="daily_total" stroke="#22c55e" strokeWidth={2} fill="url(#green)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

### Task 4.5: Pool detail page

**Files:**
- Create: `safepool/app/pools/[id]/page.tsx`

```typescript
// app/pools/[id]/page.tsx
import Link from 'next/link'
import FundMeter from '@/components/FundMeter'
import ContributionTimeline from '@/components/ContributionTimeline'

async function getPoolData(id: string) {
  const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  try {
    const [pool, trend, balance] = await Promise.all([
      fetch(`${base}/api/pools/${id}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`${base}/api/analytics/contribution-trend?poolId=${id}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`${base}/api/analytics/fund-balance?poolId=${id}`, { cache: 'no-store' }).then(r => r.json()),
    ])
    return { pool, trend: trend ?? [], balance: balance?.[0]?.balance ?? 0 }
  } catch { return { pool: null, trend: [], balance: 0 } }
}

export default async function PoolDetailPage({ params }: { params: { id: string } }) {
  const { pool, trend, balance } = await getPoolData(params.id)

  if (!pool) return <div className="max-w-4xl mx-auto px-4 py-10 text-gray-400">Pool not found.</div>

  const rules = (() => { try { return JSON.parse(pool.trigger_rules) } catch { return {} } })()

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link href="/pools" className="text-gray-500 text-sm hover:text-gray-300 mb-3 block">← Back to Pools</Link>
          <h1 className="text-3xl font-bold">{pool.name}</h1>
          <p className="text-gray-400 mt-1">{pool.description}</p>
        </div>
        <Link
          href={`/pools/${params.id}/contribute`}
          className="bg-green-500 hover:bg-green-400 text-black font-bold px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap"
        >
          Contribute
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <FundMeter current={Number(balance)} target={10000} currency={pool.currency} />

        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Pool Settings</h3>
          <div className="space-y-2.5">
            {[
              ['Distribution', pool.distribution_model?.replace(/_/g, ' ')],
              ['Contribution', `${pool.currency} ${pool.contribution_amount}/${pool.contribution_frequency}`],
              ['Payout Cap', `${pool.currency} ${pool.payout_cap}`],
              ['Min Magnitude', rules.minMagnitude ?? '—'],
              ['Radius', `${rules.radius_km ?? '—'} km`],
              ['Triggers', (rules.disasterTypes ?? []).join(', ') || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-gray-500">{k}</span>
                <span className="text-white capitalize">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6">
        <ContributionTimeline data={trend} />
      </div>

      <div className="flex gap-3">
        {[
          { href: `/pools/${params.id}/governance`, label: 'Governance' },
          { href: `/pools/${params.id}/members`, label: 'Members' },
          { href: `/pools/${params.id}/contribute`, label: 'Contribute' },
        ].map(({ href, label }) => (
          <Link key={href} href={href} className="border border-white/10 hover:border-green-500/40 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors">
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add app/pools/[id]/page.tsx components/FundMeter.tsx components/ContributionTimeline.tsx
git commit -m "feat: add pool detail page with FundMeter + timeline"
```

---

### Task 4.6: Contribution flow page

**Files:**
- Create: `safepool/app/pools/[id]/contribute/page.tsx`

```typescript
// app/pools/[id]/contribute/page.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function ContributePage() {
  const params = useParams()
  const poolId = params.id as string
  const [step, setStep] = useState<'form' | 'pending' | 'done'>('form')
  const [amount, setAmount] = useState(10)
  const [wallet, setWallet] = useState('')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<any>(null)

  async function contribute() {
    setStep('pending')
    const res = await fetch('/api/payments/contribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pool_id: poolId, member_id: 'guest', amount, currency: 'USD', wallet_address: wallet }),
    })
    const data = await res.json()
    setResult(data)

    // Auto-confirm for demo
    await fetch('/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contribution_id: data.contribution_id }),
    })

    setStep('done')
  }

  const input = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500/50 focus:outline-none text-sm"

  if (step === 'done') return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="text-6xl mb-4">✅</div>
      <h2 className="text-2xl font-bold mb-2">Contribution Confirmed!</h2>
      <p className="text-gray-400 mb-2">USD {amount.toFixed(2)} added to pool</p>
      <p className="text-gray-500 text-sm mb-8">A confirmation email has been sent to your address.</p>
      <Link href={`/pools/${poolId}`} className="bg-green-500 text-black font-bold px-6 py-2.5 rounded-lg">Back to Pool</Link>
    </div>
  )

  if (step === 'pending') return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4 animate-spin">⚙️</div>
      <p className="text-gray-400">Processing payment via Interledger...</p>
    </div>
  )

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <Link href={`/pools/${poolId}`} className="text-gray-500 text-sm hover:text-gray-300 mb-6 block">← Back to Pool</Link>
      <h1 className="text-2xl font-bold mb-6">Make a Contribution</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Amount (USD)</label>
          <div className="flex gap-2 mb-2">
            {[5, 10, 25, 50].map(a => (
              <button key={a} type="button"
                onClick={() => setAmount(a)}
                className={`px-3 py-1.5 rounded text-sm border transition-colors ${amount === a ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                ${a}
              </button>
            ))}
          </div>
          <input type="number" className={input} value={amount} onChange={e => setAmount(Number(e.target.value))} min={1} />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Wallet Address</label>
          <input className={input} placeholder="https://wallet.interledger-test.dev/yourname" value={wallet} onChange={e => setWallet(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Email (for confirmation)</label>
          <input type="email" className={input} placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 text-sm text-gray-400">
          Your contribution will be sent via <span className="text-green-400 font-medium">Interledger Open Payments</span>. Funds pool automatically and pay out when a verified disaster is detected.
        </div>

        <button onClick={contribute} className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-lg transition-colors">
          Contribute USD {amount.toFixed(2)}
        </button>
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add app/pools/[id]/contribute/page.tsx
git commit -m "feat: add ILP contribution flow page"
```

---

## Phase 5 — Disasters Page + Map

### Task 5.1: DisasterMap component (Leaflet)

**Files:**
- Create: `safepool/components/DisasterMap.tsx`

> Leaflet can't run on the server — must be a client component with dynamic import.

```typescript
// components/DisasterMap.tsx
'use client'
import dynamic from 'next/dynamic'
import type { DisasterEvent } from '@/types'

// SSR-safe import
const MapComponent = dynamic(() => import('./DisasterMapInner'), { ssr: false, loading: () => (
  <div className="w-full h-[400px] bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-gray-500">
    Loading map...
  </div>
)})

export default function DisasterMap({ events }: { events: DisasterEvent[] }) {
  return <MapComponent events={events} />
}
```

**Create inner map:**
```typescript
// components/DisasterMapInner.tsx
'use client'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { DisasterEvent } from '@/types'

const severityColor: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#22c55e',
}

export default function DisasterMapInner({ events }: { events: DisasterEvent[] }) {
  return (
    <MapContainer
      center={[10, 115]}
      zoom={3}
      className="w-full h-[400px] rounded-xl"
      style={{ background: '#0a0a14' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com">CARTO</a>'
      />
      {events.map((ev) => (
        <CircleMarker
          key={ev.id}
          center={[ev.location_lat, ev.location_lon]}
          radius={Math.max(5, (ev.magnitude ?? 3) * 2)}
          pathOptions={{
            color: severityColor[ev.severity] ?? '#f59e0b',
            fillColor: severityColor[ev.severity] ?? '#f59e0b',
            fillOpacity: 0.5,
            weight: 1.5,
          }}
        >
          <Popup className="dark-popup">
            <div className="text-xs">
              <strong className="capitalize">{ev.disaster_type}</strong> — M{ev.magnitude}<br />
              {ev.location_name}<br />
              <span className="capitalize text-orange-400">{ev.severity}</span>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
```

---

### Task 5.2: Disasters page

**Files:**
- Create: `safepool/app/disasters/page.tsx`

```typescript
// app/disasters/page.tsx
import DisasterMap from '@/components/DisasterMap'
import type { DisasterEvent } from '@/types'

async function getDisasters(): Promise<DisasterEvent[]> {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/disasters?limit=100`, { cache: 'no-store' })
    return res.json()
  } catch { return [] }
}

export default async function DisastersPage() {
  const events = await getDisasters()

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Disaster Feed</h1>
      <p className="text-gray-400 mb-6">Live events from USGS + GDACS, checked every 5 minutes</p>

      <div className="mb-8">
        <DisasterMap events={events} />
      </div>

      <div className="space-y-3">
        {events.map((ev) => (
          <div key={ev.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start justify-between">
            <div>
              <div className="font-medium capitalize">{ev.disaster_type} — <span className="text-gray-300">{ev.location_name}</span></div>
              <div className="text-gray-500 text-sm mt-0.5">
                M{ev.magnitude} · Source: {ev.source} · {new Date(ev.occurred_at).toLocaleDateString()}
              </div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${
              ev.severity === 'critical' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
              ev.severity === 'high' ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' :
              'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
            }`}>{ev.severity}</span>
          </div>
        ))}
        {events.length === 0 && (
          <div className="text-center py-12 text-gray-500">No events yet. Run the disaster poll cron.</div>
        )}
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add components/DisasterMap.tsx components/DisasterMapInner.tsx app/disasters/page.tsx
git commit -m "feat: add disaster feed + Leaflet map"
```

---

## Phase 6 — Analytics Page

### Task 6.1: Analytics page with Recharts

**Files:**
- Create: `safepool/app/analytics/page.tsx`

```typescript
// app/analytics/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#06b6d4']

export default function AnalyticsPage() {
  const [balances, setBalances] = useState<any[]>([])
  const [trend, setTrend] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/analytics/fund-balance').then(r => r.json()),
      fetch('/api/analytics/contribution-trend').then(r => r.json()),
      fetch('/api/analytics/payout-stats').then(r => r.json()),
    ]).then(([b, t, p]) => {
      setBalances(b ?? [])
      setTrend((t ?? []).sort((a: any, b: any) => a.date.localeCompare(b.date)).slice(-30))
      setPayouts(p ?? [])
    }).catch(() => {})
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Analytics</h1>
      <p className="text-gray-400 mb-8">Real-time data from ClickHouse materialized views</p>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Funds Pooled', value: `$${balances.reduce((s, b) => s + Number(b.balance), 0).toFixed(2)}` },
          { label: 'Total Contributions', value: balances.reduce((s, b) => s + Number(b.count), 0).toString() },
          { label: 'Pools Tracked', value: balances.length.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
            <div className="text-2xl font-bold text-green-400">{value}</div>
            <div className="text-gray-400 text-sm mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Contribution trend */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm text-gray-400 mb-4 font-medium">Daily Contributions (30d)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} itemStyle={{ color: '#22c55e' }} labelStyle={{ color: '#aaa' }} />
              <Bar dataKey="daily_total" fill="#22c55e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pool balances */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm text-gray-400 mb-4 font-medium">Pool Balances</h3>
          {balances.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={balances} dataKey="balance" nameKey="pool_id" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${(percent * 100).toFixed(0)}%`}>
                  {balances.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-gray-500 text-sm text-center py-16">No data yet</div>
          )}
        </div>
      </div>

      {/* Payout stats */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm text-gray-400 mb-4 font-medium">Payout Statistics by Disaster Type</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-2 pr-4">Disaster Type</th>
                <th className="text-right py-2 pr-4">Payouts</th>
                <th className="text-right py-2 pr-4">Total Paid</th>
                <th className="text-right py-2">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((row: any, i: number) => (
                <tr key={i} className="border-b border-white/5 text-gray-300">
                  <td className="py-2 pr-4 capitalize">{row.disaster_type}</td>
                  <td className="text-right py-2 pr-4">{row.payout_count}</td>
                  <td className="text-right py-2 pr-4 text-green-400">${Number(row.total_paid).toFixed(2)}</td>
                  <td className="text-right py-2 text-blue-400">{Number(row.avg_latency_seconds).toFixed(1)}s</td>
                </tr>
              ))}
              {payouts.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-gray-500">No payouts yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add app/analytics/page.tsx
git commit -m "feat: add analytics page with ClickHouse Recharts visualizations"
```

---

## Phase 7 — Governance + PayoutTracker + Profile

### Task 7.1: PayoutTracker component

**Files:**
- Create: `safepool/components/PayoutTracker.tsx`

```typescript
// components/PayoutTracker.tsx
'use client'
import { useEffect, useState } from 'react'

interface Payout {
  id: string
  pool_id: string
  amount: number
  currency: string
  status: string
  payout_at: string
  disaster_event_id: string
}

export default function PayoutTracker({ poolId }: { poolId: string }) {
  const [payouts, setPayouts] = useState<Payout[]>([])

  useEffect(() => {
    const load = () =>
      fetch(`/api/analytics/payout-stats?poolId=${poolId}`)
        .then(r => r.json())
        .then(setPayouts)
        .catch(() => {})
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [poolId])

  if (payouts.length === 0)
    return <div className="text-gray-500 text-sm text-center py-8">No payouts yet</div>

  return (
    <div className="space-y-2">
      {payouts.map((p) => (
        <div key={p.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-3">
          <div>
            <div className="text-sm font-medium text-green-400">{p.currency} {Number(p.amount).toFixed(2)}</div>
            <div className="text-xs text-gray-500">{new Date(p.payout_at).toLocaleString()}</div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            p.status === 'completed' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
            p.status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
            'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
          }`}>{p.status}</span>
        </div>
      ))}
    </div>
  )
}
```

---

### Task 7.2: DisasterTriggerAlert + ManualTrigger

**Files:**
- Create: `safepool/components/DisasterTriggerAlert.tsx`

```typescript
// components/DisasterTriggerAlert.tsx
'use client'
import { useState } from 'react'

export default function DisasterTriggerAlert({ poolId }: { poolId?: string }) {
  const [loading, setLoading] = useState(false)
  const [triggered, setTriggered] = useState(false)

  async function triggerDemo() {
    setLoading(true)
    const res = await fetch('/api/disasters/manual-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disaster_type: 'earthquake',
        magnitude: 6.5,
        severity: 'high',
        location_name: 'Metro Manila, Philippines',
        location_lat: 14.5995,
        location_lon: 120.9842,
      }),
    })
    if (res.ok) {
      setTriggered(true)
      // Immediately run process-payouts
      await fetch('/api/cron/process-payouts', {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? 'changeme'}` },
      }).catch(() => {})
    }
    setLoading(false)
  }

  if (triggered) return (
    <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-5 flex items-start gap-4">
      <span className="text-3xl animate-pulse">🚨</span>
      <div>
        <div className="text-red-400 font-bold text-lg">Disaster Triggered!</div>
        <div className="text-gray-400 text-sm">M6.5 earthquake near Metro Manila. ILP payouts are being processed...</div>
      </div>
    </div>
  )

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <h3 className="font-semibold mb-2">Demo: Simulate Disaster</h3>
      <p className="text-gray-400 text-sm mb-4">Trigger a M6.5 earthquake near Metro Manila to demonstrate the automated payout flow.</p>
      <button
        onClick={triggerDemo}
        disabled={loading}
        className="bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Triggering...' : '🚨 Simulate Earthquake M6.5'}
      </button>
    </div>
  )
}
```

---

### Task 7.3: Governance page

**Files:**
- Create: `safepool/app/pools/[id]/governance/page.tsx`

```typescript
// app/pools/[id]/governance/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function GovernancePage() {
  const params = useParams()
  const poolId = params.id as string
  const [proposals, setProposals] = useState<any[]>([])
  const [form, setForm] = useState({ title: '', description: '', change_type: 'trigger_rules', new_value: '' })
  const [loading, setLoading] = useState(false)

  const loadProposals = () =>
    fetch(`/api/governance/proposals/${poolId}`).then(r => r.json()).then(setProposals).catch(() => {})

  useEffect(() => { loadProposals() }, [poolId])

  async function propose() {
    setLoading(true)
    await fetch('/api/governance/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, pool_id: poolId, proposed_by: 'guest' }),
    })
    setForm({ title: '', description: '', change_type: 'trigger_rules', new_value: '' })
    await loadProposals()
    setLoading(false)
  }

  async function castVote(proposalId: string, vote: string) {
    await fetch('/api/governance/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: proposalId, pool_id: poolId, member_id: 'guest', vote }),
    })
    await loadProposals()
  }

  const input = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500/50 focus:outline-none text-sm"

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href={`/pools/${poolId}`} className="text-gray-500 text-sm hover:text-gray-300 mb-6 block">← Back to Pool</Link>
      <h1 className="text-2xl font-bold mb-6">Governance</h1>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-8">
        <h2 className="font-semibold mb-4">New Proposal</h2>
        <div className="space-y-3">
          <input className={input} placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <textarea className={`${input} h-20 resize-none`} placeholder="Describe the change..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <select className={input} value={form.change_type} onChange={e => setForm(f => ({ ...f, change_type: e.target.value }))}>
              <option value="trigger_rules">Trigger Rules</option>
              <option value="distribution_model">Distribution Model</option>
              <option value="payout_cap">Payout Cap</option>
              <option value="contribution_amount">Contribution Amount</option>
            </select>
            <input className={input} placeholder="New value (JSON or number)" value={form.new_value} onChange={e => setForm(f => ({ ...f, new_value: e.target.value }))} />
          </div>
          <button onClick={propose} disabled={loading || !form.title}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold px-5 py-2 rounded-lg text-sm transition-colors">
            {loading ? 'Submitting...' : 'Submit Proposal'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {proposals.map((p: any) => (
          <div key={p.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold">{p.title}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                p.status === 'open' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                p.status === 'passed' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>{p.status}</span>
            </div>
            <p className="text-gray-400 text-sm mb-3">{p.description}</p>
            {p.status === 'open' && (
              <div className="flex gap-2">
                {['yes', 'no', 'abstain'].map(v => (
                  <button key={v} onClick={() => castVote(p.id, v)}
                    className="px-3 py-1 rounded text-xs border border-white/10 hover:border-white/30 text-gray-400 hover:text-white transition-colors capitalize">
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {proposals.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-8">No proposals yet.</div>
        )}
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add components/PayoutTracker.tsx components/DisasterTriggerAlert.tsx app/pools/[id]/governance/page.tsx
git commit -m "feat: add PayoutTracker, DisasterTriggerAlert, governance page"
```

---

### Task 7.4: Profile page

**Files:**
- Create: `safepool/app/profile/page.tsx`

```typescript
// app/profile/page.tsx
'use client'
import Link from 'next/link'

export default function ProfilePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-8">Profile</h1>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center text-2xl">👤</div>
          <div>
            <div className="font-semibold text-lg">Demo User</div>
            <div className="text-gray-400 text-sm">maria@demo.com</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/30 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-green-400">3</div>
            <div className="text-gray-500 text-xs">Pools Joined</div>
          </div>
          <div className="bg-black/30 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-green-400">$60.00</div>
            <div className="text-gray-500 text-xs">Total Contributed</div>
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-3">Wallet Address</h2>
        <div className="bg-black/30 rounded-lg px-4 py-3 font-mono text-sm text-green-400 break-all">
          https://wallet.interledger-test.dev/demo-user-1
        </div>
        <p className="text-gray-500 text-xs mt-2">Your Open Payments wallet address for receiving emergency payouts.</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h2 className="font-semibold mb-3">Demo Accounts</h2>
        <div className="space-y-2 text-sm">
          {['maria@demo.com', 'jose@demo.com', 'ana@demo.com', 'pedro@demo.com', 'luz@demo.com'].map(email => (
            <div key={email} className="flex justify-between text-gray-400 py-1 border-b border-white/5">
              <span>{email}</span>
              <span className="text-green-400">demo</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add app/profile/page.tsx
git commit -m "feat: add profile page"
```

---

## Phase 8 — Final Touches

### Task 8.1: Members page for pool

**Files:**
- Create: `safepool/app/pools/[id]/members/page.tsx`

```typescript
// app/pools/[id]/members/page.tsx
import Link from 'next/link'

async function getMembers(poolId: string) {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/members/${poolId}`, { cache: 'no-store' })
    return res.json()
  } catch { return [] }
}

export default async function MembersPage({ params }: { params: { id: string } }) {
  const members = await getMembers(params.id)
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href={`/pools/${params.id}`} className="text-gray-500 text-sm hover:text-gray-300 mb-6 block">← Back to Pool</Link>
      <h1 className="text-2xl font-bold mb-6">Pool Members ({members.length})</h1>
      <div className="space-y-3">
        {members.map((m: any, i: number) => (
          <div key={m.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 font-bold">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate font-mono text-sm text-green-400">{m.wallet_address}</div>
              <div className="text-gray-500 text-xs mt-0.5">
                {m.location_lat.toFixed(2)}, {m.location_lon.toFixed(2)} · Household: {m.household_size}
              </div>
            </div>
            <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">Active</span>
          </div>
        ))}
        {members.length === 0 && (
          <div className="text-center py-12 text-gray-500">No members yet.</div>
        )}
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add app/pools/[id]/members/page.tsx
git commit -m "feat: add pool members list page"
```

---

### Task 8.2: Add login page (NextAuth)

**Files:**
- Create: `safepool/app/login/page.tsx`

```typescript
// app/login/page.tsx
'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await signIn('credentials', { email, callbackUrl: '/dashboard' })
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🌐</div>
          <h1 className="text-2xl font-bold">Sign in to SafePool</h1>
          <p className="text-gray-400 text-sm mt-1">Use a demo email to get started</p>
        </div>
        <form onSubmit={login} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:border-green-500/50 focus:outline-none"
              placeholder="maria@demo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold py-2.5 rounded-lg transition-colors">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="mt-4 p-3 bg-white/5 rounded-lg">
          <p className="text-gray-500 text-xs text-center">Demo accounts: maria@demo.com, jose@demo.com, ana@demo.com</p>
        </div>
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add app/login/page.tsx
git commit -m "feat: add login page"
```

---

### Task 8.3: Add SessionProvider wrapper

**Files:**
- Create: `safepool/components/Providers.tsx`
- Modify: `safepool/app/layout.tsx`

```typescript
// components/Providers.tsx
'use client'
import { SessionProvider } from 'next-auth/react'

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
```

In `app/layout.tsx`, wrap `<body>` children with `<Providers>`:
```typescript
// Add import:
import Providers from '@/components/Providers'

// Wrap inside body:
<Providers>
  <NasdaqTicker />
  <Navbar />
  <main>{children}</main>
</Providers>
```

**Commit:**
```bash
git add components/Providers.tsx app/layout.tsx
git commit -m "feat: add NextAuth SessionProvider"
```

---

### Task 8.4: Add demo Simulate Disaster button to pool detail

In `app/pools/[id]/page.tsx`, add at the bottom before the closing `</div>`:

```typescript
// Add import at top
import DisasterTriggerAlert from '@/components/DisasterTriggerAlert'

// Add before closing </div>:
<div className="mt-6">
  <DisasterTriggerAlert poolId={params.id} />
</div>
```

**Commit:**
```bash
git add app/pools/[id]/page.tsx
git commit -m "feat: add demo disaster trigger to pool detail page"
```

---

## Quick Checklist

Before calling it done, verify every page loads without crash:

```bash
npm run dev

# Visit these URLs:
# http://localhost:3000              → 3D globe + NASDAQ ticker
# http://localhost:3000/pools        → Pool list
# http://localhost:3000/pools/create → Create form
# http://localhost:3000/disasters    → Map + feed
# http://localhost:3000/analytics    → Charts
# http://localhost:3000/dashboard    → Dashboard
# http://localhost:3000/profile      → Profile
```

**Final commit:**
```bash
git add .
git commit -m "feat: complete SafePool frontend — all pages + components"
git push
```
