export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getLatestUserWalletBinding, syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'
import { isValidWalletAddress, verifyWalletAddressRemotely } from '@/lib/wallet-address'

interface JoinRequest {
  wallet_address?: string
  location_lat: number
  location_lon: number
  household_size?: number
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()

    await syncSupabaseUserToClickHouse(user)

    const body = await req.json() as JoinRequest

    const requestedWallet = body.wallet_address?.trim()
    let walletAddress = requestedWallet ?? ''

    if (!walletAddress) {
      const walletBinding = await getLatestUserWalletBinding(user.id)
      if (!walletBinding || walletBinding.status !== 'provisioned') {
        return NextResponse.json({ error: 'Set a valid wallet in /api/wallet/me before joining' }, { status: 400 })
      }
      walletAddress = walletBinding.wallet_address
    } else {
      walletAddress = await verifyWalletAddressRemotely(walletAddress)

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata ?? {}),
          wallet_address: walletAddress,
        },
      })

      if (updateError) {
        return NextResponse.json({ error: `Failed to persist wallet in Supabase: ${updateError.message}` }, { status: 500 })
      }
    }

    if (!isValidWalletAddress(walletAddress)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    const { data: existingMember, error: existingMemberError } = await admin
      .from('members')
      .select('id')
      .eq('pool_id', GLOBAL_POOL_ID)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: false })
      .limit(1)

    if (existingMemberError) {
      return NextResponse.json({ error: `Failed to load member record: ${existingMemberError.message}` }, { status: 500 })
    }

    if (existingMember.length > 0) {
      const { error: updateMemberError } = await admin
        .from('members')
        .update({
          wallet_address: walletAddress,
          location_lat: body.location_lat,
          location_lon: body.location_lon,
          household_size: body.household_size ?? 1,
          joined_at: new Date().toISOString(),
          is_active: true,
        })
        .eq('id', existingMember[0].id)

      if (updateMemberError) {
        return NextResponse.json({ error: `Failed to update member: ${updateMemberError.message}` }, { status: 500 })
      }

      return NextResponse.json({ id: existingMember[0].id }, { status: 200 })
    }

    const id = crypto.randomUUID()

    const { error: insertMemberError } = await admin
      .from('members')
      .insert({
        id,
        pool_id: GLOBAL_POOL_ID,
        user_id: user.id,
        wallet_address: walletAddress,
        location_lat: body.location_lat,
        location_lon: body.location_lon,
        household_size: body.household_size ?? 1,
        is_active: true,
      })

    if (insertMemberError) {
      return NextResponse.json({ error: `Failed to create member: ${insertMemberError.message}` }, { status: 500 })
    }

    return NextResponse.json({ id }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
