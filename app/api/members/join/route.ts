import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import client from '@/lib/clickhouse'
import type { JoinPoolRequest } from '@/types'

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
    const token = await getToken({ req })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as JoinPoolRequest

    if (!isValidWalletAddress(body.wallet_address)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    const id = crypto.randomUUID()

    await client.insert({
      table: 'members',
      values: [{
        id,
        pool_id: body.pool_id,
        user_id: token.id as string,
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
