import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET() {
  try {
    const result = await client.query({
      query: `
        SELECT id, source, external_id, disaster_type, magnitude, severity,
               location_name, location_lat, location_lon, occurred_at, processed
        FROM disaster_events
        ORDER BY occurred_at DESC
        LIMIT 50
      `,
      format: 'JSONEachRow',
    })
    const data = await result.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
