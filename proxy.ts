import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSupabaseSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request)

  const isProtectedRoute = [
    '/contribute',
    '/profile',
  ].some(path => request.nextUrl.pathname.startsWith(path))

  if (isProtectedRoute && !user) {
    const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('callbackUrl', callbackUrl)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/contribute', '/profile/:path*'],
}
