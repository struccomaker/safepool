'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AmbientLight, Box3, DirectionalLight, Group, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import WalletSetupForm from '@/components/WalletSetupForm'
import GovernanceModal from '@/components/dashboard/GovernanceModal'
import VotingModal from '@/components/dashboard/VotingModal'

interface TopNavigationMenuProps {
  isAuthenticated?: boolean
}

type DonationStep = 'idle' | 'loading-wallet' | 'ready' | 'submitting' | 'awaiting-approval' | 'confirming' | 'success' | 'error'
type RecurringInterval = 'P1D' | 'P1W' | 'P1M'
type ContributionMode = 'live' | 'interaction_required' | 'demo' | null

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

interface ProfileSettingsResponse {
  country: string
}

interface ContributionHistoryItem {
  id: string
  pool_id: string
  amount: number
  currency: string
  contributed_at: string
  status: 'pending' | 'completed' | 'failed'
}

interface ConfirmContributionResponse {
  id: string
  amount?: number
  currency?: string
  error?: string
}

interface PaymentPopupState {
  open: boolean
  variant: 'success' | 'error'
  title: string
  message: string
}

const itemClass =
  'inline-flex h-9 items-center justify-center rounded-md px-4 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white'

const COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'SG', label: 'Singapore' },
  { code: 'PH', label: 'Philippines' },
  { code: 'MY', label: 'Malaysia' },
  { code: 'ID', label: 'Indonesia' },
  { code: 'TH', label: 'Thailand' },
  { code: 'VN', label: 'Vietnam' },
  { code: 'IN', label: 'India' },
  { code: 'JP', label: 'Japan' },
  { code: 'KR', label: 'South Korea' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
]

function countryCodeToFlag(countryCode: string): string {
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) {
    return '🌐'
  }
  const points = [...code].map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...points)
}

const MINI_GODZILLA_ORIENTATIONS = {
  front: [0, 0, 0],
  back: [0, Math.PI, 0],
  left: [0, -Math.PI / 2, 0],
  right: [0, Math.PI / 2, 0],
  top: [-Math.PI / 2, 0, 0],
  bottom: [Math.PI / 2, 0, 0],
  sideTiltLeft: [0, 0, Math.PI / 2],
  sideTiltRight: [0, 0, -Math.PI / 2],
} as const

const MINI_GODZILLA_DIRECTION: keyof typeof MINI_GODZILLA_ORIENTATIONS = 'right'
const LOGIN_INTENT_KEY = 'safepool:login-intent'

