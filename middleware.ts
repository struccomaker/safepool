export { default as middleware } from 'next-auth/middleware'

export const config = {
  matcher: ['/dashboard/:path*', '/pools/create', '/pools/:id/contribute', '/profile/:path*'],
}

