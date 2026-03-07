import { NextResponse } from 'next/server'
import { queryRows } from '@/lib/clickhouse'

export async function GET() {
  try {
    const data = await queryRows(`
      SELECT
        d.id,
        d.source,
        d.external_id,
        d.disaster_type,
        d.magnitude,
        d.severity,
        d.location_name,
        d.location_lat,
        d.location_lon,
        d.occurred_at,
        if(dep.latest_status = 'completed', 1, 0) AS processed
      FROM disaster_events d
      LEFT JOIN (
        SELECT event_id, toString(argMax(status, processed_at)) AS latest_status
        FROM disaster_event_processing
        GROUP BY event_id
      ) dep ON d.id = dep.event_id
      ORDER BY d.occurred_at DESC
      LIMIT 50
    `)

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
