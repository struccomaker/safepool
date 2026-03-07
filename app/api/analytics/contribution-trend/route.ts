export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'

export async function GET() {
  try {
    const result = await client.query({
      query: `
        SELECT toDate(contributed_at) AS date,
               sum(amount) AS daily_total,
               count() AS count
        FROM contributions
        WHERE pool_id = {pool_id:String} AND status = 'completed'
        GROUP BY date
        ORDER BY date ASC
        LIMIT 90
      `,
      query_params: { pool_id: GLOBAL_POOL_ID },
      format: 'JSONEachRow',
    })
    const data = await result.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
