export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { insertRows, queryRows, runCommand, toClickHouseDateTime } from '@/lib/clickhouse'
import { pollOutgoingPaymentCompletion, processRecurringContribution } from '@/lib/open-payments'
import { decryptSecret } from '@/lib/secret-crypto'

interface RecurringRow {
  [key: string]: unknown
  id: string
  member_id: string
  pool_id: string
  member_wallet_address: string
  amount: number
  currency: string
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
    const recurringRows = await queryRows<RecurringRow>(
      `
      SELECT
        toString(id) AS id,
        toString(member_id) AS member_id,
        toString(pool_id) AS pool_id,
        member_wallet_address,
        amount,
        currency,
        interval,
        access_token
      FROM recurring_contributions
      WHERE status = 'active'
        AND next_payment_date <= now()
      ORDER BY next_payment_date ASC
      LIMIT 100
      `
    )

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

        await insertRows('payment_status_cache', [{
          payment_id: payout.outgoingPaymentId,
          payment_type: 'outgoing',
          state: finalStatus.state,
          received_amount: Number(recurring.amount),
        }])

        if (finalStatus.state !== 'completed') {
          const retryAt = new Date(Date.now() + 5 * 60 * 1000)
          await runCommand(
            `
            ALTER TABLE recurring_contributions
            UPDATE
              next_payment_date = parseDateTimeBestEffort({next_payment_date:String}),
              updated_at = now()
            WHERE id = toUUID({id:String})
            `,
            {
              next_payment_date: toClickHouseDateTime(retryAt),
              id: recurring.id,
            }
          )

          failed += 1
          continue
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
        await runCommand(
          `
          ALTER TABLE recurring_contributions
          UPDATE
            next_payment_date = parseDateTimeBestEffort({next_payment_date:String}),
            updated_at = now()
          WHERE id = toUUID({id:String})
          `,
          {
            next_payment_date: toClickHouseDateTime(nextPaymentDate),
            id: recurring.id,
          }
        )

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
