'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface TopNavigationMenuProps {
  isAuthenticated?: boolean
}

const itemClass =
  'inline-flex h-9 items-center justify-center rounded-md px-4 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white'

export default function TopNavigationMenu({ isAuthenticated = false }: TopNavigationMenuProps) {
  const [authed, setAuthed] = useState(isAuthenticated)
  const [error, setError] = useState('')
  const [showDonationModal, setShowDonationModal] = useState(false)
  const [walletId, setWalletId] = useState('')
  const [donationAmount, setDonationAmount] = useState('50')
  const [isRecurring, setIsRecurring] = useState(false)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [donationError, setDonationError] = useState('')

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

  const handleDonationSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setDonationError('')

    const parsedAmount = Number(donationAmount)
    if (!walletId.trim()) {
      setDonationError('Wallet ID is required.')
      return
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount < 10 || parsedAmount > 500 || parsedAmount % 10 !== 0) {
      setDonationError('Donation amount must be between $10 and $500 in increments of $10.')
      return
    }

    window.dispatchEvent(
      new CustomEvent('safepool:donation-created', {
        detail: {
          walletId: walletId.trim(),
          amount: parsedAmount,
          recurring: isRecurring,
          anonymous: isAnonymous,
        },
      })
    )

    setShowDonationModal(false)
    setDonationAmount('50')
    setIsRecurring(false)
    setIsAnonymous(false)
    setDonationError('')
  }

  return (
    <>
      <div className="rounded-lg p-1">
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
              <button className={itemClass} onClick={() => setShowDonationModal(true)} type="button">
                Donation
              </button>
              <button className={itemClass} onClick={handleSignOut} type="button">
                Signout
              </button>
            </>
          )}
        </div>
        {error ? <p className="px-2 pt-1 text-xs text-red-300">{error}</p> : null}
      </div>

      {showDonationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <Card className="w-[26rem] border-white/20 bg-black/85 text-white">
            <CardHeader>
              <CardTitle>Create Donation</CardTitle>
              <CardDescription className="text-white/70">
                Submit a wallet donation to the active emergency pool.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleDonationSubmit}>
                <div className="space-y-2">
                  <label className="text-sm text-white/75" htmlFor="donation-wallet-id">
                    Wallet ID
                  </label>
                  <Input
                    id="donation-wallet-id"
                    onChange={(event) => setWalletId(event.target.value)}
                    placeholder="wallet_abc123"
                    required
                    value={walletId}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-white/75" htmlFor="donation-amount">
                    Donation Amount (SGD)
                  </label>
                  <Input
                    id="donation-amount"
                    max={500}
                    min={10}
                    onChange={(event) => setDonationAmount(event.target.value)}
                    required
                    step={10}
                    type="number"
                    value={donationAmount}
                  />
                </div>

                <div className="space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      checked={isRecurring}
                      className="h-4 w-4 accent-white"
                      onChange={(event) => setIsRecurring(event.target.checked)}
                      type="checkbox"
                    />
                    Set up recurring payment
                  </label>
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      checked={isAnonymous}
                      className="h-4 w-4 accent-white"
                      onChange={(event) => setIsAnonymous(event.target.checked)}
                      type="checkbox"
                    />
                    Donate anonymously
                  </label>
                </div>

                {donationError ? <p className="text-sm text-red-300">{donationError}</p> : null}

                <div className="flex gap-2">
                  <Button className="w-full" onClick={() => setShowDonationModal(false)} type="button" variant="outline">
                    Cancel
                  </Button>
                  <Button className="w-full" type="submit" variant="secondary">
                    Submit Donation
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
