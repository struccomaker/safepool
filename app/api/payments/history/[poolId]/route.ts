import { NextResponse } from 'next/server'
import { queryRows } from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

export async function GET(_req: Request, context: { params: Promise<{ poolId: string }> }) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await syncSupabaseUserToClickHouse(user)

    const { poolId } = await context.params
    const isAll = poolId === 'all'
    const pool_id = isAll ? GLOBAL_POOL_ID : poolId

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
        ? `
           SELECT
             toString(c.id) AS id,
             toString(c.pool_id) AS pool_id,
             toString(c.member_id) AS member_id,
             c.amount,
             c.currency,
             c.incoming_payment_id,
             c.contributed_at,
             c.status
           FROM contributions c
           ANY INNER JOIN (
             SELECT id
             FROM members
             WHERE user_id = toUUID({user_id:String})
               AND is_active = 1
           ) m ON c.member_id = m.id
           ORDER BY c.contributed_at DESC
           LIMIT 100
           `
        : `
           SELECT
             toString(c.id) AS id,
             toString(c.pool_id) AS pool_id,
             toString(c.member_id) AS member_id,
             c.amount,
             c.currency,
             c.incoming_payment_id,
             c.contributed_at,
             c.status
           FROM contributions c
           ANY INNER JOIN (
             SELECT id
             FROM members
             WHERE user_id = toUUID({user_id:String})
               AND pool_id = toUUID({pool_id:String})
               AND is_active = 1
           ) m ON c.member_id = m.id
           WHERE c.pool_id = toUUID({pool_id:String})
           ORDER BY c.contributed_at DESC
           LIMIT 100
           `,
      isAll ? { user_id: user.id } : { user_id: user.id, pool_id }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
