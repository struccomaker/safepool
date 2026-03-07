import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'

export async function GET() {
  try {
    const result = await client.query({
      query: `
        SELECT id, pool_id, member_id, amount, currency,
               incoming_payment_id, contributed_at, status
        FROM contributions
        WHERE pool_id = {pool_id:String}
        ORDER BY contributed_at DESC
        LIMIT 100
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
