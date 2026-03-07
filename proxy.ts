import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSupabaseSession } from '@/lib/supabase/middleware'

// Routes that require an authenticated Supabase session.
// /api/payments/callback is explicitly EXCLUDED — wallet providers redirect here.
const PROTECTED_PAGE_PREFIXES = ['/profile', '/contribute']
const PROTECTED_API_PREFIXES = [
  '/api/wallet/',
  '/api/members/',
  '/api/payments/contribute',
  '/api/payments/confirm',
  '/api/payments/status',
]

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isProtectedApi(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request)
  const { pathname } = request.nextUrl

  // Always allow the auth callback + payment callback through
  if (pathname.startsWith('/auth/') || pathname === '/api/payments/callback') {
    return response
  }

  // Protected API routes → 401 JSON
  if (!user && isProtectedApi(pathname)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Protected pages → redirect to home with login hint
  if (!user && isProtectedPage(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('login', '1')
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/profile/:path*',
    '/contribute/:path*',
    '/api/wallet/:path*',
    '/api/members/:path*',
    '/api/payments/contribute',
    '/api/payments/confirm',
    '/api/payments/status',
    '/auth/:path*',
    '/api/payments/callback',
  ],
}
