import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const popupMode = url.searchParams.get('popup') === '1'
  const nextPath = url.searchParams.get('next') ?? '/dashboard'
  const safeNextPath = nextPath.startsWith('/') ? nextPath : '/dashboard'

  if (code) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  const redirectPath = popupMode ? '/auth/popup-complete' : safeNextPath
  return NextResponse.redirect(new URL(redirectPath, url.origin))
}
