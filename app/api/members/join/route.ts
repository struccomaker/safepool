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

function isJoinRequest(value: unknown): value is JoinRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as {
    wallet_address?: unknown
    location_lat?: unknown
    location_lon?: unknown
    household_size?: unknown
  }

  const walletValid = typeof candidate.wallet_address === 'undefined' || typeof candidate.wallet_address === 'string'
  const latValid = typeof candidate.location_lat === 'number' && Number.isFinite(candidate.location_lat) && candidate.location_lat >= -90 && candidate.location_lat <= 90
  const lonValid = typeof candidate.location_lon === 'number' && Number.isFinite(candidate.location_lon) && candidate.location_lon >= -180 && candidate.location_lon <= 180
  const householdValid = typeof candidate.household_size === 'undefined'
    || (typeof candidate.household_size === 'number' && Number.isInteger(candidate.household_size) && candidate.household_size > 0 && candidate.household_size <= 30)

  return walletValid && latValid && lonValid && householdValid
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

    const rawBody = await req.json() as unknown
    if (!isJoinRequest(rawBody)) {
      return NextResponse.json({ error: 'Invalid request body for member join' }, { status: 400 })
    }
    const body: JoinRequest = {
      wallet_address: typeof rawBody.wallet_address === 'string' ? rawBody.wallet_address.trim() : undefined,
      location_lat: rawBody.location_lat,
      location_lon: rawBody.location_lon,
      household_size: rawBody.household_size,
    }

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

    const id = crypto.randomUUID()

    const insertPayload = {
      id,
      pool_id: GLOBAL_POOL_ID,
      user_id: user.id,
      wallet_address: walletAddress,
      location_lat: body.location_lat,
      location_lon: body.location_lon,
      household_size: body.household_size ?? 1,
      is_active: true,
    }

    const { error: insertMemberError } = await admin
      .from('members')
      .insert(insertPayload)

    if (!insertMemberError) {
      return NextResponse.json({ id }, { status: 201 })
    }

    const isDuplicate = insertMemberError.code === '23505'
      || insertMemberError.message.toLowerCase().includes('duplicate key')

    if (!isDuplicate) {
      return NextResponse.json({ error: `Failed to create member: ${insertMemberError.message}` }, { status: 500 })
    }

    const { data: existingMember, error: existingMemberError } = await admin
      .from('members')
      .select('id')
      .eq('pool_id', GLOBAL_POOL_ID)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: false })
      .limit(1)

    if (existingMemberError || existingMember.length === 0) {
      return NextResponse.json({ error: `Failed to resolve existing member after duplicate insert: ${existingMemberError?.message ?? 'No active member found'}` }, { status: 500 })
    }

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
      return NextResponse.json({ error: `Failed to update existing member after duplicate insert: ${updateMemberError.message}` }, { status: 500 })
    }

    return NextResponse.json({ id: existingMember[0].id }, { status: 200 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
