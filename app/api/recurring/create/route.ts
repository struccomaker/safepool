export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createRecurringContributionGrant } from '@/lib/open-payments'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'
import { isValidWalletAddress } from '@/lib/wallet-address'
import { encryptSecret } from '@/lib/secret-crypto'

interface CreateRecurringBody {
  amount?: number
  currency?: string
  interval?: 'P1D' | 'P1W' | 'P1M'
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

    const body = (await req.json()) as CreateRecurringBody
    const amount = Number(body.amount)
    const currency = body.currency ?? 'USD'
    const interval = body.interval ?? 'P1M'

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }

    if (!['P1D', 'P1W', 'P1M'].includes(interval)) {
      return NextResponse.json({ error: 'interval must be one of P1D, P1W, P1M' }, { status: 400 })
    }

    const { data: members, error: membersError } = await admin
      .from('members')
      .select('id,wallet_address')
      .eq('pool_id', GLOBAL_POOL_ID)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: false })
      .limit(1)

    if (membersError) {
      return NextResponse.json({ error: `Failed to load member profile: ${membersError.message}` }, { status: 500 })
    }

    if (members.length === 0) {
      return NextResponse.json({ error: 'Join SafePool first before creating recurring contributions' }, { status: 400 })
    }

    const memberWalletAddress = members[0].wallet_address
    if (!isValidWalletAddress(memberWalletAddress)) {
      return NextResponse.json({ error: 'Your wallet address is invalid. Update it at /api/wallet/me' }, { status: 400 })
    }

    const recurringId = crypto.randomUUID()

    const grant = await createRecurringContributionGrant({
      recurringId,
      memberWalletAddress,
      amount,
      currency,
      interval,
    })

    if (grant.mode === 'interaction_required') {
      const { error: grantInsertError } = await admin
        .from('payment_grant_sessions')
        .insert({
          id: crypto.randomUUID(),
          flow: 'recurring',
          reference_id: recurringId,
          continue_uri: grant.continueUri,
          continue_access_token: encryptSecret(grant.continueAccessToken),
          finish_nonce: grant.finishNonce,
          payload_json: JSON.stringify({
            member_id: members[0].id,
            pool_id: GLOBAL_POOL_ID,
            member_wallet_address: memberWalletAddress,
            amount,
            currency,
            interval,
          }),
          status: 'pending',
        })

      if (grantInsertError) {
        return NextResponse.json({ error: `Failed to persist recurring grant session: ${grantInsertError.message}` }, { status: 500 })
      }

      return NextResponse.json({
        recurring_id: recurringId,
        mode: 'interaction_required',
        redirectUrl: grant.redirectUrl,
      }, { status: 201 })
    }

    const { error: recurringInsertError } = await admin
      .from('recurring_contributions')
      .insert({
        id: recurringId,
        member_id: members[0].id,
        pool_id: GLOBAL_POOL_ID,
        member_wallet_address: memberWalletAddress,
        amount,
        currency,
        interval,
        next_payment_date: addIntervalDate(new Date(), interval).toISOString(),
        access_token: encryptSecret(grant.accessToken),
        manage_uri: encryptSecret(grant.manageUri),
        status: 'active',
        updated_at: new Date().toISOString(),
      })

    if (recurringInsertError) {
      return NextResponse.json({ error: `Failed to persist recurring contribution setup: ${recurringInsertError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      recurring_id: recurringId,
      mode: 'ready',
      status: 'active',
    }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = formatOpenPaymentsError(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
