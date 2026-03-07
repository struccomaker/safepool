import { NextResponse } from 'next/server'

function deprecatedResponse() {
  return NextResponse.json(
    {
      error: 'NextAuth route is deprecated. Use Supabase OAuth flow instead.',
    },
    { status: 410 }
  )
}

export async function GET() {
  return deprecatedResponse()
}

export async function POST() {
  return deprecatedResponse()
}
