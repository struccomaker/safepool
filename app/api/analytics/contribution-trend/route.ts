export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const poolId = searchParams.get('poolId')

    const result = await client.query({
      query: poolId
        ? `SELECT toDate(contributed_at) AS date,
                  sum(amount) AS total,
                  count() AS count
           FROM contributions
           WHERE pool_id = {pool_id:String} AND status = 'completed'
           GROUP BY date
           ORDER BY date ASC
           LIMIT 90`
        : `SELECT toDate(contributed_at) AS date,
                  sum(amount) AS total,
                  count() AS count
           FROM contributions
           WHERE status = 'completed'
           GROUP BY date
           ORDER BY date ASC
           LIMIT 90`,
      query_params: poolId ? { pool_id: poolId } : {},
      format: 'JSONEachRow',
    })
    const data = await result.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
