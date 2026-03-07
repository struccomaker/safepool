import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import Providers from '@/components/Providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SafePool — Community Emergency Funds',
  description: 'Automated community emergency fund with Interledger payouts',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#050508] text-white min-h-screen`}>
        <Providers>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  )
}
