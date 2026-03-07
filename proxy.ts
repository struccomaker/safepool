import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get('next-auth.session-token')
    ?? request.cookies.get('__Secure-next-auth.session-token')

  const isProtectedRoute = [
    '/dashboard',
    '/pools/create',
    '/profile',
  ].some(path => request.nextUrl.pathname.startsWith(path))

  const isContributeRoute = /^\/pools\/[^/]+\/contribute$/.test(
    request.nextUrl.pathname
  )

  if ((isProtectedRoute || isContributeRoute) && !sessionCookie) {
    const loginUrl = new URL('/api/auth/signin', request.url)
    loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/pools/create', '/pools/:id/contribute', '/profile/:path*'],
}
