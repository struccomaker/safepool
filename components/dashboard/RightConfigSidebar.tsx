'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const MAX_DONATIONS = 6

interface DonationItem {
  id: string
  member: string
  country: string
  isAnonymous: boolean
  amount: number
  currency: string
  receivedAt: number
}

interface SidebarResponse {
  wallet: {
    address: string
    assetCode: string
    assetScale: number
  }
  current_pool_balance: number
  donations: Array<{
    id: string
    member: string
    country: string
    is_anonymous: boolean
    amount: number
    currency: string
    contributed_at: string
  }>
}

function countryCodeToFlag(countryCode: string): string {
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) {
    return '🌐'
  }
  const points = [...code].map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...points)
}

function countryCodeToName(countryCode: string): string {
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) {
    return 'Unknown country'
  }

  if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined') {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
    return displayNames.of(code) ?? 'Unknown country'
  }

  const fallbackNames: Record<string, string> = {
    SG: 'Singapore',
    PH: 'Philippines',
    MY: 'Malaysia',
    ID: 'Indonesia',
    TH: 'Thailand',
    VN: 'Vietnam',
    IN: 'India',
    JP: 'Japan',
    KR: 'South Korea',
    US: 'United States',
    GB: 'United Kingdom',
  }
  return fallbackNames[code] ?? 'Unknown country'
}

function stripLeadingCountryPrefix(member: string, countryCode: string): string {
  const code = countryCode.trim().toUpperCase()
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefixPattern = new RegExp(`^(?:[^\\p{L}\\p{N}]*\\s*)?${escaped}\\s+`, 'iu')
  return member.replace(prefixPattern, '').trim() || member
}

function formatElapsed(receivedAt: number): string {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - receivedAt) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}h ${minutes}m ${seconds}s ago`
}

export default function RightConfigSidebar() {
  const [tick, setTick] = useState(0)
  const [donations, setDonations] = useState<DonationItem[]>([])
  const [poolBalance, setPoolBalance] = useState(0)
  const [poolCurrency, setPoolCurrency] = useState('SGD')
  const [walletAddress, setWalletAddress] = useState('')
  const [loadError, setLoadError] = useState('')
  const [payoutDeduction, setPayoutDeduction] = useState(0)

  useEffect(() => {
    const handleDeduction = (e: Event) => {
      const amount = (e as CustomEvent<{ amount: number }>).detail.amount
      if (Number.isFinite(amount) && amount > 0) {
        setPayoutDeduction(amount)
      }
    }
    const handleEnd = () => {
      setPayoutDeduction(0)
    }

    window.addEventListener('safepool:pool-deducted', handleDeduction)
    window.addEventListener('safepool:earthquake-end', handleEnd)
    return () => {
      window.removeEventListener('safepool:pool-deducted', handleDeduction)
      window.removeEventListener('safepool:earthquake-end', handleEnd)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let interval: ReturnType<typeof setInterval> | null = null

    const loadSidebar = async () => {
      try {
        const res = await fetch('/api/global/donations/sidebar', { cache: 'no-store' })
        if (!res.ok) {
          const payload = await res.json()
          throw new Error(payload.error ?? 'Failed to load donation sidebar')
        }

        const payload = (await res.json()) as SidebarResponse
        if (!mounted) {
          return
        }

        const mapped: DonationItem[] = payload.donations
          .filter((row) => Number(row.amount) > 0)
          .map((row) => ({
            id: row.id,
            member: row.member,
            country: row.country,
            isAnonymous: Boolean(row.is_anonymous),
            amount: Number(row.amount),
            currency: row.currency,
            receivedAt: new Date(row.contributed_at).getTime(),
          }))

        setDonations(mapped.slice(0, MAX_DONATIONS))
        setPoolBalance(Number(payload.current_pool_balance))
        setPoolCurrency(payload.wallet.assetCode)
        setWalletAddress(payload.wallet.address)
        setTick((current) => current + 1)
        setLoadError('')
      } catch (err) {
        if (!mounted) {
          return
        }
        const message = err instanceof Error ? err.message : 'Failed to load donation sidebar'
        setLoadError(message)
      }
    }

    void loadSidebar()
    interval = setInterval(() => {
      void loadSidebar()
    }, 5000)

    return () => {
      mounted = false
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [])

  const livePulse = useMemo(() => (tick % 2 === 0 ? 'bg-green-400' : 'bg-emerald-300'), [tick])

  return (
    <aside className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Donation Notifications
            <Badge className="gap-1 border-0 bg-white/10 text-white" variant="outline">
              <span className={`h-2 w-2 rounded-full ${livePulse}`} />
              Live
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/55">Current pool balance</p>
            <div className="mt-1 flex items-end justify-between">
              <p className={`text-lg font-semibold ${payoutDeduction > 0 ? 'text-red-400' : 'text-white'}`}>
                {Math.max(0, poolBalance - payoutDeduction).toLocaleString(undefined, { maximumFractionDigits: 2 })} {poolCurrency}
              </p>
            </div>
            {payoutDeduction > 0 && (
              <p className="mt-1 text-xs text-red-400/70">
                -{payoutDeduction.toLocaleString(undefined, { maximumFractionDigits: 2 })} {poolCurrency} (disaster payout)
              </p>
            )}
            {walletAddress ? <p className="mt-2 truncate text-[11px] text-white/50">Wallet: {walletAddress}</p> : null}
          </div>

          {loadError ? <p className="text-xs text-red-300">{loadError}</p> : null}

          <div className="max-h-[28rem] space-y-3 overflow-hidden">
            {donations.map((donation, index) => (
              <div
                className="rounded-md border border-white/10 bg-white/5 p-3 transition-opacity duration-500"
                key={donation.id}
                style={{ opacity: Math.max(0.22, 1 - index * 0.14) }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {donation.member ? (
                      <div className="flex items-center gap-2">
                        {!donation.isAnonymous ? (
                          <span
                            className="group relative inline-flex items-center gap-1 rounded-md border border-cyan-400/50 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-cyan-100"
                            title={countryCodeToName(donation.country)}
                          >
                            <span>{donation.country}</span>
                          </span>
                        ) : null}
                        <p className="text-sm font-semibold text-white">
                          {donation.isAnonymous ? 'anon' : stripLeadingCountryPrefix(donation.member, donation.country)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <span className="text-sm font-semibold text-green-300">{donation.amount.toFixed(2)} {donation.currency}</span>
                </div>
                <p className="mt-2 text-xs text-white/65">
                  {formatElapsed(donation.receivedAt)}
                </p>
              </div>
            ))}
            {donations.length === 0 ? <p className="text-xs text-white/60">No confirmed contributions yet.</p> : null}
          </div>
        </CardContent>
      </Card>
    </aside>
  )
}
