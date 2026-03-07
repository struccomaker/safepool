export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
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

    const admin = createSupabaseAdminClient()
    const { data: rows, error } = await admin
      .from('user_wallets')
      .select('wallet_address,provider,status,created_at')
      .eq('user_id', user.id)
      .eq('wallet_address', walletAddress)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      return NextResponse.json({ error: `Failed to load wallet binding: ${error.message}` }, { status: 500 })
    }

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

    const admin = createSupabaseAdminClient()
    const { data: existing, error: existingError } = await admin
      .from('user_wallets')
      .select('id,wallet_address')
      .eq('user_id', user.id)
      .eq('wallet_address', walletAddress)
      .limit(1)

    if (existingError) {
      return NextResponse.json({ error: `Failed to check existing wallet binding: ${existingError.message}` }, { status: 500 })
    }

    const { error: clearDefaultsError } = await admin
      .from('user_wallets')
      .update({ is_default: false })
      .eq('user_id', user.id)

    if (clearDefaultsError) {
      return NextResponse.json({ error: `Failed to update wallet defaults: ${clearDefaultsError.message}` }, { status: 500 })
    }

    if (existing.length > 0) {
      const { error: promoteError } = await admin
        .from('user_wallets')
        .update({
          is_default: true,
          status: 'provisioned',
          provider: new URL(walletAddress).hostname,
        })
        .eq('id', existing[0].id)

      if (promoteError) {
        return NextResponse.json({ error: `Failed to update wallet binding: ${promoteError.message}` }, { status: 500 })
      }

      return NextResponse.json({ wallet_address: walletAddress, status: 'provisioned' }, { status: 200 })
    }

    const { error: insertError } = await admin
      .from('user_wallets')
      .insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        wallet_address: walletAddress,
        provider: new URL(walletAddress).hostname,
        status: 'provisioned',
        is_default: true,
      })

    if (insertError) {
      return NextResponse.json({ error: `Failed to persist wallet binding: ${insertError.message}` }, { status: 500 })
    }

    return NextResponse.json({ wallet_address: walletAddress, status: 'provisioned' }, { status: 200 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
