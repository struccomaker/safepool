# Fix Zoom Logic for Disaster Countries Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When clicking a country with disasters (like Thailand), the globe zooms to the closest disaster epicenter instead of the country's geometric center.

**Architecture:** Add country-to-disaster mapping in `disaster-pins.ts`, then modify `GlobeScene.tsx` to detect disasters for the clicked country and calculate the nearest epicenter to the current point of view. Zoom to that epicenter using the existing globe navigation API.

**Tech Stack:** TypeScript, react-globe.gl, Haversine distance formula for great-circle distance

---

## Task 1: Add country-code mapping to disaster pins

**Files:**
- Modify: `lib/disaster-pins.ts`
- Test: Manual verification in `components/GlobeScene.tsx`

**Step 1: Add country code to each DisasterPin**

In `lib/disaster-pins.ts`, update the `DisasterPin` interface to include a `countryCode` property:

```typescript
export interface DisasterPin {
  id: string
  label: string
  location: string
  /** Country ISO-3166-1 alpha-2 code (e.g., 'TH' for Thailand) */
  countryCode: string
  /** Geographic centre — [longitude, latitude] (GeoJSON order) */
  coords: [number, number]
  /** Dot / ring colour used in both 3D and 2D views */
  dotColor: string
  /**
   * 2D concentric ring definitions: [radiusDeg, fill, fillOpacity, strokeOpacity]
   * radiusDeg is approximate: 0.09° ≈ 10 km at the equator.
   */
  rings2d: [number, string, number, number][]
  /** 3D globe ring settings */
  ring3d: { maxR: number; propagationSpeed: number; repeatPeriod: number }
  /** 3D globe point dot size */
  pointSize: number
}
```

**Step 2: Update DISASTER_PINS with country codes**

Update each disaster pin object to include the `countryCode`:

```typescript
export const DISASTER_PINS: DisasterPin[] = [
  {
    id: 'manila-eq',
    label: 'M6.5 Earthquake',
    location: 'Manila, Philippines',
    countryCode: 'PH',
    coords: [120.98, 14.60],
    dotColor: '#ef4444',
    rings2d: [
      [0.22, '#ef4444', 0.04, 0.18],
      [0.13, '#dc2626', 0.08, 0.24],
      [0.06, '#b91c1c', 0.14, 0.32],
      [0.02, '#fca5a5', 0.24, 0.45],
    ],
    ring3d: { maxR: 4, propagationSpeed: 1.5, repeatPeriod: 900 },
    pointSize: 0.4,
  },
  {
    id: 'jakarta-flood',
    label: 'Severe Flood',
    location: 'Jakarta, Indonesia',
    countryCode: 'ID',
    coords: [106.85, -6.21],
    dotColor: '#f97316',
    rings2d: [
      [0.25, '#f97316', 0.04, 0.16],
      [0.15, '#ea580c', 0.07, 0.22],
      [0.07, '#c2410c', 0.12, 0.30],
      [0.02, '#fed7aa', 0.22, 0.42],
    ],
    ring3d: { maxR: 3, propagationSpeed: 1.2, repeatPeriod: 1100 },
    pointSize: 0.3,
  },
  {
    id: 'kathmandu-eq',
    label: 'M5.8 Earthquake',
    location: 'Kathmandu, Nepal',
    countryCode: 'NP',
    coords: [85.32, 27.72],
    dotColor: '#f59e0b',
    rings2d: [
      [0.18, '#f59e0b', 0.04, 0.16],
      [0.10, '#d97706', 0.08, 0.22],
      [0.05, '#b45309', 0.14, 0.30],
      [0.02, '#fde68a', 0.22, 0.40],
    ],
    ring3d: { maxR: 2.5, propagationSpeed: 1, repeatPeriod: 1300 },
    pointSize: 0.25,
  },
  {
    id: 'bangkok-flood',
    label: 'Flood Warning',
    location: 'Bangkok, Thailand',
    countryCode: 'TH',
    coords: [100.50, 13.76],
    dotColor: '#ef4444',
    rings2d: [
      [0.20, '#ef4444', 0.04, 0.16],
      [0.12, '#dc2626', 0.07, 0.22],
      [0.06, '#b91c1c', 0.12, 0.28],
      [0.02, '#fca5a5', 0.20, 0.40],
    ],
    ring3d: { maxR: 3, propagationSpeed: 1.3, repeatPeriod: 1000 },
    pointSize: 0.3,
  },
]
```

**Step 3: Add country-to-disasters mapping function**

At the end of `lib/disaster-pins.ts`, add this helper function:

```typescript
/**
 * Creates a map of country codes to their disaster pins.
 * Used to look up disasters when a country is clicked.
 */
export function getDisastersByCountry(): Map<string, DisasterPin[]> {
  const map = new Map<string, DisasterPin[]>()

  for (const pin of DISASTER_PINS) {
    const pins = map.get(pin.countryCode) ?? []
    pins.push(pin)
    map.set(pin.countryCode, pins)
  }

  return map
}
```

**Step 4: Verify country codes are set**

Run TypeScript compiler to ensure no type errors:

```bash
npm run build
```

Expected: No TypeScript errors related to DisasterPin properties.

**Step 5: Commit**

```bash
git add lib/disaster-pins.ts
git commit -m "feat: add country code mapping to disaster pins"
```

---

## Task 2: Add Haversine distance helper function

**Files:**
- Modify: `components/GlobeScene.tsx` (add helper function)

**Step 1: Add Haversine distance function**

Add this function before the `GlobeScene` component definition (after the imports, around line 100):

