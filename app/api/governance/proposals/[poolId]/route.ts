export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET(_req: Request, context: { params: Promise<{ poolId: string }> }) {
  try {
    const { poolId } = await context.params

    const result = await client.query({
      query: `
        SELECT id, pool_id, proposed_by, title, description,
               change_type, new_value, created_at, voting_ends_at, status
        FROM proposals
        WHERE pool_id = {pool_id:String}
        ORDER BY created_at DESC
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
