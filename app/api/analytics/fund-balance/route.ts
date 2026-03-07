export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'

export async function GET() {
  try {
    const result = await client.query({
      query: `
        SELECT pool_id, month, sum(total_in) AS total_in, sum(contribution_count) AS contribution_count
        FROM pool_balances
        WHERE pool_id = {pool_id:String}
        GROUP BY pool_id, month
        ORDER BY month DESC
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
