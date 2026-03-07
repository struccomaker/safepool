export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const poolId = searchParams.get('poolId')

    const result = await client.query({
      query: poolId
        ? `SELECT pool_id, month, sum(total_in) AS total_in, sum(contribution_count) AS contribution_count
           FROM pool_balances
           WHERE pool_id = {pool_id:String}
           GROUP BY pool_id, month
           ORDER BY month DESC`
        : `SELECT pool_id, sum(total_in) AS total_in, sum(contribution_count) AS contribution_count
           FROM pool_balances
           GROUP BY pool_id
           ORDER BY total_in DESC`,
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
