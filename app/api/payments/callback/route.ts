export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  continueOneTimeContributionAuthorization,
  continueOutgoingPayment,
  continueRecurringContributionGrant,
  pollOutgoingPaymentCompletion,
} from '@/lib/open-payments'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto'
import { insertRows, toClickHouseDateTime } from '@/lib/clickhouse'

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
  donor_name?: string
  is_anonymous?: boolean
  donor_country?: string
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
  donor_name?: string
  is_anonymous?: boolean
  donor_country?: string
  mock_bootstrap?: boolean
}

interface PendingContributionRow {
  id: string
  pool_id: string
  member_id: string
  amount: number
  currency: string
  incoming_payment_id: string
  donor_name: string | null
  is_anonymous: boolean | null
  donor_country: string | null
}

interface OpenPaymentsErrorLike {
  message?: string
  description?: string
  status?: number
  code?: string
}

function formatOpenPaymentsError(err: unknown): string {
  if (typeof err !== 'object' || err === null) {
    return 'Internal error'
  }

  const e = err as OpenPaymentsErrorLike
  const parts = [
    e.message,
    e.description,
    typeof e.status === 'number' ? `status=${e.status}` : undefined,
    e.code ? `code=${e.code}` : undefined,
  ].filter((value): value is string => Boolean(value && value.trim().length > 0))

  if (parts.length === 0) {
    return 'Internal error'
  }

  return parts.join(' | ')
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

function redirectTo(
  req: Request,
  path: string,
  state: string,
  referenceId: string,
  extras?: Record<string, string>
): NextResponse {
  const url = new URL(path, req.url)
  url.searchParams.set('payment_state', state)
  url.searchParams.set('reference_id', referenceId)
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      url.searchParams.set(key, value)
    }
  }
  return NextResponse.redirect(url)
}

