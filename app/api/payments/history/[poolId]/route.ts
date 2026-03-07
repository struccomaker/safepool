import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'

export async function GET(_req: Request, context: { params: Promise<{ poolId: string }> }) {
  try {
    const { poolId } = await context.params
    // 'all' returns full history; any other value is treated as the global pool
    const pool_id = poolId === 'all' ? GLOBAL_POOL_ID : poolId

    const result = await client.query({
      query: `
        SELECT id, pool_id, member_id, amount, currency,
               incoming_payment_id, contributed_at, status
        FROM contributions
        WHERE pool_id = {pool_id:String}
        ORDER BY contributed_at DESC
        LIMIT 100
      `,
      query_params: { pool_id },
      format: 'JSONEachRow',
    })
    const data = await result.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
