import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { createIncomingPayment } from '@/lib/open-payments'
import { insertRows, queryRows } from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

interface ContributeRequest {
  amount: number
  currency: string
}

export async function POST(req: NextRequest) {
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

    const body = await req.json() as ContributeRequest

    if (!body.currency || typeof body.amount !== 'number' || body.amount <= 0) {
      return NextResponse.json({ error: 'currency and a positive amount are required' }, { status: 400 })
    }

    const members = await queryRows<{ id: string }>(
      `
      SELECT toString(id) AS id
      FROM members
      WHERE pool_id = toUUID({pool_id:String})
        AND user_id = toUUID({user_id:String})
        AND is_active = 1
      ORDER BY joined_at DESC
      LIMIT 1
      `,
      {
        pool_id: GLOBAL_POOL_ID,
        user_id: user.id,
      }
    )

    if (members.length === 0) {
      return NextResponse.json({ error: 'Join SafePool first before contributing' }, { status: 400 })
    }

    // Create ILP incoming payment (falls back to demo mode if not configured)
    const payment = await createIncomingPayment({
      poolId: GLOBAL_POOL_ID,
      amount: body.amount,
      currency: body.currency,
    })

    const contributionId = crypto.randomUUID()
    await insertRows('pending_contributions', [{
        id: contributionId,
        pool_id: GLOBAL_POOL_ID,
        member_id: members[0].id,
        amount: body.amount,
        currency: body.currency,
        incoming_payment_id: payment.incomingPaymentId ?? payment.paymentUrl ?? '',
      }])

    return NextResponse.json({
      contribution_id: contributionId,
      paymentUrl: payment.paymentUrl,
      mode: payment.mode,
    }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
