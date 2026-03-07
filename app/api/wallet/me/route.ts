export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { insertRows, queryRows } from '@/lib/clickhouse'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getOrCreateUserWalletAddress, syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'
import { verifyWalletAddressRemotely } from '@/lib/wallet-address'

interface WalletUpdateBody {
  wallet_address?: string
}

async function getAuthContext() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  await syncSupabaseUserToClickHouse(user)
  return { supabase, user }
}

export async function GET() {
  try {
    const auth = await getAuthContext()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { user } = auth

    const walletAddress = await getOrCreateUserWalletAddress(user)

    const rows = await queryRows<{
      wallet_address: string
      provider: string
      status: string
      created_at: string
    }>(
      `
      SELECT wallet_address, provider, status, toString(created_at) AS created_at
      FROM user_wallets
      WHERE user_id = toUUID({user_id:String})
        AND wallet_address = {wallet_address:String}
      ORDER BY created_at DESC
      LIMIT 1
      `,
      {
        user_id: user.id,
        wallet_address: walletAddress,
      }
    )

    if (rows.length === 0) {
      return NextResponse.json({ wallet_address: walletAddress, provider: 'wallet.interledger-test.dev', status: 'manual_required' })
    }

    return NextResponse.json(rows[0])
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const body = (await req.json()) as WalletUpdateBody
    const walletAddress = await verifyWalletAddressRemotely((body.wallet_address ?? '').trim())

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...(user.user_metadata ?? {}),
        wallet_address: walletAddress,
      },
    })

    if (updateError) {
      return NextResponse.json({ error: `Failed to persist wallet in Supabase: ${updateError.message}` }, { status: 500 })
    }

    const existing = await queryRows<{ wallet_address: string }>(
      `
      SELECT wallet_address
      FROM user_wallets
      WHERE user_id = toUUID({user_id:String})
        AND wallet_address = {wallet_address:String}
      LIMIT 1
      `,
      {
        user_id: user.id,
        wallet_address: walletAddress,
      }
    )

    if (existing.length > 0) {
      return NextResponse.json({ wallet_address: walletAddress, status: 'provisioned' }, { status: 200 })
    }

    await insertRows('user_wallets', [{
      id: crypto.randomUUID(),
      user_id: user.id,
      wallet_address: walletAddress,
      provider: new URL(walletAddress).hostname,
      status: 'provisioned',
      is_default: 1,
    }])

    return NextResponse.json({ wallet_address: walletAddress, status: 'provisioned' }, { status: 200 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
