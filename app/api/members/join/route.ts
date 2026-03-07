import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import client from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'

interface JoinRequest {
  wallet_address: string
  location_lat: number
  location_lon: number
  household_size?: number
}

function isValidWalletAddress(url: string): boolean {
  try {
    new URL(url)
    return url.startsWith('https://')
  } catch {
    return false
  }
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

    const body = await req.json() as JoinRequest

    if (!isValidWalletAddress(body.wallet_address)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    const id = crypto.randomUUID()

    await client.insert({
      table: 'members',
      values: [{
        id,
        pool_id: GLOBAL_POOL_ID,
        user_id: user.id,
        wallet_address: body.wallet_address,
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
