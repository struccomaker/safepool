export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createRecurringContributionGrant } from '@/lib/open-payments'
import { insertRows, queryRows, toClickHouseDateTime } from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'
import { isValidWalletAddress } from '@/lib/wallet-address'
import { encryptSecret } from '@/lib/secret-crypto'

interface CreateRecurringBody {
  amount?: number
  currency?: string
  interval?: 'P1D' | 'P1W' | 'P1M'
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

    const members = await queryRows<{ id: string; wallet_address: string }>(
      `
      SELECT toString(id) AS id, wallet_address
      FROM members
      WHERE pool_id = toUUID({pool_id:String})
        AND user_id = toUUID({user_id:String})
        AND is_active = 1
      ORDER BY joined_at DESC
      LIMIT 1
      `,
      {
        pool_id: GLOBAL_POOL_ID,
        user_id: user.id,
      }
    )

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
      await insertRows('payment_grant_sessions', [{
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
      }])

      return NextResponse.json({
        recurring_id: recurringId,
        mode: 'interaction_required',
        redirectUrl: grant.redirectUrl,
      }, { status: 201 })
    }

    await insertRows('recurring_contributions', [{
      id: recurringId,
      member_id: members[0].id,
      pool_id: GLOBAL_POOL_ID,
      member_wallet_address: memberWalletAddress,
      amount,
      currency,
      interval,
      next_payment_date: toClickHouseDateTime(addIntervalDate(new Date(), interval)),
      access_token: encryptSecret(grant.accessToken),
      manage_uri: grant.manageUri,
      status: 'active',
      updated_at: toClickHouseDateTime(new Date()),
    }])

    return NextResponse.json({
      recurring_id: recurringId,
      mode: 'ready',
      status: 'active',
    }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
