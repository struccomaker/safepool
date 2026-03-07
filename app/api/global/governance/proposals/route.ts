export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('proposals')
      .select('id,pool_id,proposed_by,title,description,change_type,new_value,created_at,voting_ends_at,status')
      .eq('pool_id', GLOBAL_POOL_ID)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: `Failed to load governance proposals: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
