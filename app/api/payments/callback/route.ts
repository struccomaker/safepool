export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  continueOneTimeContributionAuthorization,
  continueOutgoingPayment,
  continueRecurringContributionGrant,
  formatOpenPaymentsError,
  pollOutgoingPaymentCompletion,
} from '@/lib/open-payments'
import { insertRows, queryRows, runCommand, toClickHouseDateTime } from '@/lib/clickhouse'
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto'

type CallbackFlow = 'incoming' | 'outgoing' | 'recurring'

interface StoredGrantSession {
  [key: string]: unknown
  id: string
  flow: CallbackFlow
  continue_uri: string
  continue_access_token: string
  finish_nonce: string
  payload_json: string
  status?: 'pending' | 'completed' | 'failed' | 'expired'
}

interface IncomingPayload {
  amount: number
  currency: string
  pool_id: string
  member_id: string
  member_wallet_address: string
  incoming_payment_id: string
  quote_id: string
}

interface OutgoingPayload {
  recipientWalletAddress: string
  amount: number
  currency: string
  poolId: string
  disasterId: string
  memberId: string
}

interface RecurringPayload {
  member_id: string
  pool_id: string
  member_wallet_address: string
  amount: number
  currency: string
  interval: string
}

function addIntervalDate(from: Date, interval: string): Date {
  const next = new Date(from)
  switch (interval) {
    case 'P1D':
      next.setDate(next.getDate() + 1)
      return next
    case 'P1W':
      next.setDate(next.getDate() + 7)
      return next
    case 'P1M':
      next.setMonth(next.getMonth() + 1)
      return next
    default:
      throw new Error('Unsupported recurring interval. Supported values: P1D, P1W, P1M')
  }
}

