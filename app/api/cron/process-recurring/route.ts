export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { insertRows, toClickHouseDateTime } from '@/lib/clickhouse'
import { pollOutgoingPaymentCompletion, processRecurringContribution } from '@/lib/open-payments'
import { decryptSecret } from '@/lib/secret-crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

interface RecurringRow {
  [key: string]: unknown
  id: string
  member_id: string
  pool_id: string
  member_wallet_address: string
  amount: number
  currency: string
  donor_name: string | null
  is_anonymous: boolean | null
  interval: 'P1D' | 'P1W' | 'P1M'
  access_token: string
}

function addIntervalDate(from: Date, interval: 'P1D' | 'P1W' | 'P1M'): Date {
  const next = new Date(from)
  if (interval === 'P1D') {
    next.setDate(next.getDate() + 1)
    return next
  }
  if (interval === 'P1W') {
    next.setDate(next.getDate() + 7)
    return next
  }
  next.setMonth(next.getMonth() + 1)
  return next
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createSupabaseAdminClient()
    const { data: recurringRowsData, error: recurringRowsError } = await admin
      .from('recurring_contributions')
      .select('id,member_id,pool_id,member_wallet_address,amount,currency,donor_name,is_anonymous,interval,access_token')
      .eq('status', 'active')
      .lte('next_payment_date', new Date().toISOString())
      .order('next_payment_date', { ascending: true })
      .limit(100)

    if (recurringRowsError) {
      return NextResponse.json({ error: `Failed to load due recurring contributions: ${recurringRowsError.message}` }, { status: 500 })
    }

    const recurringRows = recurringRowsData as RecurringRow[]

    let processed = 0
    let completed = 0
    let failed = 0

    for (const recurring of recurringRows) {
      processed += 1

      try {
        const contributionId = crypto.randomUUID()
        const payout = await processRecurringContribution({
          memberWalletAddress: recurring.member_wallet_address,
          amount: Number(recurring.amount),
          currency: recurring.currency,
          accessToken: decryptSecret(recurring.access_token),
          metadata: {
            recurringId: recurring.id,
            memberId: recurring.member_id,
            poolId: recurring.pool_id,
          },
        })

        const finalStatus = payout.status === 'processing'
          ? await pollOutgoingPaymentCompletion({ paymentId: payout.outgoingPaymentId })
          : { paymentId: payout.outgoingPaymentId, state: payout.status, debitAmount: Number(recurring.amount) }

        await admin.from('payment_status_cache').upsert({
          payment_id: payout.outgoingPaymentId,
          payment_type: 'outgoing',
          state: finalStatus.state,
          received_amount: Number(recurring.amount),
          last_checked: new Date().toISOString(),
        }, { onConflict: 'payment_id' })

        if (finalStatus.state !== 'completed') {
          const retryAt = new Date(Date.now() + 5 * 60 * 1000)
          await admin
            .from('recurring_contributions')
            .update({
              next_payment_date: retryAt.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', recurring.id)

          failed += 1
          continue
        }

        const { error: contributionInsertError } = await admin
          .from('contributions')
          .insert({
            id: contributionId,
            pool_id: recurring.pool_id,
            member_id: recurring.member_id,
            amount: Number(recurring.amount),
            currency: recurring.currency,
            incoming_payment_id: payout.outgoingPaymentId,
            donor_name: recurring.donor_name ?? 'SafePool Member',
            is_anonymous: Boolean(recurring.is_anonymous),
            contributed_at: new Date().toISOString(),
            status: 'completed',
          })

        if (contributionInsertError) {
          throw new Error(`Failed to persist recurring contribution: ${contributionInsertError.message}`)
        }

        await insertRows('contributions', [{
          id: contributionId,
          pool_id: recurring.pool_id,
          member_id: recurring.member_id,
          amount: Number(recurring.amount),
          currency: recurring.currency,
          incoming_payment_id: payout.outgoingPaymentId,
          contributed_at: toClickHouseDateTime(new Date()),
          status: 'completed',
        }])

        const nextPaymentDate = addIntervalDate(new Date(), recurring.interval)
        const { error: recurringUpdateError } = await admin
          .from('recurring_contributions')
          .update({
            next_payment_date: nextPaymentDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', recurring.id)

        if (recurringUpdateError) {
          throw new Error(`Failed to update next recurring payment date: ${recurringUpdateError.message}`)
        }

        completed += 1
      } catch (err) {
        console.error('Recurring contribution processing failed', recurring.id, err)
        failed += 1
      }
    }

    return NextResponse.json({
      processed,
      completed,
      failed,
    })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