async function finalizeOneTimeContribution(contributionId: string): Promise<{
  state: 'completed' | 'pending'
  amount?: number
  currency?: string
}>
 {
  const admin = createSupabaseAdminClient()

  const { data: existingRows, error: existingError } = await admin
    .from('contributions')
    .select('id,amount,currency')
    .eq('id', contributionId)
    .limit(1)

  if (existingError) {
    throw new Error(`Failed to check confirmed contribution state: ${existingError.message}`)
  }

  if (existingRows.length > 0) {
    await admin
      .from('pending_contributions')
      .delete()
      .eq('id', contributionId)

    return {
      state: 'completed',
      amount: Number(existingRows[0].amount),
      currency: existingRows[0].currency,
    }
  }

  const { data: pendingRows, error: pendingError } = await admin
    .from('pending_contributions')
    .select('id,pool_id,member_id,amount,currency,incoming_payment_id,donor_name,is_anonymous,donor_country')
    .eq('id', contributionId)
    .limit(1)

  if (pendingError) {
    throw new Error(`Failed to load pending contribution: ${pendingError.message}`)
  }

  if (pendingRows.length === 0) {
    return { state: 'pending' }
  }

  const pending = pendingRows[0] as PendingContributionRow
  if (!pending.incoming_payment_id) {
    return { state: 'pending' }
  }

  const contributedAt = new Date().toISOString()
  const { error: contributionUpsertError } = await admin
    .from('contributions')
    .upsert({
      id: pending.id,
      pool_id: pending.pool_id,
      member_id: pending.member_id,
        amount: pending.amount,
        currency: pending.currency,
        incoming_payment_id: pending.incoming_payment_id,
        donor_name: pending.donor_name ?? 'SafePool Member',
        is_anonymous: Boolean(pending.is_anonymous),
        donor_country: typeof pending.donor_country === 'string' && pending.donor_country.trim().length === 2
          ? pending.donor_country.trim().toUpperCase()
          : 'SG',
        contributed_at: contributedAt,
        status: 'completed',
      }, { onConflict: 'id' })

  if (contributionUpsertError) {
    throw new Error(`Failed to finalize contribution: ${contributionUpsertError.message}`)
  }

  const { error: deletePendingError } = await admin
    .from('pending_contributions')
    .delete()
    .eq('id', pending.id)

  if (deletePendingError) {
    throw new Error(`Failed to clear pending contribution after finalization: ${deletePendingError.message}`)
  }

  try {
    await insertRows('contributions', [{
      id: pending.id,
      pool_id: pending.pool_id,
      member_id: pending.member_id,
      amount: pending.amount,
      currency: pending.currency,
      incoming_payment_id: pending.incoming_payment_id,
      contributed_at: toClickHouseDateTime(new Date(contributedAt)),
      status: 'completed',
    }])
  } catch (mirrorErr) {
    console.error('Non-blocking ClickHouse contribution mirror write failed during callback finalization', mirrorErr)
  }

  return {
    state: 'completed',
    amount: Number(pending.amount),
    currency: pending.currency,
  }
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
    return redirectTo(req, '/', 'grant_rejected', referenceId)
  }

  if (!interactRef) {
    return NextResponse.json({ error: 'Missing interact_ref callback parameter' }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdminClient()

    const { data: pendingSessions, error: pendingSessionError } = await admin
      .from('payment_grant_sessions')
      .select('id,flow,continue_uri,continue_access_token,finish_nonce,payload_json,status')
      .eq('flow', flow)
      .eq('reference_id', referenceId)
      .eq('status', 'pending')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (pendingSessionError) {
      return NextResponse.json({ error: `Failed to load payment session: ${pendingSessionError.message}` }, { status: 500 })
    }

    const sessions = pendingSessions as StoredGrantSession[]

    if (sessions.length === 0) {
      const { data: latestData, error: latestError } = await admin
        .from('payment_grant_sessions')
        .select('id,flow,continue_uri,continue_access_token,finish_nonce,payload_json,status')
        .eq('flow', flow)
        .eq('reference_id', referenceId)
        .order('updated_at', { ascending: false })
        .limit(1)

      if (latestError) {
        return NextResponse.json({ error: `Failed to load latest payment session: ${latestError.message}` }, { status: 500 })
      }

      const latest = (latestData as StoredGrantSession[])[0]
      if (!latest) {
        return NextResponse.json({ error: 'No pending payment session found' }, { status: 404 })
      }

      if (latest.status === 'completed') {
        if (flow === 'incoming') {
          const finalization = await finalizeOneTimeContribution(referenceId)
          if (finalization.state === 'completed') {
            return redirectTo(req, '/', 'payment_completed', referenceId, {
              amount: String(finalization.amount ?? ''),
              currency: finalization.currency ?? '',
            })
          }
          return redirectTo(req, '/', 'interaction_completed', referenceId)
        }

        if (flow === 'recurring') {
          return redirectTo(req, '/', 'recurring_active', referenceId)
        }

        return redirectTo(req, '/', 'completed', referenceId)
      }

      if (latest.status === 'failed') {
        return redirectTo(req, '/', 'failed', referenceId)
      }

      return redirectTo(req, '/', 'interaction_completed', referenceId)
    }

    const session = sessions[0]

    const claimToken = `processing:${crypto.randomUUID()}`
    const { data: claimRows, error: claimError } = await admin
      .from('payment_grant_sessions')
      .update({
        status: 'expired',
        error_message: claimToken,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .eq('status', 'pending')
      .select('id')

    if (claimError) {
      return NextResponse.json({ error: `Failed to lock payment session: ${claimError.message}` }, { status: 500 })
    }

    if (!claimRows || claimRows.length === 0) {
      return redirectTo(req, '/', 'interaction_completed', referenceId)
    }

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

      const { error: updateSessionError } = await admin
        .from('payment_grant_sessions')
        .update({
          payload_json: JSON.stringify({
            ...incomingPayload,
            outgoingPaymentId: continued.outgoingPaymentId,
          }),
          status: 'completed',
          error_message: '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      if (updateSessionError) {
        return NextResponse.json({ error: `Failed to persist incoming grant completion: ${updateSessionError.message}` }, { status: 500 })
      }

      try {
        const finalization = await finalizeOneTimeContribution(referenceId)

        if (finalization.state === 'completed') {
          return redirectTo(req, '/', 'payment_completed', referenceId, {
            amount: String(finalization.amount ?? ''),
            currency: finalization.currency ?? '',
          })
        }
      } catch (finalizationErr) {
        console.error('Non-blocking callback finalization failed, falling back to frontend confirmation', finalizationErr)
      }

      return redirectTo(req, '/', 'interaction_completed', referenceId)
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

      const { error: updateOutgoingSessionError } = await admin
        .from('payment_grant_sessions')
        .update({
          payload_json: JSON.stringify({
            ...outgoingPayload,
            outgoingPaymentId: continued.outgoingPaymentId,
            payoutState: finalStatus.state,
          }),
          status: 'completed',
          error_message: '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      if (updateOutgoingSessionError) {
        return NextResponse.json({ error: `Failed to persist outgoing grant completion: ${updateOutgoingSessionError.message}` }, { status: 500 })
      }

      const { error: payoutUpdateError } = await admin
        .from('payouts')
        .update({
          outgoing_payment_id: continued.outgoingPaymentId,
          status: finalStatus.state === 'pending' ? 'processing' : finalStatus.state,
          failure_reason: finalStatus.state === 'failed' ? 'Outgoing payment failed after interaction' : '',
        })
        .eq('id', referenceId)

      if (payoutUpdateError) {
        return NextResponse.json({ error: `Failed to update payout record: ${payoutUpdateError.message}` }, { status: 500 })
      }

      return redirectTo(req, '/', finalStatus.state, referenceId)
    }

    const recurringPayload = payload as RecurringPayload
    const finalized = await continueRecurringContributionGrant({
      continueGrant: {
        continueUri: session.continue_uri,
        continueAccessToken: decryptSecret(session.continue_access_token),
      },
      interactRef,
    })

    const { error: recurringInsertError } = await admin
      .from('recurring_contributions')
      .upsert({
        id: referenceId,
        member_id: recurringPayload.member_id,
        pool_id: recurringPayload.pool_id,
        member_wallet_address: recurringPayload.member_wallet_address,
        amount: Number(recurringPayload.amount),
        currency: recurringPayload.currency,
        donor_name: recurringPayload.donor_name ?? 'SafePool Member',
        is_anonymous: Boolean(recurringPayload.is_anonymous),
        donor_country: typeof recurringPayload.donor_country === 'string' && recurringPayload.donor_country.trim().length === 2
          ? recurringPayload.donor_country.trim().toUpperCase()
          : 'SG',
        interval: recurringPayload.interval,
        next_payment_date: addIntervalDate(new Date(), recurringPayload.interval).toISOString(),
        access_token: encryptSecret(finalized.accessToken),
        manage_uri: encryptSecret(finalized.manageUri),
        status: recurringPayload.mock_bootstrap ? 'paused' : 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (recurringInsertError) {
      return NextResponse.json({ error: `Failed to persist recurring contribution setup: ${recurringInsertError.message}` }, { status: 500 })
    }

    const { error: updateRecurringSessionError } = await admin
      .from('payment_grant_sessions')
      .update({
        status: 'completed',
        error_message: '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)

    if (updateRecurringSessionError) {
      return NextResponse.json({ error: `Failed to persist recurring grant completion: ${updateRecurringSessionError.message}` }, { status: 500 })
    }

    return redirectTo(req, '/', 'recurring_active', referenceId)
  } catch (err: unknown) {
    console.error(err)
    const admin = createSupabaseAdminClient()

    try {
      if (flow && referenceId) {
        const { data: sessionsData, error: sessionsError } = await admin
          .from('payment_grant_sessions')
          .select('id,flow,continue_uri,continue_access_token,finish_nonce,payload_json,status')
          .eq('flow', flow)
          .eq('reference_id', referenceId)
          .order('updated_at', { ascending: false })
          .limit(1)

        if (sessionsError) {
          throw new Error(`Failed to load payment session for error persistence: ${sessionsError.message}`)
        }

        const sessions = sessionsData as StoredGrantSession[]

        if (sessions.length > 0) {
          const session = sessions[0]
          if (session.status !== 'pending' && session.status !== 'expired') {
            const message = err instanceof Error ? err.message : 'Callback continuation failed'
            return NextResponse.json({ error: message }, { status: 500 })
          }

          const message = err instanceof Error ? err.message : 'Callback continuation failed'
          const { error: markFailedError } = await admin
            .from('payment_grant_sessions')
            .update({
              status: 'failed',
              error_message: message,
              updated_at: new Date().toISOString(),
            })
            .eq('id', session.id)

          if (markFailedError) {
            throw new Error(`Failed to persist callback failure state: ${markFailedError.message}`)
          }
        }
      }
    } catch (nestedErr) {
      console.error('Failed to persist callback failure state', nestedErr)
    }

    const message = formatOpenPaymentsError(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
