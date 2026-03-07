import { NextResponse } from 'next/server'
import { queryRows } from '@/lib/clickhouse'

export async function GET(_req: Request, context: { params: Promise<{ poolId: string }> }) {
  try {
    const { poolId } = await context.params
    const isAll = poolId === 'all'

    const data = await queryRows<{
      id: string
      pool_id: string
      member_id: string
      amount: number
      currency: string
      incoming_payment_id: string
      contributed_at: string
      status: string
    }>(
      isAll
        ? `SELECT id, pool_id, member_id, amount, currency, incoming_payment_id, contributed_at, status
           FROM contributions
           UNION ALL
           SELECT id, pool_id, member_id, amount, currency, incoming_payment_id, created_at AS contributed_at, 'pending' AS status
           FROM pending_contributions
           WHERE id NOT IN (SELECT id FROM contributions)
           ORDER BY contributed_at DESC
           LIMIT 100`
        : `SELECT id, pool_id, member_id, amount, currency, incoming_payment_id, contributed_at, status
           FROM contributions
           WHERE pool_id = {pool_id:String}
           UNION ALL
           SELECT id, pool_id, member_id, amount, currency, incoming_payment_id, created_at AS contributed_at, 'pending' AS status
           FROM pending_contributions
           WHERE pool_id = {pool_id:String}
             AND id NOT IN (SELECT id FROM contributions)
           ORDER BY contributed_at DESC
           LIMIT 100`,
      isAll ? undefined : { pool_id: poolId }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
