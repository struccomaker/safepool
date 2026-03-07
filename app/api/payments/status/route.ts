export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { insertRows, queryRows } from '@/lib/clickhouse'
import { getIncomingPaymentStatus, getOutgoingPaymentStatus } from '@/lib/open-payments'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

interface StatusBody {
  contribution_id?: string
  payout_id?: string
}

export async function POST(req: Request) {
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

    const body = (await req.json()) as StatusBody
    const contributionId = body.contribution_id ?? ''
    const payoutId = body.payout_id ?? ''

    if ((contributionId ? 1 : 0) + (payoutId ? 1 : 0) !== 1) {
      return NextResponse.json({ error: 'Provide exactly one of contribution_id or payout_id' }, { status: 400 })
    }

    if (contributionId) {
      const contributionRows = await queryRows<{ incoming_payment_id: string }>(
        `
        SELECT c.incoming_payment_id
        FROM contributions c
        ANY INNER JOIN members m ON c.member_id = m.id
        WHERE c.id = toUUID({id:String})
          AND m.user_id = toUUID({user_id:String})
        LIMIT 1
        `,
        {
          id: contributionId,
          user_id: user.id,
        }
      )

      if (contributionRows.length === 0 || !contributionRows[0].incoming_payment_id) {
        const pendingRows = await queryRows<{ incoming_payment_id: string }>(
          `
          SELECT pc.incoming_payment_id
          FROM pending_contributions pc
          ANY INNER JOIN members m ON pc.member_id = m.id
          WHERE pc.id = toUUID({id:String})
            AND m.user_id = toUUID({user_id:String})
          LIMIT 1
          `,
          {
            id: contributionId,
            user_id: user.id,
          }
        )

        if (pendingRows.length === 0 || !pendingRows[0].incoming_payment_id) {
          return NextResponse.json({ error: 'Contribution payment is not available yet' }, { status: 404 })
        }

        const pendingStatus = await getIncomingPaymentStatus(pendingRows[0].incoming_payment_id)
        await insertRows('payment_status_cache', [{
          payment_id: pendingStatus.paymentId,
          payment_type: 'incoming',
          state: pendingStatus.state,
          received_amount: pendingStatus.receivedAmount,
        }])

        return NextResponse.json(pendingStatus)
      }

      const status = await getIncomingPaymentStatus(contributionRows[0].incoming_payment_id)
      await insertRows('payment_status_cache', [{
        payment_id: status.paymentId,
        payment_type: 'incoming',
        state: status.state,
        received_amount: status.receivedAmount,
      }])
      return NextResponse.json(status)
    }

    const payoutRows = await queryRows<{ outgoing_payment_id: string }>(
      `
      SELECT p.outgoing_payment_id
      FROM payouts p
      ANY INNER JOIN members m ON p.member_id = m.id
      WHERE p.id = toUUID({id:String})
        AND m.user_id = toUUID({user_id:String})
      LIMIT 1
      `,
      {
        id: payoutId,
        user_id: user.id,
      }
    )

    if (payoutRows.length === 0 || !payoutRows[0].outgoing_payment_id) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    const status = await getOutgoingPaymentStatus(payoutRows[0].outgoing_payment_id)
    await insertRows('payment_status_cache', [{
      payment_id: status.paymentId,
      payment_type: 'outgoing',
      state: status.state,
      received_amount: status.debitAmount,
    }])
    return NextResponse.json(status)
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
