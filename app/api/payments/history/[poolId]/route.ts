import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET(_req: Request, { params }: { params: Promise<{ poolId: string }> }) {
  try {
    const { poolId } = await params
    const isAll = poolId === 'all'

    const result = await client.query({
      query: isAll
        ? `SELECT id, pool_id, member_id, amount, currency, incoming_payment_id, contributed_at, status
           FROM contributions
           ORDER BY contributed_at DESC
           LIMIT 100`
        : `SELECT id, pool_id, member_id, amount, currency, incoming_payment_id, contributed_at, status
           FROM contributions
           WHERE pool_id = {pool_id:String}
           ORDER BY contributed_at DESC
           LIMIT 100`,
      query_params: isAll ? {} : { pool_id: poolId },
      format: 'JSONEachRow',
    })
    const data = await result.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
