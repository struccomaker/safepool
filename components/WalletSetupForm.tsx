'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface WalletSetupFormProps {
    currentWalletAddress: string | null
    walletStatus: string | null
    onWalletUpdated?: (walletAddress: string) => void
}

export default function WalletSetupForm({ currentWalletAddress, walletStatus, onWalletUpdated }: WalletSetupFormProps) {
    const [walletInput, setWalletInput] = useState(currentWalletAddress ?? '')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
    const [displayedWallet, setDisplayedWallet] = useState(currentWalletAddress)
    const [displayedStatus, setDisplayedStatus] = useState(walletStatus)

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setFeedback(null)

        const trimmed = walletInput.trim()
        if (!trimmed) {
            setFeedback({ type: 'error', message: 'Wallet address is required.' })
            return
        }

        setIsSubmitting(true)

        try {
            const res = await fetch('/api/wallet/me', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet_address: trimmed }),
            })

            const data = await res.json()

            if (!res.ok) {
                setFeedback({ type: 'error', message: data.error ?? 'Failed to update wallet.' })
                return
            }

            setDisplayedWallet(data.wallet_address)
            setDisplayedStatus(data.status)
            setWalletInput(data.wallet_address)
            onWalletUpdated?.(data.wallet_address)
            setFeedback({ type: 'success', message: 'Wallet address updated successfully.' })
        } catch {
            setFeedback({ type: 'error', message: 'Network error. Please try again.' })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <h2 className="font-semibold mb-4">Wallet</h2>

            <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between gap-4">
                    <span className="text-white/40">Current address</span>
                    <span className="font-mono text-right text-xs break-all">
                        {displayedWallet ?? 'Not provisioned yet'}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-white/40">Status</span>
                    <span className="capitalize">{displayedStatus ?? 'manual_required'}</span>
                </div>
            </div>

            <form className="space-y-3" onSubmit={handleSubmit}>
                <div className="space-y-1">
                    <label className="text-xs text-white/60" htmlFor="wallet-address-input">
                        Update wallet address
                    </label>
                    <Input
                        id="wallet-address-input"
                        onChange={(e) => setWalletInput(e.target.value)}
                        placeholder="https://ilp.interledger-test.dev/your-handle"
                        value={walletInput}
                    />
                    <p className="text-[11px] text-white/35">
                        Must be a valid Open Payments testnet address (e.g.{' '}
                        <code className="text-white/45">https://ilp.interledger-test.dev/handle</code>)
                    </p>
                </div>

                {feedback ? (
                    <p className={`text-sm ${feedback.type === 'success' ? 'text-green-400' : 'text-red-300'}`}>
                        {feedback.message}
                    </p>
                ) : null}

                <Button className="w-full" disabled={isSubmitting} type="submit" variant="secondary">
                    {isSubmitting ? 'Updating...' : 'Save Wallet Address'}
                </Button>
            </form>
        </div>
    )
}
