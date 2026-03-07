export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { insertRows, toClickHouseDateTime } from '@/lib/clickhouse'
import { sendContributionEmail } from '@/lib/email'
import { pollIncomingPaymentCompletion } from '@/lib/open-payments'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

interface ConfirmBody {
  contribution_id: string
  member_email?: string
}

interface GrantSessionPayload { incomingPaymentId?: string }

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
    const admin = createSupabaseAdminClient()

    const body = await req.json() as ConfirmBody

    if (!body.contribution_id) {
      return NextResponse.json({ error: 'contribution_id required' }, { status: 400 })
    }

    if (!UUID_REGEX.test(body.contribution_id)) {
      return NextResponse.json({ error: 'Invalid contribution_id' }, { status: 400 })
    }

    const { data: memberRows, error: membersError } = await admin
      .from('members')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (membersError) {
      return NextResponse.json({ error: `Failed to load member context: ${membersError.message}` }, { status: 500 })
    }

    const memberIds = memberRows.map((row) => row.id)
    if (memberIds.length === 0) {
      return NextResponse.json({ error: 'Join SafePool first before confirming payments' }, { status: 400 })
    }

    const { data: completedRows, error: completedError } = await admin
      .from('contributions')
      .select('id')
      .eq('id', body.contribution_id)
      .in('member_id', memberIds)
      .limit(1)

    if (completedError) {
      return NextResponse.json({ error: `Failed to load contribution status: ${completedError.message}` }, { status: 500 })
    }

    if (completedRows.length > 0) {
      return NextResponse.json({ id: body.contribution_id }, { status: 200 })
    }

    // Look up the pending contribution
    const { data: rows, error: pendingError } = await admin
      .from('pending_contributions')
      .select('id,pool_id,member_id,amount,currency,incoming_payment_id')
      .eq('id', body.contribution_id)
      .in('member_id', memberIds)
      .limit(1)

    if (pendingError) {
      return NextResponse.json({ error: `Failed to load pending contribution: ${pendingError.message}` }, { status: 500 })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Contribution not found' }, { status: 404 })
    }
    const contribution = rows[0] as {
      id: string
      pool_id: string
      member_id: string
      amount: number
      currency: string
      incoming_payment_id: string
    }

    let incomingPaymentId = contribution.incoming_payment_id

    if (!incomingPaymentId) {
      const { data: grantSessions, error: grantError } = await admin
        .from('payment_grant_sessions')
        .select('payload_json')
        .eq('flow', 'incoming')
        .eq('reference_id', contribution.id)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(1)

      if (grantError) {
        return NextResponse.json({ error: `Failed to load grant session: ${grantError.message}` }, { status: 500 })
      }

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

    const { error: insertContributionError } = await admin
      .from('contributions')
      .upsert({
        id: contribution.id,
        pool_id: contribution.pool_id,
        member_id: contribution.member_id,
        amount: contribution.amount,
        currency: contribution.currency,
        incoming_payment_id: incomingPaymentId,
        contributed_at: new Date().toISOString(),
        status: 'completed',
      }, { onConflict: 'id' })

    if (insertContributionError) {
      return NextResponse.json({ error: `Failed to persist confirmed contribution: ${insertContributionError.message}` }, { status: 500 })
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

    const { error: deletePendingError } = await admin
      .from('pending_contributions')
      .delete()
      .eq('id', contribution.id)

    if (deletePendingError) {
      return NextResponse.json({ error: `Failed to clear pending contribution: ${deletePendingError.message}` }, { status: 500 })
    }

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
