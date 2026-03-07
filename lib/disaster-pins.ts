/**
 * Single source of truth for all demo disaster locations.
 * Both GlobeScene (3D) and CountryDrilldownMap (2D) import from here
 * so epicentre positions are guaranteed to be identical.
 *
 * Coordinates verified against real city centres:
 *   Manila    14.5995°N 120.9842°E
 *   Jakarta    6.2088°S 106.8456°E
 *   Kathmandu 27.7172°N  85.3240°E
 *   Bangkok   13.7563°N 100.5018°E
 */

export interface DisasterPin {
  id: string
  label: string
  location: string
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
  /** ISO-3166-1 alpha-2 country code (e.g., 'PH', 'ID', 'NP', 'TH') */
  countryCode: string
  /** Human-readable disaster category shown in sidebar */
  eventType: string
  /** Severity label shown in sidebar (e.g. 'M6.5', 'Severe', 'Category 2') */
  severity: string
  /** Data source shown in sidebar (e.g. 'USGS', 'GDACS', 'OWM') */
  source: string
  /** Current alert status shown in sidebar */
  status: 'Triggered' | 'Monitoring' | 'Resolved'
}

export const DISASTER_PINS: DisasterPin[] = [
  {
    id: 'manila-eq',
    label: 'M6.5 Earthquake',
    location: 'Manila, Philippines',
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
    countryCode: 'PH',
    eventType: 'Earthquake',
    severity: 'M6.5',
    source: 'USGS',
    status: 'Triggered',
  },
  {
    id: 'jakarta-flood',
    label: 'Severe Flood',
    location: 'Jakarta, Indonesia',
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
    countryCode: 'ID',
    eventType: 'Flood',
    severity: 'Severe',
    source: 'GDACS',
    status: 'Monitoring',
  },
  {
    id: 'kathmandu-eq',
    label: 'M5.8 Earthquake',
    location: 'Kathmandu, Nepal',
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
    countryCode: 'NP',
    eventType: 'Earthquake',
    severity: 'M5.8',
    source: 'USGS',
    status: 'Monitoring',
  },
  {
    id: 'bangkok-flood',
    label: 'Flood Warning',
    location: 'Bangkok, Thailand',
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
    countryCode: 'TH',
    eventType: 'Flood',
    severity: 'Warning',
    source: 'GDACS',
    status: 'Monitoring',
  },
]

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
