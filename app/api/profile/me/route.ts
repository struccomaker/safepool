export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

interface ProfileUpdateBody {
  country?: string
}

const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/

function normalizeCountry(input: unknown): string {
  if (typeof input !== 'string') {
    return 'SG'
  }

  const normalized = input.trim().toUpperCase()
  if (!COUNTRY_CODE_REGEX.test(normalized)) {
    return 'SG'
  }
  return normalized
}

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  await syncSupabaseUserToClickHouse(user)
  return { user, supabase }
}

export async function GET() {
  try {
    const auth = await getAuthenticatedUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('users')
      .select('id,name,email,country')
      .eq('id', auth.user.id)
      .limit(1)

    if (error) {
      return NextResponse.json({ error: `Failed to load profile: ${error.message}` }, { status: 500 })
    }

    const row = data[0]
    return NextResponse.json({
      id: auth.user.id,
      name: row?.name ?? '',
      email: row?.email ?? auth.user.email ?? '',
      country: normalizeCountry(row?.country),
    })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as ProfileUpdateBody
    const country = normalizeCountry(body.country)

    const admin = createSupabaseAdminClient()
    const { error } = await admin
      .from('users')
      .update({ country, updated_at: new Date().toISOString() })
      .eq('id', auth.user.id)

    if (error) {
      return NextResponse.json({ error: `Failed to update profile country: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ country }, { status: 200 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