```typescript
/**
 * Calculate great-circle distance between two points on Earth using Haversine formula.
 * Returns distance in kilometers.
 */
function getDistanceBetweenCoords(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.asin(Math.sqrt(a))
  return R * c
}
```

**Step 2: Verify the function is accessible**

The function uses the existing `toRadians()` helper (line 197), so no additional imports needed.

**Step 3: Add import for getDisastersByCountry**

At the top of `GlobeScene.tsx`, update the import from disaster-pins:

```typescript
import { DISASTER_PINS, getDisastersByCountry } from '@/lib/disaster-pins'
```

**Step 4: Test by checking no TypeScript errors**

```bash
npm run build
```

Expected: No errors about missing functions or imports.

**Step 5: Commit**

```bash
git add components/GlobeScene.tsx
git commit -m "feat: add Haversine distance calculation for disaster proximity"
```

---

## Task 3: Modify handlePolygonClick to zoom to nearest disaster epicenter

**Files:**
- Modify: `components/GlobeScene.tsx` (lines 663-686, `handlePolygonClick` function)

**Step 1: Replace handlePolygonClick implementation**

Replace the entire `handlePolygonClick` function with this updated version:

```typescript
const handlePolygonClick = (polygon: object) => {
  const feature = polygon as CountryFeature
  const code = getCountryCode(feature)
  const name = getCountryName(feature)

  setSelectedCountryCode(code)

  if (globeRef.current) {
    const controls = globeRef.current.controls()
    controls.autoRotate = false

    // Try to find the nearest disaster epicenter for this country
    const disastersByCountry = getDisastersByCountry()
    const disastersInCountry = disastersByCountry.get(code)

    let targetLat = getFeatureCenter(feature).lat
    let targetLng = getFeatureCenter(feature).lng

    if (disastersInCountry && disastersInCountry.length > 0) {
      // Get current POV to calculate distance from viewer
      const currentPov = globeRef.current.pointOfView()

      // Find the closest disaster epicenter
      let closestDisaster = disastersInCountry[0]
      let closestDistance = getDistanceBetweenCoords(
        currentPov.lat,
        currentPov.lng,
        closestDisaster.coords[1], // latitude
        closestDisaster.coords[0]  // longitude
      )

      for (let i = 1; i < disastersInCountry.length; i++) {
        const disaster = disastersInCountry[i]
        const distance = getDistanceBetweenCoords(
          currentPov.lat,
          currentPov.lng,
          disaster.coords[1], // latitude
          disaster.coords[0]  // longitude
        )

        if (distance < closestDistance) {
          closestDistance = distance
          closestDisaster = disaster
        }
      }

      // Use the epicenter coordinates instead of country center
      targetLat = closestDisaster.coords[1]
      targetLng = closestDisaster.coords[0]
    }

    globeRef.current.pointOfView({ lat: targetLat, lng: targetLng, altitude: 0.78 }, 900)
  }

  if (!onCountryDrilldown) return

  if (drilldownTimerRef.current !== null) {
    window.clearTimeout(drilldownTimerRef.current)
  }

  drilldownTimerRef.current = window.setTimeout(() => {
    onCountryDrilldown({ code, name, center: { lat: getFeatureCenter(feature).lat, lng: getFeatureCenter(feature).lng } })
  }, 700)
}
```

**Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: No TypeScript errors about coordinates, types, or function signatures.

**Step 3: Test in browser**

Open http://localhost:3000 in the browser:
1. Click on Thailand
2. Verify the globe zooms to Bangkok (approximately 13.76°N, 100.50°E) instead of the country center
3. Verify the zoom animation completes in ~900ms
4. Verify the Disaster Updates panel on the left still shows "Flood Warning - Bangkok, Thailand"

**Step 4: Commit**

```bash
git add components/GlobeScene.tsx
git commit -m "fix: zoom to nearest disaster epicenter when clicking disaster countries"
```

---

## Task 4: Test with all disaster countries

**Files:**
- Test: Browser testing only

**Step 1: Test Philippines**

1. Click on Philippines
2. Verify it zooms to Manila (14.60°N, 120.98°E)
3. Check the M6.5 Earthquake pin is centered on screen

**Step 2: Test Indonesia**

1. Click on Indonesia
2. Verify it zooms to Jakarta (-6.21°S, 106.85°E)
3. Check the Severe Flood pin is centered on screen

**Step 3: Test Nepal**

1. Click on Nepal
2. Verify it zooms to Kathmandu (27.72°N, 85.32°E)
3. Check the M5.8 Earthquake pin is centered on screen

**Step 4: Test Thailand again from different POV**

1. Let the globe auto-rotate to change the point of view
2. Click on Thailand
3. Verify it still zooms to Bangkok regardless of the current POV (should use closest distance calculation)

**Step 5: Test non-disaster country (for regression)**

1. Click on a country without disasters (e.g., United States, Australia, etc.)
2. Verify it still zooms to the country's geometric center
3. Verify no errors in browser console

**Step 6: Commit test validation**

```bash
git add -A  # Nothing to add, but confirm no uncommitted changes
git status  # Should show "working tree clean"
```

Expected: Clean working tree (no changes from Task 4 since it's manual testing).

---

## Success Criteria

✅ Clicking Thailand zooms to Bangkok epicenter (13.76°N, 100.50°E)
✅ Clicking other disaster countries (PH, ID, NP) zooms to their respective epicenters
✅ Non-disaster countries still zoom to geometric center
✅ TypeScript builds with no errors
✅ Browser console shows no errors
✅ All tests pass: `npm run build`
