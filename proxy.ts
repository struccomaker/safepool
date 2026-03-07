import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSupabaseSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request)

  const isProtectedRoute = [
    '/dashboard',
    '/pools/create',
    '/profile',
  ].some(path => request.nextUrl.pathname.startsWith(path))

  const isContributeRoute = /^\/pools\/[^/]+\/contribute$/.test(
    request.nextUrl.pathname
  )

  if ((isProtectedRoute || isContributeRoute) && !user) {
    const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', callbackUrl)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/pools/create', '/pools/:id/contribute', '/profile/:path*'],
}
