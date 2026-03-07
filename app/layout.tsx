import type { Metadata } from 'next'
import './globals.css'
import LedTicker from '@/components/LedTicker'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'SafePool — Community Emergency Funds',
  description: 'Pool contributions, automate ILP payouts when disasters strike.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        {/* NASDAQ-style amber LED ticker at top */}
        <LedTicker />
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  )
}
