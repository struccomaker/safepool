import type { DisasterType, Severity } from '@/types'

interface RawDisasterEvent {
  id: string
  source: string
  external_id: string
  disaster_type: DisasterType
  magnitude: number
  severity: Severity
  location_name: string
  location_lat: number
  location_lon: number
  occurred_at: string
  raw_data: string
  processed: number
}

function magnitudeToSeverity(mag: number): Severity {
  if (mag >= 7) return 'critical'
  if (mag >= 6) return 'high'
  if (mag >= 5) return 'medium'
  return 'low'
}

/** Fetch recent earthquakes from USGS (no API key required) */
export async function fetchUSGSEarthquakes(): Promise<RawDisasterEvent[]> {
  const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=50&orderby=time'
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`USGS API error: ${res.status}`)

  const json = await res.json() as {
    features: Array<{
      id: string
      properties: { mag: number; place: string; time: number }
      geometry: { coordinates: [number, number, number] }
    }>
  }

  return json.features.map((f) => ({
    id: crypto.randomUUID(),
    source: 'usgs',
    external_id: f.id,
    disaster_type: 'earthquake' as DisasterType,
    magnitude: f.properties.mag,
    severity: magnitudeToSeverity(f.properties.mag),
    location_name: f.properties.place,
    location_lat: f.geometry.coordinates[1],
    location_lon: f.geometry.coordinates[0],
    occurred_at: new Date(f.properties.time).toISOString().replace('T', ' ').replace('Z', ''),
    raw_data: JSON.stringify(f),
    processed: 0,
  }))
}

/** Fetch recent alerts from GDACS RSS feed (UN disaster monitoring, no key required) */
export async function fetchGDACSEvents(): Promise<RawDisasterEvent[]> {
  const res = await fetch('https://www.gdacs.org/xml/rss.xml', { cache: 'no-store' })
  if (!res.ok) throw new Error(`GDACS API error: ${res.status}`)

  const text = await res.text()

  // Basic XML parsing for RSS items
  const items = text.match(/<item>[\s\S]*?<\/item>/g) ?? []

  const DISASTER_TYPE_MAP: Record<string, DisasterType> = {
    EQ: 'earthquake',
    FL: 'flood',
    TC: 'typhoon',
    VO: 'volcanic',
    TS: 'tsunami',
    WF: 'fire',
  }

  return items.slice(0, 20).map((item) => {
    const getTag = (tag: string) => item.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`))?.[1]?.trim() ?? ''
    const eventType = getTag('gdacs:eventtype') || 'EQ'
    const alertLevel = getTag('gdacs:alertlevel').toLowerCase() as Severity

    return {
      id: crypto.randomUUID(),
      source: 'gdacs',
      external_id: getTag('gdacs:eventid') || crypto.randomUUID(),
      disaster_type: (DISASTER_TYPE_MAP[eventType] ?? 'earthquake') as DisasterType,
      magnitude: parseFloat(getTag('gdacs:severity') || '0') || 0,
      severity: (['low', 'medium', 'high', 'critical'].includes(alertLevel) ? alertLevel : 'medium') as Severity,
      location_name: getTag('title'),
      location_lat: parseFloat(getTag('geo:lat') || '0'),
      location_lon: parseFloat(getTag('geo:long') || '0'),
      occurred_at: new Date(getTag('pubDate') || Date.now()).toISOString().replace('T', ' ').replace('Z', ''),
      raw_data: item,
      processed: 0,
    }
  })
}

/** Fetch severe weather events from OpenWeatherMap */
export async function fetchOWMEvents(): Promise<RawDisasterEvent[]> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY
  if (!apiKey) return []

  // Example: fetch alerts for high-risk areas (Philippines, Bangladesh, etc.)
  const hotspots = [
    { lat: 14.5995, lon: 120.9842, name: 'Metro Manila, Philippines' },
    { lat: 23.6850, lon: 90.3563, name: 'Dhaka, Bangladesh' },
    { lat: 16.8661, lon: 96.1951, name: 'Yangon, Myanmar' },
  ]

  const events: RawDisasterEvent[] = []

  for (const spot of hotspots) {
    try {
      const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${spot.lat}&lon=${spot.lon}&exclude=current,minutely,hourly,daily&appid=${apiKey}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue

      const data = await res.json() as { alerts?: Array<{ event: string; description: string; start: number; end: number }> }

      for (const alert of data.alerts ?? []) {
        events.push({
          id: crypto.randomUUID(),
          source: 'owm',
          external_id: `${spot.lat}-${spot.lon}-${alert.start}`,
          disaster_type: 'flood',
          magnitude: 0,
          severity: 'medium',
          location_name: spot.name,
          location_lat: spot.lat,
          location_lon: spot.lon,
          occurred_at: new Date(alert.start * 1000).toISOString().replace('T', ' ').replace('Z', ''),
          raw_data: JSON.stringify(alert),
          processed: 0,
        })
      }
    } catch {
      // Skip individual hotspot on error
    }
  }

  return events
}

/** Fetch from all sources, deduplicate by external_id */
export async function fetchAllDisasters(): Promise<RawDisasterEvent[]> {
  const [usgs, gdacs, owm] = await Promise.allSettled([
    fetchUSGSEarthquakes(),
    fetchGDACSEvents(),
    fetchOWMEvents(),
  ])

  const all: RawDisasterEvent[] = [
    ...(usgs.status === 'fulfilled' ? usgs.value : []),
    ...(gdacs.status === 'fulfilled' ? gdacs.value : []),
    ...(owm.status === 'fulfilled' ? owm.value : []),
  ]

  // Deduplicate by external_id
  const seen = new Set<string>()
  return all.filter((e) => {
    if (seen.has(e.external_id)) return false
    seen.add(e.external_id)
    return true
  })
}