function redirectTo(req: Request, path: string, state: string, referenceId: string): NextResponse {
  const url = new URL(path, req.url)
  url.searchParams.set('payment_state', state)
  url.searchParams.set('reference_id', referenceId)
  return NextResponse.redirect(url)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const flow = url.searchParams.get('flow') as CallbackFlow | null
  const interactRef = url.searchParams.get('interact_ref')
  const result = url.searchParams.get('result')

  const referenceId =
    flow === 'incoming'
      ? url.searchParams.get('contribution_id')
      : flow === 'outgoing'
        ? url.searchParams.get('payout_id')
        : url.searchParams.get('recurring_id')

  if (!flow || !referenceId) {
    return NextResponse.json({ error: 'Missing required callback parameters' }, { status: 400 })
  }

  if (result === 'grant_rejected') {
    return redirectTo(req, '/profile', 'grant_rejected', referenceId)
  }

  if (!interactRef) {
    return NextResponse.json({ error: 'Missing interact_ref callback parameter' }, { status: 400 })
  }

  try {
    const sessions = await queryRows<StoredGrantSession>(
      `
      SELECT
        toString(id) AS id,
        flow,
        continue_uri,
        continue_access_token,
        finish_nonce,
        payload_json
      FROM payment_grant_sessions
      WHERE flow = {flow:String}
        AND reference_id = toUUID({reference_id:String})
        AND status = 'pending'
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      {
        flow,
        reference_id: referenceId,
      }
    )

    if (sessions.length === 0) {
      return NextResponse.json({ error: 'No pending payment session found' }, { status: 404 })
    }

    const session = sessions[0]

    const payload = JSON.parse(session.payload_json) as IncomingPayload | OutgoingPayload | RecurringPayload

    if (flow === 'incoming') {
      const incomingPayload = payload as IncomingPayload

      if (!incomingPayload.quote_id) {
        return NextResponse.json({ error: 'Missing quote_id for one-time payment continuation' }, { status: 400 })
      }

      const continued = await continueOneTimeContributionAuthorization({
        memberWalletAddress: incomingPayload.member_wallet_address,
        quoteId: incomingPayload.quote_id,
        continueGrant: {
          continueUri: session.continue_uri,
          continueAccessToken: decryptSecret(session.continue_access_token),
        },
        interactRef,
      })

      await insertRows('payment_grant_sessions', [{
        id: session.id,
        flow,
        reference_id: referenceId,
        continue_uri: session.continue_uri,
        continue_access_token: session.continue_access_token,
        finish_nonce: session.finish_nonce,
        payload_json: JSON.stringify({
          ...incomingPayload,
          outgoingPaymentId: continued.outgoingPaymentId,
        }),
        status: 'completed',
        error_message: '',
        updated_at: toClickHouseDateTime(new Date()),
      }])

      return redirectTo(req, '/profile', 'interaction_completed', referenceId)
    }

    if (flow === 'outgoing') {
      const outgoingPayload = payload as OutgoingPayload
      const continued = await continueOutgoingPayment({
        recipientWalletAddress: outgoingPayload.recipientWalletAddress,
        amount: Number(outgoingPayload.amount),
        currency: outgoingPayload.currency,
        metadata: {
          payoutId: referenceId,
          poolId: outgoingPayload.poolId,
          disasterId: outgoingPayload.disasterId,
          memberId: outgoingPayload.memberId,
        },
        continueGrant: {
          continueUri: session.continue_uri,
          continueAccessToken: decryptSecret(session.continue_access_token),
        },
        interactRef,
      })

      const finalStatus = continued.status === 'processing'
        ? await pollOutgoingPaymentCompletion({ paymentId: continued.outgoingPaymentId })
        : { paymentId: continued.outgoingPaymentId, state: continued.status, debitAmount: 0 }

      await insertRows('payment_grant_sessions', [{
        id: session.id,
        flow,
        reference_id: referenceId,
        continue_uri: session.continue_uri,
        continue_access_token: session.continue_access_token,
        finish_nonce: session.finish_nonce,
        payload_json: JSON.stringify({
          ...outgoingPayload,
          outgoingPaymentId: continued.outgoingPaymentId,
          payoutState: finalStatus.state,
        }),
        status: 'completed',
        error_message: '',
        updated_at: toClickHouseDateTime(new Date()),
      }])

      await runCommand(
        `
        ALTER TABLE payouts
        UPDATE
          outgoing_payment_id = {outgoing_payment_id:String},
          status = {status:String},
          failure_reason = {failure_reason:String}
        WHERE id = toUUID({id:String})
        `,
        {
          outgoing_payment_id: continued.outgoingPaymentId,
          status: finalStatus.state === 'pending' ? 'processing' : finalStatus.state,
          failure_reason: finalStatus.state === 'failed' ? 'Outgoing payment failed after interaction' : '',
          id: referenceId,
        }
      )

      return redirectTo(req, '/dashboard', finalStatus.state, referenceId)
    }

    const recurringPayload = payload as RecurringPayload
    const finalized = await continueRecurringContributionGrant({
      continueGrant: {
        continueUri: session.continue_uri,
        continueAccessToken: decryptSecret(session.continue_access_token),
      },
      interactRef,
    })

    await insertRows('recurring_contributions', [{
      id: referenceId,
      member_id: recurringPayload.member_id,
      pool_id: recurringPayload.pool_id,
      member_wallet_address: recurringPayload.member_wallet_address,
      amount: Number(recurringPayload.amount),
      currency: recurringPayload.currency,
      interval: recurringPayload.interval,
      next_payment_date: toClickHouseDateTime(addIntervalDate(new Date(), recurringPayload.interval)),
      access_token: encryptSecret(finalized.accessToken),
      manage_uri: encryptSecret(finalized.manageUri),
      status: 'active',
      updated_at: toClickHouseDateTime(new Date()),
    }])

    await insertRows('payment_grant_sessions', [{
      id: session.id,
      flow,
      reference_id: referenceId,
      continue_uri: session.continue_uri,
      continue_access_token: session.continue_access_token,
      finish_nonce: session.finish_nonce,
      payload_json: session.payload_json,
      status: 'completed',
      error_message: '',
      updated_at: toClickHouseDateTime(new Date()),
    }])

    return redirectTo(req, '/profile', 'recurring_active', referenceId)
  } catch (err: unknown) {
    console.error(err)

    try {
      if (flow && referenceId) {
        const sessions = await queryRows<StoredGrantSession>(
          `
          SELECT
            toString(id) AS id,
            flow,
            continue_uri,
            continue_access_token,
            finish_nonce,
            payload_json,
            status
          FROM payment_grant_sessions
          WHERE flow = {flow:String}
            AND reference_id = toUUID({reference_id:String})
          ORDER BY updated_at DESC
          LIMIT 1
          `,
          {
            flow,
            reference_id: referenceId,
          }
        )

        if (sessions.length > 0) {
          const session = sessions[0]
          if (session.status !== 'pending') {
            const message = err instanceof Error ? err.message : 'Callback continuation failed'
            return NextResponse.json({ error: message }, { status: 500 })
          }

          const message = err instanceof Error ? err.message : 'Callback continuation failed'
          await insertRows('payment_grant_sessions', [{
            id: session.id,
            flow: session.flow,
            reference_id: referenceId,
            continue_uri: session.continue_uri,
            continue_access_token: session.continue_access_token,
            finish_nonce: session.finish_nonce,
            payload_json: session.payload_json,
            status: 'failed',
            error_message: message,
            updated_at: toClickHouseDateTime(new Date()),
          }])
        }
      }
    } catch (nestedErr) {
      console.error('Failed to persist callback failure state', nestedErr)
    }

    const message = formatOpenPaymentsError(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
