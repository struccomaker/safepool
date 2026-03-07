'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import WalletSetupForm from '@/components/WalletSetupForm'

interface TopNavigationMenuProps {
  isAuthenticated?: boolean
}

type DonationStep = 'idle' | 'loading-wallet' | 'ready' | 'submitting' | 'awaiting-approval' | 'confirming' | 'success' | 'error'
type RecurringInterval = 'P1D' | 'P1W' | 'P1M'

interface WalletInfo {
  wallet_address: string
  status: string
  provider: string
}

interface ProfileUser {
  email?: string
  user_metadata?: {
    full_name?: string
  }
}

interface ContributionHistoryItem {
  id: string
  pool_id: string
  amount: number
  currency: string
  contributed_at: string
  status: 'pending' | 'completed' | 'failed'
}

type ContributionMode = 'live' | 'interaction_required' | 'demo' | null

const itemClass =
  'inline-flex h-9 items-center justify-center rounded-md px-4 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white'

export default function TopNavigationMenu({ isAuthenticated = false }: TopNavigationMenuProps) {
  const [error, setError] = useState('')
  const [showDonationModal, setShowDonationModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [donationAmount, setDonationAmount] = useState('50')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringInterval, setRecurringInterval] = useState<RecurringInterval>('P1M')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [donationError, setDonationError] = useState('')
  const [donationStep, setDonationStep] = useState<DonationStep>('idle')
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [lastContributionMode, setLastContributionMode] = useState<ContributionMode>(null)
  const [lastFlow, setLastFlow] = useState<'one_time' | 'recurring' | null>(null)
  const [pendingContributionId, setPendingContributionId] = useState<string | null>(null)
  const [approvalUrl, setApprovalUrl] = useState<string>('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null)
  const [profileWallet, setProfileWallet] = useState<WalletInfo | null>(null)
  const [profileHistory, setProfileHistory] = useState<ContributionHistoryItem[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()

  // Hydrate auth state from Supabase on mount
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

  // Handle ?login=1 auto-trigger from middleware redirect
  useEffect(() => {
    if (searchParams.get('login') === '1' && !authed) {
      handleSignIn()
    }
  }, [searchParams, authed])

  // Handle payment callback return (from ILP redirect)
  useEffect(() => {
    const paymentState = searchParams.get('payment_state')
    const referenceId = searchParams.get('reference_id')

    if (paymentState && referenceId) {
      if (paymentState === 'interaction_completed') {
        confirmContribution(referenceId)
        return
      }

      if (paymentState === 'recurring_active') {
        setShowDonationModal(true)
        setDonationStep('success')
        setLastFlow('recurring')
        setSuccessMessage('Recurring contribution setup is active. Scheduled charges will run via cron.')
      }
    }
  }, [searchParams])

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
    } finally {
      window.location.href = '/'
    }
  }

  const openDonationModal = async () => {
    setShowDonationModal(true)
    setDonationStep('loading-wallet')
    setDonationError('')
    setSuccessMessage('')
    setDonationAmount('50')
    setIsRecurring(false)
    setRecurringInterval('P1M')
    setIsAnonymous(false)
    setPendingContributionId(null)
    setApprovalUrl('')

    try {
      const res = await fetch('/api/wallet/me', { cache: 'no-store' })
      if (!res.ok) {
        const data = await res.json()
        setDonationError(data.error ?? 'Failed to load wallet. Please set up your wallet in Profile first.')
        setDonationStep('error')
        return
      }

      const data = (await res.json()) as WalletInfo
      setWalletInfo(data)

      if (!data.wallet_address || data.status === 'manual_required') {
        setDonationError('Your wallet is not set up yet. Please configure it in your Profile first.')
        setDonationStep('error')
        return
      }

      setDonationStep('ready')
    } catch {
      setDonationError('Network error loading wallet. Please try again.')
      setDonationStep('error')
    }
  }

  const refreshProfileData = async () => {
    setProfileLoading(true)
    setProfileError('')

    try {
      const supabase = createSupabaseBrowserClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      setProfileUser(user as ProfileUser | null)

      const [walletRes, historyRes] = await Promise.all([
        fetch('/api/wallet/me', { cache: 'no-store' }),
        fetch('/api/global/payments/history', { cache: 'no-store' }),
      ])

      if (!walletRes.ok) {
        const data = await walletRes.json()
        throw new Error(data.error ?? 'Failed to load wallet')
      }

      const walletData = (await walletRes.json()) as WalletInfo
      setProfileWallet(walletData)

      if (historyRes.ok) {
        const historyData = (await historyRes.json()) as ContributionHistoryItem[]
        setProfileHistory(historyData)
      } else {
        setProfileHistory([])
      }
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Unable to load profile data')
    } finally {
      setProfileLoading(false)
    }
  }

  const openProfileModal = async () => {
    setShowProfileModal(true)
    await refreshProfileData()
  }

  const confirmContribution = async (contributionId: string) => {
    setDonationStep('confirming')

    const maxAttempts = 5
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const confirmRes = await fetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contribution_id: contributionId }),
        })

        if (confirmRes.ok) {
          setDonationStep('success')
          setSuccessMessage(
            lastFlow === 'recurring'
              ? 'Recurring contribution setup is active. Scheduled charges will run via cron.'
              : lastContributionMode === 'demo'
              ? 'Donation simulated successfully (DEMO_MODE is enabled; no real wallet transaction was sent).'
              : 'Donation confirmed successfully!'
          )

          // Dispatch event for RightConfigSidebar
          window.dispatchEvent(
            new CustomEvent('safepool:donation-created', {
              detail: {
                walletId: walletInfo?.wallet_address ?? '',
                amount: Number(donationAmount),
                recurring: isRecurring,
                anonymous: isAnonymous,
              },
            })
          )
          return
        }

        if (confirmRes.status === 409 && attempt < maxAttempts - 1) {
          // Payment still pending, wait and retry
          await new Promise((resolve) => setTimeout(resolve, 2000))
          continue
        }

        const data = await confirmRes.json()
        setDonationError(data.error ?? 'Confirmation failed.')
        setDonationStep('error')
        return
      } catch {
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          continue
        }
        setDonationError('Network error during confirmation.')
        setDonationStep('error')
        return
      }
    }

    setDonationError('Payment is still processing. Please check your profile for status updates.')
    setDonationStep('error')
  }

  const handleDonationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setDonationError('')
    setSuccessMessage('')

    const parsedAmount = Number(donationAmount)

    if (!Number.isFinite(parsedAmount) || parsedAmount < 10 || parsedAmount > 500 || parsedAmount % 10 !== 0) {
      setDonationError('Donation amount must be between $10 and $500 in increments of $10.')
      return
    }

    setDonationStep('submitting')

    try {
      // Step 1: Ensure pool membership
      const joinRes = await fetch('/api/members/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_lat: 14.5995,
          location_lon: 120.9842,
          household_size: 1,
        }),
      })

      if (!joinRes.ok) {
        const data = await joinRes.json()
        setDonationError(data.error ?? 'Failed to join pool.')
        setDonationStep('error')
        return
      }

      if (isRecurring) {
        const recurringRes = await fetch('/api/recurring/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              amount: parsedAmount,
              currency: 'SGD',
              interval: recurringInterval,
            }),
          })

        if (!recurringRes.ok) {
          const data = await recurringRes.json()
          setDonationError(data.error ?? 'Failed to create recurring contribution setup.')
          setDonationStep('error')
          return
        }

        const recurringData = await recurringRes.json()
        setLastFlow('recurring')

        if (recurringData.mode === 'interaction_required' && recurringData.redirectUrl) {
          window.location.href = recurringData.redirectUrl
          return
        }

        setDonationStep('success')
        setSuccessMessage('Recurring contribution setup is active. Scheduled charges will run via cron.')
        return
      }

      const contributeRes = await fetch('/api/payments/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount: parsedAmount,
            currency: 'SGD',
          }),
        })

      if (!contributeRes.ok) {
        const data = await contributeRes.json()
        setDonationError(data.error ?? 'Failed to create contribution.')
        setDonationStep('error')
        return
      }

      const contributeData = await contributeRes.json()
      setLastFlow('one_time')
      setLastContributionMode((contributeData.mode ?? null) as ContributionMode)
      setPendingContributionId(contributeData.contribution_id)

      // Step 3: Handle response
      if (contributeData.needsInteraction && contributeData.paymentUrl) {
        // Redirect to Open Payments wallet for authorization
        window.location.href = contributeData.paymentUrl
        return
      }

      if (contributeData.mode === 'live' && contributeData.paymentUrl) {
        setApprovalUrl(contributeData.paymentUrl)
        setDonationStep('awaiting-approval')
        window.open(contributeData.paymentUrl, '_blank', 'noopener,noreferrer')
        return
      }

      // Step 4: No interaction needed — confirm immediately
      await confirmContribution(contributeData.contribution_id)
    } catch {
      setDonationError('Network error. Please try again.')
      setDonationStep('error')
    }
  }

  const closeDonationModal = () => {
    setShowDonationModal(false)
    setDonationStep('idle')
    setDonationError('')
    setSuccessMessage('')

    // Clean up URL params if they were set from callback return
    const url = new URL(window.location.href)
    if (url.searchParams.has('payment_state') || url.searchParams.has('reference_id')) {
      url.searchParams.delete('payment_state')
      url.searchParams.delete('reference_id')
      router.replace(url.pathname + url.search, { scroll: false })
    }
  }

  const isModalBusy = donationStep === 'loading-wallet' || donationStep === 'submitting' || donationStep === 'confirming'

  return (
    <div className="rounded-lg bg-black/45 p-1 backdrop-blur-sm">
      <div className="flex items-center gap-1">
        {!isAuthenticated ? (
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
          ) : (
            <>
              <Link className={itemClass} href="/governance">
                Governance
              </Link>
              <button className={itemClass} onClick={openDonationModal} type="button">
                Donation
              </button>
              <button className={itemClass} onClick={() => void openProfileModal()} type="button">
                Profile
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
                {donationStep === 'success'
                  ? 'Your donation has been processed.'
                  : 'Submit a wallet donation to the SafePool emergency fund.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {donationStep === 'loading-wallet' && (
                <div className="flex items-center gap-2 py-4 text-sm text-white/60">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Loading wallet information...
                </div>
              )}

              {donationStep === 'success' && (
                <div className="space-y-4">
                  <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
                    {successMessage}
                  </div>
                  <Button className="w-full" onClick={closeDonationModal} type="button" variant="secondary">
                    Close
                  </Button>
                </div>
              )}

              {donationStep === 'error' && (
                <div className="space-y-4">
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                    {donationError}
                  </div>
                  <div className="flex gap-2">
                    <Button className="w-full" onClick={closeDonationModal} type="button" variant="outline">
                      Close
                    </Button>
                    {donationError.includes('Profile') && (
                      <Button
                        className="w-full"
                        onClick={() => {
                          closeDonationModal()
                          void openProfileModal()
                        }}
                        type="button"
                        variant="secondary"
                      >
                        Go to Profile
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {donationStep === 'awaiting-approval' && (
                <div className="space-y-4">
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                    Complete payment approval in your wallet, then return here and continue confirmation.
                  </div>
                  {approvalUrl ? (
                    <a className="block truncate text-xs text-cyan-300 underline" href={approvalUrl} rel="noopener noreferrer" target="_blank">
                      Open approval link
                    </a>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (approvalUrl) {
                          window.open(approvalUrl, '_blank', 'noopener,noreferrer')
                        }
                      }}
                      type="button"
                      variant="outline"
                    >
                      Open Link Again
                    </Button>
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (pendingContributionId) {
                          void confirmContribution(pendingContributionId)
                        }
                      }}
                      type="button"
                      variant="secondary"
                    >
                      I Completed Approval
                    </Button>
                  </div>
                </div>
              )}

              {(donationStep === 'ready' || donationStep === 'submitting' || donationStep === 'confirming') && (
                <form className="space-y-4" onSubmit={handleDonationSubmit}>
                  <div className="space-y-2">
                    <label className="text-sm text-white/75" htmlFor="donation-wallet-id">
                      Your Wallet
                    </label>
                    <Input
                      className="text-xs opacity-70"
                      id="donation-wallet-id"
                      readOnly
                      value={walletInfo?.wallet_address ?? ''}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-white/75" htmlFor="donation-amount">
                      Donation Amount (SGD)
                    </label>
                    <Input
                      disabled={isModalBusy}
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
                        disabled={isModalBusy}
                        onChange={(event) => setIsRecurring(event.target.checked)}
                        type="checkbox"
                      />
                      Set up recurring payment
                    </label>
                    {isRecurring ? (
                      <div className="space-y-1">
                        <label className="text-xs text-white/60" htmlFor="recurring-interval">
                          Recurring interval
                        </label>
                        <select
                          className="w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white"
                          disabled={isModalBusy}
                          id="recurring-interval"
                          onChange={(event) => setRecurringInterval(event.target.value as RecurringInterval)}
                          value={recurringInterval}
                        >
                          <option value="P1D">Daily</option>
                          <option value="P1W">Weekly</option>
                          <option value="P1M">Monthly</option>
                        </select>
                      </div>
                    ) : null}
                    <label className="flex items-center gap-2 text-sm text-white/80">
                      <input
                        checked={isAnonymous}
                        className="h-4 w-4 accent-white"
                        disabled={isModalBusy}
                        onChange={(event) => setIsAnonymous(event.target.checked)}
                        type="checkbox"
                      />
                      Donate anonymously
                    </label>
                  </div>

                  {donationStep === 'submitting' && (
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Processing donation...
                    </div>
                  )}

                  {donationStep === 'confirming' && (
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Confirming payment...
                    </div>
                  )}

                  {donationError ? <p className="text-sm text-red-300">{donationError}</p> : null}

                  <div className="flex gap-2">
                    <Button className="w-full" disabled={isModalBusy} onClick={closeDonationModal} type="button" variant="outline">
                      Cancel
                    </Button>
                    <Button className="w-full" disabled={isModalBusy} type="submit" variant="secondary">
                      {isModalBusy ? 'Processing...' : 'Submit Donation'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <Card className="max-h-[85vh] w-[42rem] overflow-y-auto border-white/20 bg-black/90 text-white">
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription className="text-white/70">
                Manage your wallet and review contribution history.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profileLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-white/60">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Loading profile data...
                </div>
              ) : null}

              {profileError ? <p className="text-sm text-red-300">{profileError}</p> : null}

              {!profileLoading && !profileError && (
                <>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="mb-3 text-sm font-semibold">Account</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/40">Name</span>
                        <span>{profileUser?.user_metadata?.full_name ?? profileUser?.email?.split('@')[0] ?? '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Email</span>
                        <span>{profileUser?.email ?? '—'}</span>
                      </div>
                    </div>
                  </div>

                  <WalletSetupForm
                    currentWalletAddress={profileWallet?.wallet_address ?? null}
                    walletStatus={profileWallet?.status ?? null}
                    onWalletUpdated={() => {
                      void refreshProfileData()
                    }}
                  />

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="mb-3 text-sm font-semibold">Contribution History</h3>
                    {profileHistory.length === 0 ? (
                      <p className="text-sm text-white/40">No contributions yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {profileHistory.map((item) => (
                          <div className="flex items-center justify-between border-b border-white/5 py-2 last:border-0" key={item.id}>
                            <div>
                              <div className="text-xs font-mono text-white/70">{item.pool_id}</div>
                              <div className="text-[11px] text-white/35">{new Date(item.contributed_at).toLocaleString()}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-sm text-green-300">${item.amount} {item.currency}</div>
                              <div className={`text-[11px] capitalize ${item.status === 'completed' ? 'text-green-400' : item.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                                {item.status}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setShowProfileModal(false)} type="button" variant="outline">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
