'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const MAX_DONATIONS = 6

interface DonationItem {
  id: string
  member: string
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
    amount: number
    currency: string
    contributed_at: string
  }>
}

export default function RightConfigSidebar() {
  const [tick, setTick] = useState(0)
  const [donations, setDonations] = useState<DonationItem[]>([])
  const [poolBalance, setPoolBalance] = useState(0)
  const [poolCurrency, setPoolCurrency] = useState('SGD')
  const [walletAddress, setWalletAddress] = useState('')
  const [loadError, setLoadError] = useState('')

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

        const mapped: DonationItem[] = payload.donations.map((row) => ({
          id: row.id,
          member: row.member,
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
          <CardDescription>Live contributions and pool balance from SafePool backend data sources.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/55">Current pool balance</p>
            <div className="mt-1 flex items-end justify-between">
              <p className="text-lg font-semibold text-white">{poolBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} {poolCurrency}</p>
            </div>
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
                    {donation.member ? <p className="text-sm font-semibold text-white">{donation.member}</p> : null}
                  </div>
                  <span className="text-sm font-semibold text-green-300">{donation.amount.toFixed(2)} {donation.currency}</span>
                </div>
                <p className="mt-2 text-xs text-white/65">
                  {index === 0 ? 'just now' : `${Math.max(1, Math.floor((Date.now() - donation.receivedAt) / 1000))}s ago`}
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
