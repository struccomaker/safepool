import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await client.query({
      query: `
        SELECT id, name, description, created_by, distribution_model,
               contribution_frequency, contribution_amount, currency,
               trigger_rules, governance_rules, payout_cap, created_at, is_active
        FROM pools
        WHERE id = {id:String} AND is_active = 1
        LIMIT 1
      `,
      query_params: { id: params.id },
      format: 'JSONEachRow',
    })
    const rows = (await result.json()) as unknown[]
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
