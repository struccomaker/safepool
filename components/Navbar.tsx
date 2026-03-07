'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/pools', label: 'Pools' },
  { href: '/disasters', label: 'Disasters' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/profile', label: 'Profile' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 border-b border-white/8 bg-[var(--background)]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-white">Safe</span>
          <span className="text-green-400">Pool</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                pathname.startsWith(link.href)
                  ? 'text-white bg-white/10'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <Link
          href="/pools/create"
          className="px-4 py-1.5 bg-green-500 hover:bg-green-400 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          + Pool
        </Link>
      </div>
    </nav>
  )
}
