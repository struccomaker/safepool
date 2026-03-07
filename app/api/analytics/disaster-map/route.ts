import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET() {
  try {
    const result = await client.query({
      query: `
        SELECT grid_lat, grid_lon, disaster_type,
               sum(event_count) AS event_count,
               max(max_magnitude) AS max_magnitude
        FROM disaster_heatmap
        GROUP BY grid_lat, grid_lon, disaster_type
        ORDER BY event_count DESC
        LIMIT 500
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
