import client, { insertRows } from '@/lib/clickhouse'
import { createOutgoingPayment, pollOutgoingPaymentCompletion } from '@/lib/open-payments'
import { encryptSecret } from '@/lib/secret-crypto'
import type { Pool, Member, DisasterEvent } from '@/types'

const SEVERITY_MULTIPLIER: Record<string, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1.0,
}

interface ProcessPayoutsOptions {
  pool: Pool
  disaster: DisasterEvent
  affectedMembers: Member[]
  totalFunds: number
}

/** Calculate per-member payout using the pool's distribution model */
function calculatePerMemberPayouts(
  pool: Pool,
  disaster: DisasterEvent,
  affectedMembers: Member[],
  totalFunds: number
): Map<string, number> {
  const payouts = new Map<string, number>()

  switch (pool.distribution_model) {
    case 'equal_split': {
      const share = totalFunds / affectedMembers.length
      for (const m of affectedMembers) payouts.set(m.id, share)
      break
    }
    case 'severity_based': {
      const multiplier = SEVERITY_MULTIPLIER[disaster.severity] ?? 0.5
      const share = (totalFunds * multiplier) / affectedMembers.length
      for (const m of affectedMembers) payouts.set(m.id, share)
      break
    }
    case 'household_size': {
      const totalUnits = affectedMembers.reduce((s, m) => s + m.household_size, 0)
      for (const m of affectedMembers) {
        payouts.set(m.id, (m.household_size / totalUnits) * totalFunds)
      }
      break
    }
    case 'capped': {
      const share = Math.min(totalFunds / affectedMembers.length, pool.payout_cap)
      for (const m of affectedMembers) payouts.set(m.id, share)
      break
    }
  }

  return payouts
}

/**
 * Send ILP payouts to all affected members and record in ClickHouse.
 * Returns the number of successful payouts.
 */
export async function processPayouts({
  pool,
  disaster,
  affectedMembers,
  totalFunds,
}: ProcessPayoutsOptions): Promise<number> {
  const perMemberPayouts = calculatePerMemberPayouts(pool, disaster, affectedMembers, totalFunds)

  const payoutRows = []
  let successCount = 0

  for (const member of affectedMembers) {
    const amount = perMemberPayouts.get(member.id) ?? 0
    if (amount <= 0) continue

    const payoutId = crypto.randomUUID()

    try {
      const result = await createOutgoingPayment({
        recipientWalletAddress: member.wallet_address,
        amount,
        currency: pool.currency,
        metadata: {
          payoutId,
          poolId: pool.id,
          disasterId: disaster.id,
          memberId: member.id,
        },
      })

      if (result.needsInteraction) {
        await insertRows('payment_grant_sessions', [{
          id: crypto.randomUUID(),
          flow: 'outgoing',
          reference_id: payoutId,
          continue_uri: result.continueUri,
          continue_access_token: encryptSecret(result.continueAccessToken),
          finish_nonce: result.finishNonce,
          payload_json: JSON.stringify({
            recipientWalletAddress: member.wallet_address,
            amount,
            currency: pool.currency,
            poolId: pool.id,
            disasterId: disaster.id,
            memberId: member.id,
          }),
          status: 'pending',
        }])

        payoutRows.push({
          id: payoutId,
          pool_id: pool.id,
          disaster_event_id: disaster.id,
          member_id: member.id,
          amount,
          currency: pool.currency,
          outgoing_payment_id: result.outgoingPaymentId,
          distribution_rule: pool.distribution_model,
          status: 'pending',
          failure_reason: 'Payout requires wallet authorization interaction',
        })
        continue
      }

      let finalStatus = result.status
      let failureReason = ''

      if (result.status === 'processing') {
        const polled = await pollOutgoingPaymentCompletion({ paymentId: result.outgoingPaymentId })
        finalStatus = polled.state === 'pending' ? 'processing' : polled.state
      }

      if (finalStatus === 'failed') {
        failureReason = 'Outgoing payment failed'
      }

      payoutRows.push({
        id: payoutId,
        pool_id: pool.id,
        disaster_event_id: disaster.id,
        member_id: member.id,
        amount,
        currency: pool.currency,
        outgoing_payment_id: result.outgoingPaymentId,
        distribution_rule: pool.distribution_model,
        status: finalStatus,
        failure_reason: failureReason,
      })

      if (finalStatus === 'completed') {
        successCount++
      }
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Unknown error'
      payoutRows.push({
        id: payoutId,
        pool_id: pool.id,
        disaster_event_id: disaster.id,
        member_id: member.id,
        amount,
        currency: pool.currency,
        outgoing_payment_id: '',
        distribution_rule: pool.distribution_model,
        status: 'failed',
        failure_reason: reason,
      })
    }
  }

  if (payoutRows.length > 0) {
    await client.insert({
      table: 'payouts',
      values: payoutRows,
      format: 'JSONEachRow',
    })
  }

  return successCount
}
