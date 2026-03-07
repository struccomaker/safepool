'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

function getDisplayName(user: User | null): string {
  if (!user) return 'SafePool'

  const fullName = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name
    : null

  return fullName ?? user.email?.split('@')[0] ?? 'SafePool'
}

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const searchParams = useSearchParams()

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let mounted = true

    async function refreshUser() {
      const { data } = await supabase.auth.getUser()
      if (mounted) {
        setUser(data.user ?? null)
      }
    }

    void refreshUser()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null)
    })

    function onPopupMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.data !== 'safepool-auth-success') return
      void refreshUser()
    }

    window.addEventListener('message', onPopupMessage)

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
      window.removeEventListener('message', onPopupMessage)
    }
  }, [supabase])

  async function loginWithGoogle() {
    setLoading(true)
    setErrorMessage('')

    try {
      const callbackUrlParam = searchParams.get('callbackUrl') ?? '/dashboard'
      const nextPath = callbackUrlParam.startsWith('/') ? callbackUrlParam : '/dashboard'
      const callbackUrl = `${window.location.origin}/auth/callback?popup=1&next=${encodeURIComponent(nextPath)}`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          },
        },
      })

      if (error) {
        throw error
      }

      if (!data.url) {
        throw new Error('Unable to start Google sign-in')
      }

      const width = 520
      const height = 680
      const left = Math.max(window.screenX + (window.outerWidth - width) / 2, 0)
      const top = Math.max(window.screenY + (window.outerHeight - height) / 2, 0)

      const popup = window.open(
        data.url,
        'safepool-google-login',
        `width=${width},height=${height},left=${left},top=${top},popup=yes`
      )

      if (!popup) {
        window.location.assign(data.url)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed'
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    setLoading(true)
    setErrorMessage('')

    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        throw error
      }
      setUser(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-out failed'
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  const isSignedIn = Boolean(user)
  const displayName = getDisplayName(user)

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🌐</div>
          <h1 className="text-2xl font-bold">Sign in to SafePool</h1>
          <p className="text-gray-400 text-sm mt-1">Google is the only sign-in method for SafePool</p>
        </div>

        {!isSignedIn && (
          <button
            type="button"
            onClick={loginWithGoogle}
            disabled={loading}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Opening Google...' : 'Continue with Google'}
          </button>
        )}

        <div className="mt-4 p-3 bg-white/5 rounded-lg">
          <p className="text-gray-500 text-xs text-center">
            {isSignedIn ? `Signed in as ${user?.email}` : 'Use the Google popup to test OAuth + Google verification'}
          </p>
        </div>

        {errorMessage && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {errorMessage}
          </div>
        )}
      </div>

      <div className="fixed bottom-6 left-6 z-[100] flex items-center gap-3 rounded-2xl border border-green-400/40 bg-black/85 p-4 shadow-[0_0_30px_rgba(34,197,94,0.25)] backdrop-blur">
        <button
          type="button"
          onClick={loginWithGoogle}
          disabled={isSignedIn || loading}
          className={isSignedIn
            ? 'px-6 py-3 rounded-xl text-base font-bold border border-green-500/50 bg-green-500/20 text-green-200'
            : 'px-6 py-3 rounded-xl text-base font-bold bg-green-500 text-black hover:bg-green-400 disabled:opacity-60 transition-colors'}
        >
          {isSignedIn ? `Welcome ${displayName} user` : loading ? 'Opening...' : 'Google Sign In (Test)'}
        </button>

        {isSignedIn && (
          <button
            type="button"
            onClick={logout}
            disabled={loading}
            className="px-4 py-3 rounded-xl text-sm border border-white/20 bg-white/10 text-white hover:bg-white/20 disabled:opacity-60"
          >
            {loading ? 'Signing out...' : 'Sign out'}
          </button>
        )}
      </div>
    </div>
  )
}
