export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

export async function GET() {
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
    const admin = createSupabaseAdminClient()

    const { data: memberRows, error: memberError } = await admin
      .from('members')
      .select('id')
      .eq('user_id', user.id)
      .eq('pool_id', GLOBAL_POOL_ID)
      .eq('is_active', true)

    if (memberError) {
      return NextResponse.json({ error: `Failed to load member context: ${memberError.message}` }, { status: 500 })
    }

    const memberIds = memberRows.map((row) => row.id)
    if (memberIds.length === 0) {
      return NextResponse.json([])
    }

    const { data, error } = await admin
      .from('contributions')
      .select('id,pool_id,member_id,amount,currency,incoming_payment_id,contributed_at,status')
      .eq('pool_id', GLOBAL_POOL_ID)
      .in('member_id', memberIds)
      .order('contributed_at', { ascending: false })
      .limit(100)

    if (error) {
      return NextResponse.json({ error: `Failed to load payment history: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
