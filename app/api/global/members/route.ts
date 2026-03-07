export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('members')
      .select('id,pool_id,user_id,wallet_address,location_lat,location_lon,household_size,joined_at,is_active')
      .eq('pool_id', GLOBAL_POOL_ID)
      .eq('is_active', true)
      .order('joined_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: `Failed to load global members: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