export function MiniGodzillaBadge() {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [hoverPos, setHoverPos] = useState({ x: 28, y: 28 })

  useEffect(() => {
    if (!host) return

    const width = 58
    const height = 58
    const scene = new Scene()
    const camera = new PerspectiveCamera(38, width / height, 0.1, 100)
    camera.position.set(0, 0.45, 2.6)

    const renderer = new WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(width, height)
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const keyLight = new DirectionalLight(0xffffff, 1.4)
    keyLight.position.set(2.2, 2, 2)
    scene.add(keyLight)

    const fillLight = new AmbientLight(0xffffff, 0.8)
    scene.add(fillLight)

    const loader = new GLTFLoader()
    let model: Group | null = null
    let rafId = 0
    let mounted = true

    loader.load(
      '/godzilla.glb',
      (gltf) => {
        if (!mounted) return

        const nextModel = gltf.scene
        nextModel.updateMatrixWorld(true)

        const box = new Box3().setFromObject(nextModel)
        const size = new Vector3()
        box.getSize(size)
        if (size.y > 0) {
          const scale = (0.42 / size.y) * 3
          nextModel.scale.multiplyScalar(scale)
          nextModel.updateMatrixWorld(true)
        }

        const [rotX, rotY, rotZ] = MINI_GODZILLA_ORIENTATIONS[MINI_GODZILLA_DIRECTION]
        nextModel.rotation.set(rotX, rotY, rotZ)
        model = nextModel
        scene.add(nextModel)
      },
      undefined,
      () => { }
    )

    const animate = () => {
      if (model) {
        model.rotation.y += 0.02
      }
      renderer.render(scene, camera)
      rafId = window.requestAnimationFrame(animate)
    }

    rafId = window.requestAnimationFrame(animate)

    return () => {
      mounted = false
      window.cancelAnimationFrame(rafId)
      renderer.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
  }, [host])

  return (
    <div
      className="relative inline-flex h-14 w-14 items-center justify-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        setHoverPos({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      }}
    >
      {isHovered && (
        <span
          className="pointer-events-none absolute rounded-md border border-white/20 bg-black/85 px-2.5 py-1 text-[10px] font-medium tracking-wide text-white/90 shadow-[0_4px_14px_rgba(0,0,0,0.45)] backdrop-blur-sm"
          style={{
            left: hoverPos.x,
            top: hoverPos.y + 18,
            transform: 'translate(-50%, 0)',
          }}
        >
          Punch!
        </span>
      )}
      <div className="inline-flex h-14 w-14 items-center justify-center" ref={setHost} />
    </div>
  )
}

export default function TopNavigationMenu({ isAuthenticated = false }: TopNavigationMenuProps) {
  const [authed, setAuthed] = useState(isAuthenticated)
  const [error, setError] = useState('')

  const [showDonationModal, setShowDonationModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)

  const [showGovernanceModal, setShowGovernanceModal] = useState(false)
  const [showVotingModal, setShowVotingModal] = useState(false)
  const [walletId, setWalletId] = useState('')
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
  const [approvalUrl, setApprovalUrl] = useState('')
  const [paymentPopup, setPaymentPopup] = useState<PaymentPopupState>({
    open: false,
    variant: 'success',
    title: '',
    message: '',
  })

  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null)
  const [profileWallet, setProfileWallet] = useState<WalletInfo | null>(null)
  const [profileHistory, setProfileHistory] = useState<ContributionHistoryItem[]>([])
  const [profileCountry, setProfileCountry] = useState('SG')
  const [profileCountrySaving, setProfileCountrySaving] = useState(false)
  const [mockDonationRunning, setMockDonationRunning] = useState(false)
  const mockDonationLock = useRef(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const hasWelcomeSignal = searchParams.get('auth_welcome') === '1'
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false)
  const [welcomeOverlayFading, setWelcomeOverlayFading] = useState(false)
  const [welcomeName, setWelcomeName] = useState('Member')
  const welcomeTimersRef = useRef<number[]>([])

  const getWelcomeName = (user: User) => {
    const fullName = user.user_metadata?.full_name
    const name = user.user_metadata?.name
    if (typeof fullName === 'string' && fullName.trim()) return fullName.trim()
    if (typeof name === 'string' && name.trim()) return name.trim()
    if (user.email) return user.email.split('@')[0]
    return 'Member'
  }

  const triggerWelcomeOverlay = (user: User) => {
    setWelcomeName(getWelcomeName(user))
    setWelcomeOverlayFading(false)
    setShowWelcomeOverlay(true)

    for (const timer of welcomeTimersRef.current) {
      window.clearTimeout(timer)
    }
    welcomeTimersRef.current = []

    const fadeTimer = window.setTimeout(() => {
      setWelcomeOverlayFading(true)
    }, 1800)

    const hideTimer = window.setTimeout(() => {
      setShowWelcomeOverlay(false)
      setWelcomeOverlayFading(false)
    }, 3000)

    welcomeTimersRef.current.push(fadeTimer, hideTimer)
  }

  const dismissWelcomeOverlay = () => {
    for (const timer of welcomeTimersRef.current) {
      window.clearTimeout(timer)
    }
    welcomeTimersRef.current = []
    setShowWelcomeOverlay(false)
    setWelcomeOverlayFading(false)
  }

  const clearWelcomeSignal = () => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('auth_welcome')) return
    url.searchParams.delete('auth_welcome')
    router.replace(url.pathname + url.search, { scroll: false })
  }

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
        const hasLoginIntent = sessionStorage.getItem(LOGIN_INTENT_KEY) === '1'
        if (user && hasLoginIntent && hasWelcomeSignal) {
          triggerWelcomeOverlay(user)
          sessionStorage.removeItem(LOGIN_INTENT_KEY)
          clearWelcomeSignal()
        }
      }
    }

    void hydrateAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        setAuthed(Boolean(session?.user))
        const hasLoginIntent = sessionStorage.getItem(LOGIN_INTENT_KEY) === '1'
        if (event === 'SIGNED_IN' && session?.user && hasLoginIntent && hasWelcomeSignal) {
          triggerWelcomeOverlay(session.user)
          sessionStorage.removeItem(LOGIN_INTENT_KEY)
          clearWelcomeSignal()
        }
      }
    })

    return () => {
      mounted = false
      for (const timer of welcomeTimersRef.current) {
        window.clearTimeout(timer)
      }
      welcomeTimersRef.current = []
      subscription.unsubscribe()
    }
  }, [hasWelcomeSignal, router])


  const getAuthRedirectOrigin = () => {
    const runtimeOrigin = window.location.origin
    const hostname = window.location.hostname
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
    if (isLocalhost) return runtimeOrigin

    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
    if (!configuredSiteUrl) return runtimeOrigin

    try {
      const configuredOrigin = new URL(configuredSiteUrl).origin
      const configuredHost = new URL(configuredSiteUrl).hostname
      if (configuredHost === hostname) {
        return configuredOrigin
      }
    } catch {
      return runtimeOrigin
    }

    return runtimeOrigin
  }

  const handleSignIn = async () => {
    setError('')
    try {
      const supabase = createSupabaseBrowserClient()
      sessionStorage.setItem(LOGIN_INTENT_KEY, '1')
      const origin = getAuthRedirectOrigin()
      const redirectTo = `${origin}/auth/callback?next=/`
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (authError) throw authError
    } catch (err: unknown) {
      sessionStorage.removeItem(LOGIN_INTENT_KEY)
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

  const refreshProfileData = async () => {
    setProfileLoading(true)
    setProfileError('')

    try {
      const supabase = createSupabaseBrowserClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setProfileUser(user as ProfileUser | null)

      const [walletRes, historyRes, profileRes] = await Promise.all([
        fetch('/api/wallet/me', { cache: 'no-store' }),
        fetch('/api/global/payments/history', { cache: 'no-store' }),
        fetch('/api/profile/me', { cache: 'no-store' }),
      ])

      if (!walletRes.ok) {
        const data = await walletRes.json()
        throw new Error(data.error ?? 'Failed to load wallet')
      }

      setProfileWallet((await walletRes.json()) as WalletInfo)

      if (historyRes.ok) {
        setProfileHistory((await historyRes.json()) as ContributionHistoryItem[])
      } else {
        setProfileHistory([])
      }

      if (profileRes.ok) {
        const profileData = (await profileRes.json()) as ProfileSettingsResponse
        setProfileCountry(typeof profileData.country === 'string' && profileData.country.trim().length === 2
          ? profileData.country.trim().toUpperCase()
          : 'SG')
      } else {
        setProfileCountry('SG')
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

  const saveProfileCountry = async () => {
    setProfileCountrySaving(true)
    setProfileError('')

    try {
      const response = await fetch('/api/profile/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: profileCountry }),
      })

      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.error ?? 'Failed to save profile country')
      }
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save profile country')
    } finally {
      setProfileCountrySaving(false)
    }
  }

  const triggerMockDonation = async () => {
    // Use ref for instant synchronous guard against rapid key presses
    // (React state updates are async and can't prevent race conditions)
    if (mockDonationLock.current) {
      return
    }
    mockDonationLock.current = true
    setMockDonationRunning(true)
    try {
      const response = await fetch('/api/payments/mock-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const payload = await response.json()
      if (!response.ok) {
        setPaymentPopup({
          open: true,
          variant: 'error',
          title: 'Mock Donation Failed',
          message: payload.error ?? 'Unable to trigger mock donation payment.',
        })
        return
      }

      if (payload.mode === 'interaction_required' && payload.redirectUrl) {
        setPaymentPopup({
          open: true,
          variant: 'success',
          title: 'Bootstrap Approval Required',
          message: payload.message ?? 'Approve once, then keypress donations become instant.',
        })
        window.location.href = payload.redirectUrl
        return
      }

      setPaymentPopup({
        open: true,
        variant: 'success',
        title: 'Mock Donation Sent',
        message: `Sent ${payload.amount} ${payload.currency} from test wallet as ${payload.donor_name}.`,
      })
    } catch {
      setPaymentPopup({
        open: true,
        variant: 'error',
        title: 'Mock Donation Failed',
        message: 'Network error while triggering mock donation.',
      })
    } finally {
      setMockDonationRunning(false)
      mockDonationLock.current = false
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return
      }

      const target = event.target as HTMLElement | null
      if (target) {
        const tagName = target.tagName
        if (target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
          return
        }
      }

      if (event.key !== '1') {
        return
      }

      if (!authed) {
        setPaymentPopup({
          open: true,
          variant: 'error',
          title: 'Sign In Required',
          message: 'Sign in before triggering mock donations.',
        })
        return
      }

      event.preventDefault()
      void triggerMockDonation()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [authed, mockDonationRunning])

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

  const confirmContribution = async (contributionId: string): Promise<ConfirmContributionResponse | null> => {
    setDonationStep('confirming')

    const maxAttempts = 4
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const confirmRes = await fetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contribution_id: contributionId }),
        })

        if (confirmRes.ok) {
          const payload = (await confirmRes.json()) as ConfirmContributionResponse
          const currency = payload.currency ?? 'SGD'
          const amountText = typeof payload.amount === 'number' ? `${payload.amount} ${currency}` : null

          setDonationStep('success')
          setSuccessMessage(
            lastFlow === 'recurring'
              ? 'Recurring contribution setup is active. Scheduled charges will run via cron.'
              : lastContributionMode === 'demo'
                ? 'Donation simulated successfully (DEMO_MODE is enabled; no real wallet transaction was sent).'
                : amountText
                  ? `Donation successful: ${amountText}`
                  : 'Donation confirmed successfully!'
          )

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
          return payload
        }

        if (confirmRes.status === 409 && attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 800))
          continue
        }

        const data = await confirmRes.json()
        setDonationError(data.error ?? 'Confirmation failed.')
        setDonationStep('error')
        return null
      } catch {
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 800))
          continue
        }
        setDonationError('Network error during confirmation.')
        setDonationStep('error')
        return null
      }
    }

    setDonationError('Payment is still processing. Please check your profile for status updates.')
    setDonationStep('error')
    return null
  }

  useEffect(() => {
    const paymentState = searchParams.get('payment_state')
    const referenceId = searchParams.get('reference_id')
    const callbackAmount = searchParams.get('amount')
    const callbackCurrency = searchParams.get('currency')

    if (!paymentState || !referenceId) {
      return
    }

    const clearParams = () => {
      const url = new URL(window.location.href)
      url.searchParams.delete('payment_state')
      url.searchParams.delete('reference_id')
      url.searchParams.delete('amount')
      url.searchParams.delete('currency')
      router.replace(url.pathname + url.search, { scroll: false })
    }

    const showPopup = (variant: 'success' | 'error', title: string, message: string) => {
      setPaymentPopup({ open: true, variant, title, message })
    }

    const processCallbackResult = async () => {
      if (paymentState === 'interaction_completed') {
        const payload = await confirmContribution(referenceId)
        if (payload) {
          const amountText = typeof payload.amount === 'number'
            ? `${payload.amount} ${payload.currency ?? 'SGD'}`
            : null
          showPopup(
            'success',
            'Donation Successful',
            amountText ? `Your donation of ${amountText} has been confirmed.` : 'Your donation has been confirmed.'
          )
        } else {
          showPopup('error', 'Donation Not Confirmed', 'Payment approval completed, but confirmation did not finish successfully.')
        }
        clearParams()
        return
      }

      if (paymentState === 'payment_completed') {
        const parsedAmount = callbackAmount ? Number(callbackAmount) : NaN
        const amountText = Number.isFinite(parsedAmount)
          ? `${parsedAmount} ${callbackCurrency ?? 'SGD'}`
          : null
        showPopup(
          'success',
          'Donation Successful',
          amountText ? `Your donation of ${amountText} has been confirmed.` : 'Your donation has been confirmed.'
        )
        clearParams()
        return
      }

      if (paymentState === 'recurring_active') {
        showPopup('success', 'Recurring Setup Active', 'Your recurring contribution approval completed successfully.')
        clearParams()
        return
      }

      if (paymentState === 'grant_rejected' || paymentState === 'failed') {
        showPopup('error', 'Payment Failed', 'Wallet approval was rejected or payment failed.')
        clearParams()
        return
      }

      clearParams()
    }

    void processCallbackResult()
  }, [searchParams, router])

  const handleDonationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setDonationError('')
    setSuccessMessage('')

    const parsedAmount = Number(donationAmount)
    if (!Number.isFinite(parsedAmount) || parsedAmount < 10 || parsedAmount > 500 || parsedAmount % 1 !== 0) {
      setDonationError('Donation amount must be between $10 and $500 in increments of $1.')
      return
    }

    setDonationStep('submitting')

    const donorNameCandidate = profileUser?.user_metadata?.full_name
      ?? profileUser?.email?.split('@')[0]
      ?? 'SafePool Member'
    const donorName = String(donorNameCandidate).trim().slice(0, 120)

    try {
      const ensureMemberJoin = async () => {
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
          throw new Error(data.error ?? 'Failed to join pool.')
        }
      }

      if (isRecurring) {
        const recurringRes = await fetch('/api/recurring/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parsedAmount,
            currency: 'SGD',
            interval: recurringInterval,
            is_anonymous: isAnonymous,
            donor_name: donorName,
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

      const createOneTimeContribution = async () => fetch('/api/payments/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parsedAmount,
          currency: 'SGD',
          is_anonymous: isAnonymous,
          donor_name: donorName,
        }),
      })

      let contributeRes = await createOneTimeContribution()

      if (!contributeRes.ok) {
        const data = await contributeRes.json()
        const errorMessage = typeof data?.error === 'string' ? data.error : ''

        if (contributeRes.status === 400 && errorMessage.includes('Join SafePool first')) {
          await ensureMemberJoin()
          contributeRes = await createOneTimeContribution()
        } else {
          setDonationError(data.error ?? 'Failed to create contribution.')
          setDonationStep('error')
          return
        }
      }

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

      if (contributeData.needsInteraction && contributeData.paymentUrl) {
        window.location.href = contributeData.paymentUrl
        return
      }

      if (contributeData.mode === 'live' && contributeData.paymentUrl) {
        setApprovalUrl(contributeData.paymentUrl)
        setDonationStep('awaiting-approval')
        window.open(contributeData.paymentUrl, '_blank', 'noopener,noreferrer')
        return
      }

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

    const url = new URL(window.location.href)
    if (url.searchParams.has('payment_state') || url.searchParams.has('reference_id')) {
      url.searchParams.delete('payment_state')
      url.searchParams.delete('reference_id')
      url.searchParams.delete('amount')
      url.searchParams.delete('currency')
      router.replace(url.pathname + url.search, { scroll: false })
    }
  }

  const isModalBusy = donationStep === 'loading-wallet' || donationStep === 'submitting' || donationStep === 'confirming'

  return (
    <>
      {showWelcomeOverlay && (
        <div
          className={`fixed inset-0 z-[70] flex cursor-pointer items-center justify-center bg-zinc-900/62 backdrop-blur-sm transition-opacity duration-700 ${welcomeOverlayFading ? 'opacity-0' : 'opacity-100'
            }`}
          onClick={dismissWelcomeOverlay}
        >
          <p className="px-8 text-center text-4xl font-black uppercase tracking-[0.14em] text-white drop-shadow-[0_8px_28px_rgba(0,0,0,0.6)]">
            Welcome, {welcomeName}
          </p>
        </div>
      )}
      <div className="rounded-lg p-1">
        <div className="flex items-center gap-1">
          {!authed ? (
            <button className={itemClass} onClick={() => void handleSignIn()} type="button">
              Login
            </button>
          ) : (
            <>
<button
                className={`${itemClass} text-white/40 hover:text-white/60`}
                onClick={() => setShowGovernanceModal(true)}
                type="button"
              >
                Governance
              </button>
              <button className={itemClass} onClick={() => setShowVotingModal(true)} type="button">
                Voting
              </button>
              <button className={itemClass} onClick={() => openDonationModal()} type="button">
                Donation
              </button>
              <button className={itemClass} onClick={() => void openProfileModal()} type="button">
                Profile
              </button>
              <button className={itemClass} onClick={() => void handleSignOut()} type="button">
                Signout
              </button>
            </>
          )}
        </div>
        {error ? <p className="px-2 pt-1 text-xs text-red-300">{error}</p> : null}
      </div>

      <GovernanceModal open={showGovernanceModal} onClose={() => setShowGovernanceModal(false)} />
      <VotingModal open={showVotingModal} onClose={() => setShowVotingModal(false)} />

      {paymentPopup.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <Card className="w-[24rem] border-white/20 bg-black/90 text-white">
            <CardHeader>
              <CardTitle className={paymentPopup.variant === 'success' ? 'text-green-300' : 'text-red-300'}>
                {paymentPopup.title}
              </CardTitle>
              <CardDescription className="text-white/70">{paymentPopup.message}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => setPaymentPopup((prev) => ({ ...prev, open: false }))}
                type="button"
                variant="secondary"
              >
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {showDonationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm"
          onClick={() => setShowDonationModal(false)}
          role="presentation"
        >
          <Card className="w-[26rem] border-white/20 bg-black/85 text-white" onClick={(event) => event.stopPropagation()}>
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
                    <Input className="text-xs opacity-70" id="donation-wallet-id" readOnly value={walletInfo?.wallet_address ?? ''} />
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
                      step={1}
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
                      <div className="space-y-2 pt-1">
                        <label className="text-white/40">
                          Country
                        </label>
                        <div className="rounded-lg border border-white/10 bg-black/35 p-2">
                          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                            {COUNTRY_OPTIONS.map((option) => {
                              const selected = profileCountry === option.code
                              return (
                                <button
                                  className={`rounded-md border px-2 py-2 text-left text-xs transition-colors ${selected
                                    ? 'border-cyan-400/60 bg-cyan-500/20 text-white'
                                    : 'border-white/10 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10'}`}
                                  key={option.code}
                                  onClick={() => setProfileCountry(option.code)}
                                  type="button"
                                >
                                  <span className="mr-1.5">{countryCodeToFlag(option.code)}</span>
                                  {option.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            disabled={profileCountrySaving}
                            onClick={() => void saveProfileCountry()}
                            type="button"
                            variant="secondary"
                          >
                            {profileCountrySaving ? 'Saving...' : 'Save Country'}
                          </Button>
                        </div>
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
