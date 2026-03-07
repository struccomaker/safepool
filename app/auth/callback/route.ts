import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const requestOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin
  const code = url.searchParams.get('code')
  const popupMode = url.searchParams.get('popup') === '1'
  const nextPath = url.searchParams.get('next') ?? '/'
  const safeNextPath = nextPath.startsWith('/') ? nextPath : '/'

  if (code) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.exchangeCodeForSession(code)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      try {
        await syncSupabaseUserToClickHouse(user)
      } catch (syncError: unknown) {
        console.error('Failed syncing Supabase user to ClickHouse', syncError)
      }
    }
  }

  const redirectPath = popupMode ? '/auth/popup-complete' : safeNextPath
  const redirectUrl = new URL(redirectPath, requestOrigin)
  if (code) {
    redirectUrl.searchParams.set('auth_welcome', '1')
  }
  return NextResponse.redirect(redirectUrl)
}
