export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import client from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getLatestUserWalletBinding, syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'
import { queryRows, runCommand, toClickHouseDateTime } from '@/lib/clickhouse'
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

    const existingMember = await queryRows<{ id: string }>(
      `
      SELECT toString(id) AS id
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

    if (existingMember.length > 0) {
      await runCommand(
        `
        ALTER TABLE members
        UPDATE
          wallet_address = {wallet_address:String},
          location_lat = {location_lat:Float64},
          location_lon = {location_lon:Float64},
          household_size = {household_size:UInt8},
          joined_at = parseDateTimeBestEffort({joined_at:String})
        WHERE id = toUUID({id:String})
        `,
        {
          wallet_address: walletAddress,
          location_lat: body.location_lat,
          location_lon: body.location_lon,
          household_size: body.household_size ?? 1,
          joined_at: toClickHouseDateTime(new Date()),
          id: existingMember[0].id,
        }
      )

      return NextResponse.json({ id: existingMember[0].id }, { status: 200 })
    }

    const id = crypto.randomUUID()

    await client.insert({
      table: 'members',
      values: [{
        id,
        pool_id: GLOBAL_POOL_ID,
        user_id: user.id,
        wallet_address: walletAddress,
        location_lat: body.location_lat,
        location_lon: body.location_lon,
        household_size: body.household_size ?? 1,
        is_active: 1,
      }],
      format: 'JSONEachRow',
    })

    return NextResponse.json({ id }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
