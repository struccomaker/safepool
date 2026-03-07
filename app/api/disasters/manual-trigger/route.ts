import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import client from '@/lib/clickhouse'
import { evaluateTriggers } from '@/lib/disaster-engine'
import type { ManualTriggerRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as ManualTriggerRequest

    // Insert synthetic disaster event
    const eventId = crypto.randomUUID()
    await client.insert({
      table: 'disaster_events',
      values: [{
        id: eventId,
        source: 'usgs',
        external_id: `manual-${eventId}`,
        disaster_type: body.disaster_type,
        magnitude: body.magnitude,
        severity: body.magnitude >= 7 ? 'critical' : body.magnitude >= 6 ? 'high' : 'medium',
        location_name: body.location_name,
        location_lat: body.location_lat,
        location_lon: body.location_lon,
        occurred_at: new Date().toISOString().replace('T', ' ').replace('Z', ''),
        raw_data: JSON.stringify(body),
        processed: 0,
      }],
      format: 'JSONEachRow',
    })

    // Immediately evaluate triggers for the specified pool
    if (body.pool_id) {
      await evaluateTriggers(eventId)
    }

    return NextResponse.json({ eventId })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
