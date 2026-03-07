export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { queryRows } from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

export async function GET() {
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
      `
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
      {
        user_id: user.id,
        pool_id: GLOBAL_POOL_ID,
      }
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
