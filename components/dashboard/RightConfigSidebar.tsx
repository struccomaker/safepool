'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const MAX_DONATIONS = 6
const MIN_DONATION_INTERVAL_MS = 5000
const MAX_DONATION_INTERVAL_MS = 20000

const FIRST_NAMES = ['Maria', 'Jose', 'Ana', 'Luis', 'Carmen', 'Miguel', 'Aisha', 'Ravi', 'Sofia', 'Daniel']
const LAST_NAMES = ['Santos', 'Reyes', 'Dela Cruz', 'Garcia', 'Lopez', 'Khan', 'Patel', 'Fernandez', 'Tan', 'Mendoza']

interface DonationItem {
  id: string
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

interface HistoryEntry {
  id: string
  amount: number
  currency: string
  contributed_at: string
  status: string
}

function buildDonation(sequence: number, id: string): DonationItem {
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
  const seenIdsRef = useRef(new Set<string>())
  const [tick, setTick] = useState(MAX_DONATIONS)
  const [donations, setDonations] = useState<DonationItem[]>(() => {
    const seed = Array.from({ length: MAX_DONATIONS }, (_, index) => {
      const id = `fake-${index + 1}`
      return buildDonation(index + 1, id)
    }).reverse()
    for (const d of seed) seenIdsRef.current.add(d.id)
    return seed
  })
  const [poolBalance, setPoolBalance] = useState(() => donations.reduce((sum, donation) => sum + donation.amount, 0))

  // Seed with real contribution history on mount
  useEffect(() => {
    let cancelled = false

    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/global/payments/history', { cache: 'no-store' })
        if (!res.ok) return

        const history = (await res.json()) as HistoryEntry[]
        if (cancelled || history.length === 0) return

        const realDonations: DonationItem[] = history
          .filter((entry) => entry.status === 'completed')
          .slice(0, MAX_DONATIONS)
          .map((entry) => ({
            id: entry.id,
            member: `$${Number(entry.amount).toFixed(0)} donor`,
            amount: Number(entry.amount),
            receivedAt: new Date(entry.contributed_at).getTime(),
            recurring: false,
          }))

        if (realDonations.length > 0) {
          for (const d of realDonations) seenIdsRef.current.add(d.id)
          setDonations((current) => {
            const merged = [...realDonations, ...current]
            // Deduplicate by id
            const seen = new Set<string>()
            return merged.filter((d) => {
              if (seen.has(d.id)) return false
              seen.add(d.id)
              return true
            }).slice(0, MAX_DONATIONS)
          })
          setPoolBalance((current) => current + realDonations.reduce((sum, d) => sum + d.amount, 0))
        }
      } catch {
        // Silently fail — fake data still shows
      }
    }

    void fetchHistory()

    return () => {
      cancelled = true
    }
  }, [])

  // Fake donation generation timer (demo fallback)
  useEffect(() => {
    let cancelled = false

    const queueNextDonation = () => {
      const delay = getRandomIntervalMs()
      timeoutRef.current = window.setTimeout(() => {
        if (cancelled) return

        sequenceRef.current += 1
        const nextDonation = buildDonation(sequenceRef.current, `fake-${nextIdRef.current}`)
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

  // Listen for real donation events from the donation modal
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
        id: `manual-${nextIdRef.current}`,
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
            <Badge variant="outline">Incoming</Badge>
          </CardTitle>
          <CardDescription>Real-time contributions into the SafePool global fund.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {donations.map((donation) => (
            <div className="rounded-md border border-white/10 bg-white/5 p-3" key={`${donation.member}-${donation.time}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{donation.member}</p>
                  <p className="text-xs text-white/65">{donation.pool}</p>
                </div>
                <span className="text-sm font-semibold text-white">{donation.amount}</span>
              </div>
              <p className="mt-2 text-xs text-white/65">{donation.time}</p>
            </div>
          ))}
          <Button className="w-full" variant="secondary">
            View All Donations
          </Button>
        </CardContent>
      </Card>
    </aside>
  )
}
