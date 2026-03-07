'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const POOL_NAME = 'Metro Manila Emergency Pool'
const MAX_DONATIONS = 6
const MIN_DONATION_INTERVAL_MS = 5000
const MAX_DONATION_INTERVAL_MS = 20000

const FIRST_NAMES = ['Maria', 'Jose', 'Ana', 'Luis', 'Carmen', 'Miguel', 'Aisha', 'Ravi', 'Sofia', 'Daniel']
const LAST_NAMES = ['Santos', 'Reyes', 'Dela Cruz', 'Garcia', 'Lopez', 'Khan', 'Patel', 'Fernandez', 'Tan', 'Mendoza']

interface DonationItem {
  id: number
  member: string
  amount: number
  receivedAt: number
  recurring: boolean
}

interface DonationCreatedEventDetail {
  walletId: string
  amount: number
  recurring: boolean
  anonymous: boolean
}

function buildDonation(sequence: number, id: number): DonationItem {
  const firstName = FIRST_NAMES[sequence % FIRST_NAMES.length]
  const lastName = LAST_NAMES[(sequence * 3) % LAST_NAMES.length]
  const amount = (((sequence * 7) % 50) + 1) * 10

  return {
    id,
    member: `${firstName} ${lastName.charAt(0)}.`,
    amount,
    receivedAt: Date.now(),
    recurring: false,
  }
}

function getRandomIntervalMs() {
  return Math.floor(Math.random() * (MAX_DONATION_INTERVAL_MS - MIN_DONATION_INTERVAL_MS + 1)) + MIN_DONATION_INTERVAL_MS
}

export default function RightConfigSidebar() {
  const sequenceRef = useRef(MAX_DONATIONS)
  const nextIdRef = useRef(MAX_DONATIONS + 1)
  const timeoutRef = useRef<number | null>(null)
  const [tick, setTick] = useState(MAX_DONATIONS)
  const [donations, setDonations] = useState<DonationItem[]>(() => {
    const seed = Array.from({ length: MAX_DONATIONS }, (_, index) => buildDonation(index + 1, index + 1)).reverse()
    return seed
  })
  const [poolBalance, setPoolBalance] = useState(() => donations.reduce((sum, donation) => sum + donation.amount, 0))

  useEffect(() => {
    let cancelled = false

    const queueNextDonation = () => {
      const delay = getRandomIntervalMs()
      timeoutRef.current = window.setTimeout(() => {
        if (cancelled) return

        sequenceRef.current += 1
        const nextDonation = buildDonation(sequenceRef.current, nextIdRef.current)
        nextIdRef.current += 1

        setTick(sequenceRef.current)
        setDonations((currentDonations) => [nextDonation, ...currentDonations].slice(0, MAX_DONATIONS))
        setPoolBalance((currentBalance) => currentBalance + nextDonation.amount)

        queueNextDonation()
      }, delay)
    }

    queueNextDonation()

    return () => {
      cancelled = true
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handleManualDonation = (event: Event) => {
      const detail = (event as CustomEvent<DonationCreatedEventDetail>).detail
      if (!detail) return

      const amount = Number(detail.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return
      }

      const trimmedWalletId = detail.walletId.trim()
      if (!trimmedWalletId) {
        return
      }

      const walletLabel =
        trimmedWalletId.length > 14
          ? `${trimmedWalletId.slice(0, 6)}...${trimmedWalletId.slice(-4)}`
          : trimmedWalletId

      const donation: DonationItem = {
        id: nextIdRef.current,
        member: detail.anonymous ? '' : `Wallet ${walletLabel}`,
        amount,
        receivedAt: Date.now(),
        recurring: Boolean(detail.recurring),
      }

      nextIdRef.current += 1
      setTick((current) => current + 1)
      setDonations((currentDonations) => [donation, ...currentDonations].slice(0, MAX_DONATIONS))
      setPoolBalance((currentBalance) => currentBalance + amount)
    }

    window.addEventListener('safepool:donation-created', handleManualDonation as EventListener)

    return () => {
      window.removeEventListener('safepool:donation-created', handleManualDonation as EventListener)
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
          <CardDescription>Deterministic feed simulating real-time contributions into one active pool.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/55">Current pool balance</p>
            <div className="mt-1 flex items-end justify-between">
              <p className="text-lg font-semibold text-white">${poolBalance.toLocaleString()}</p>
            </div>
          </div>

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
                    {donation.recurring ? <p className="mt-1 text-[10px] uppercase tracking-wide text-cyan-300">Recurring</p> : null}
                  </div>
                  <span className="text-sm font-semibold text-green-300">${donation.amount.toFixed(2)}</span>
                </div>
                <p className="mt-2 text-xs text-white/65">
                  {index === 0 ? 'just now' : `${Math.max(1, Math.floor((Date.now() - donation.receivedAt) / 1000))}s ago`}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </aside>
  )
}
