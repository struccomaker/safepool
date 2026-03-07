'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const APP_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/pool', label: 'Pool' },
  { href: '/disasters', label: 'Disasters' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/profile', label: 'Profile' },
]

const HOME_LINKS = [
  { href: '/#home', label: 'Home' },
  { href: '/#stats', label: 'Stats' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#highlights', label: 'Highlights' },
  { href: '/#cta', label: 'Start' },
]

export default function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const links = isHome ? HOME_LINKS : APP_LINKS

  return (
    <nav className="sticky top-0 z-50 border-b border-white/8 bg-[var(--background)]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-white">Safe</span>
          <span className="text-green-400">Pool</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                !isHome && pathname.startsWith(link.href)
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <Link
          href={isHome ? '/dashboard' : '/pools/create'}
          className="px-4 py-1.5 bg-green-500 hover:bg-green-400 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {isHome ? 'Open App' : '+ Pool'}
        </Link>
      </div>
    </nav>
  )
}
