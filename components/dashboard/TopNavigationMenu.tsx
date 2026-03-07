'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

interface TopNavigationMenuProps {
  isAuthenticated?: boolean
}

const itemClass =
  'inline-flex h-9 items-center justify-center rounded-md px-4 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white'

export default function TopNavigationMenu({ isAuthenticated = false }: TopNavigationMenuProps) {
  const [authed, setAuthed] = useState(isAuthenticated)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    let supabase
    try {
      supabase = createSupabaseBrowserClient()
    } catch (err: unknown) {
      if (mounted) {
        setError(err instanceof Error ? err.message : 'Unable to initialize Supabase client')
      }
      return () => {
        mounted = false
      }
    }

    const hydrateAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (mounted) {
        setAuthed(Boolean(user))
      }
    }

    void hydrateAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: unknown, session: { user?: unknown } | null) => {
      if (mounted) {
        setAuthed(Boolean(session?.user))
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSignIn = async () => {
    setError('')
    try {
      const supabase = createSupabaseBrowserClient()
      const origin = window.location.origin
      const redirectTo = `${origin}/auth/callback?next=/`
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (authError) {
        throw authError
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to start sign-in')
    }
  }

  const handleSignOut = async () => {
    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
      setAuthed(false)
    } finally {
      window.location.href = '/'
    }
  }

  return (
    <div className="rounded-lg bg-black/45 p-1 backdrop-blur-sm">
      <div className="flex items-center gap-1">
        {!authed ? (
          <button className={itemClass} onClick={handleSignIn} type="button">
            Login
          </button>
        ) : (
          <>
            <Link className={itemClass} href="/governance">
              Governance
            </Link>
            <Link className={itemClass} href="/contribute">
              Donation
            </Link>
            <button className={itemClass} onClick={handleSignOut} type="button">
              Signout
            </button>
          </>
        )}
      </div>
      {error ? <p className="px-2 pt-1 text-xs text-red-300">{error}</p> : null}
    </div>
  )
}
