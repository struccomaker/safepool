export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { insertRows, queryRows, toClickHouseDateTime } from '@/lib/clickhouse'
import { sendContributionEmail } from '@/lib/email'
import { pollIncomingPaymentCompletion } from '@/lib/open-payments'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

interface ConfirmBody {
  contribution_id: string
  member_email?: string
}

interface GrantSessionPayload {
  incomingPaymentId?: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

    const body = await req.json() as ConfirmBody

    if (!body.contribution_id) {
      return NextResponse.json({ error: 'contribution_id required' }, { status: 400 })
    }

    if (!UUID_REGEX.test(body.contribution_id)) {
      return NextResponse.json({ error: 'Invalid contribution_id' }, { status: 400 })
    }

    const completedRows = await queryRows<{ id: string }>(
      `
      SELECT toString(c.id) AS id
      FROM contributions c
      ANY INNER JOIN members m ON c.member_id = m.id
      WHERE c.id = toUUID({id:String})
        AND m.user_id = toUUID({user_id:String})
        AND m.is_active = 1
      LIMIT 1
      `,
      {
        id: body.contribution_id,
        user_id: user.id,
      }
    )

    if (completedRows.length > 0) {
      return NextResponse.json({ id: body.contribution_id }, { status: 200 })
    }

    // Look up the pending contribution
    const rows = await queryRows<{
      id: string
      pool_id: string
      member_id: string
      amount: number
      currency: string
      incoming_payment_id: string
    }>(
      `
       SELECT
         toString(pc.id) AS id,
         toString(pc.pool_id) AS pool_id,
         toString(pc.member_id) AS member_id,
         pc.amount,
         pc.currency,
         pc.incoming_payment_id
       FROM pending_contributions pc
       ANY INNER JOIN members m ON pc.member_id = m.id
       WHERE pc.id = toUUID({id:String})
         AND m.user_id = toUUID({user_id:String})
         AND m.is_active = 1
       LIMIT 1
       `,
      {
        id: body.contribution_id,
        user_id: user.id,
      }
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Contribution not found' }, { status: 404 })
    }
    const contribution = rows[0]

    let incomingPaymentId = contribution.incoming_payment_id

    if (!incomingPaymentId) {
      const grantSessions = await queryRows<{
        payload_json: string
      }>(
        `
        SELECT payload_json
        FROM payment_grant_sessions
        WHERE flow = 'incoming'
          AND reference_id = toUUID({reference_id:String})
          AND status = 'completed'
        ORDER BY updated_at DESC
        LIMIT 1
        `,
        { reference_id: contribution.id }
      )

      if (grantSessions.length > 0) {
        try {
          const payload = JSON.parse(grantSessions[0].payload_json) as GrantSessionPayload
          incomingPaymentId = payload.incomingPaymentId ?? ''
        } catch {
          incomingPaymentId = ''
        }
      }
    }

    if (!incomingPaymentId) {
      return NextResponse.json({
        error: 'Payment interaction is not completed yet. Finish wallet authorization first.',
      }, { status: 409 })
    }

    const paymentStatus = await pollIncomingPaymentCompletion({
      paymentId: incomingPaymentId,
      expectedAmount: Number(contribution.amount),
    })

    if (paymentStatus.state !== 'completed' || paymentStatus.receivedAmount < Number(contribution.amount)) {
      return NextResponse.json({
        error: 'Incoming payment is still pending. Try confirming again in a moment.',
      }, { status: 409 })
    }

    await insertRows('contributions', [{
      id: contribution.id,
      pool_id: contribution.pool_id,
      member_id: contribution.member_id,
      amount: contribution.amount,
      currency: contribution.currency,
      incoming_payment_id: incomingPaymentId,
      contributed_at: toClickHouseDateTime(new Date()),
      status: 'completed',
    }])

    // Send confirmation email (non-blocking)
    if (body.member_email) {
      sendContributionEmail({
        to: body.member_email,
        amount: Number(contribution.amount),
        currency: contribution.currency,
        poolId: contribution.pool_id,
      }).catch(console.error)
    }

    return NextResponse.json({ id: body.contribution_id }, { status: 200 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
