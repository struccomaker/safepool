import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET(_req: Request, context: { params: Promise<{ poolId: string }> }) {
  try {
    const { poolId } = await context.params

    const result = await client.query({
      query: `
        SELECT id, pool_id, user_id, wallet_address,
               location_lat, location_lon, household_size, joined_at, is_active
        FROM members
        WHERE pool_id = {pool_id:String} AND is_active = 1
        ORDER BY joined_at ASC
      `,
      query_params: { pool_id: poolId },
      format: 'JSONEachRow',
    })
    const data = await result.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
