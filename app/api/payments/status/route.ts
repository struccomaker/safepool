export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getIncomingPaymentStatus, getOutgoingPaymentStatus } from '@/lib/open-payments'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
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
    const admin = createSupabaseAdminClient()

    const body = (await req.json()) as StatusBody
    const contributionId = body.contribution_id ?? ''
    const payoutId = body.payout_id ?? ''

    if ((contributionId ? 1 : 0) + (payoutId ? 1 : 0) !== 1) {
      return NextResponse.json({ error: 'Provide exactly one of contribution_id or payout_id' }, { status: 400 })
    }

    const { data: memberRows, error: memberError } = await admin
      .from('members')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (memberError) {
      return NextResponse.json({ error: `Failed to load member scope: ${memberError.message}` }, { status: 500 })
    }

    const memberIds = memberRows.map((row) => row.id)
    if (memberIds.length === 0) {
      return NextResponse.json({ error: 'Join SafePool first' }, { status: 400 })
    }

    if (contributionId) {
      const { data: contributionRows, error: contributionError } = await admin
        .from('contributions')
        .select('incoming_payment_id')
        .eq('id', contributionId)
        .in('member_id', memberIds)
        .limit(1)

      if (contributionError) {
        return NextResponse.json({ error: `Failed to read contribution payment status: ${contributionError.message}` }, { status: 500 })
      }

      if (contributionRows.length === 0 || !contributionRows[0].incoming_payment_id) {
        const { data: pendingRows, error: pendingError } = await admin
          .from('pending_contributions')
          .select('incoming_payment_id')
          .eq('id', contributionId)
          .in('member_id', memberIds)
          .limit(1)

        if (pendingError) {
          return NextResponse.json({ error: `Failed to read pending contribution payment status: ${pendingError.message}` }, { status: 500 })
        }

        if (pendingRows.length === 0 || !pendingRows[0].incoming_payment_id) {
          return NextResponse.json({ error: 'Contribution payment is not available yet' }, { status: 404 })
        }

        const pendingStatus = await getIncomingPaymentStatus(pendingRows[0].incoming_payment_id)
        await admin.from('payment_status_cache').upsert({
          payment_id: pendingStatus.paymentId,
          payment_type: 'incoming',
          state: pendingStatus.state,
          received_amount: pendingStatus.receivedAmount,
          last_checked: new Date().toISOString(),
        }, { onConflict: 'payment_id' })

        return NextResponse.json(pendingStatus)
      }

      const status = await getIncomingPaymentStatus(contributionRows[0].incoming_payment_id)
      await admin.from('payment_status_cache').upsert({
        payment_id: status.paymentId,
        payment_type: 'incoming',
        state: status.state,
        received_amount: status.receivedAmount,
        last_checked: new Date().toISOString(),
      }, { onConflict: 'payment_id' })
      return NextResponse.json(status)
    }

    const { data: payoutRows, error: payoutError } = await admin
      .from('payouts')
      .select('outgoing_payment_id')
      .eq('id', payoutId)
      .in('member_id', memberIds)
      .limit(1)

    if (payoutError) {
      return NextResponse.json({ error: `Failed to load payout payment status: ${payoutError.message}` }, { status: 500 })
    }

    if (payoutRows.length === 0 || !payoutRows[0].outgoing_payment_id) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    const status = await getOutgoingPaymentStatus(payoutRows[0].outgoing_payment_id)
    await admin.from('payment_status_cache').upsert({
      payment_id: status.paymentId,
      payment_type: 'outgoing',
      state: status.state,
      received_amount: status.debitAmount,
      last_checked: new Date().toISOString(),
    }, { onConflict: 'payment_id' })
    return NextResponse.json(status)
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
