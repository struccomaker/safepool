'use client'

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { signIn, signOut } from 'next-auth/react'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface TopNavigationMenuProps {
  isAuthenticated?: boolean
}

const itemClass =
  'inline-flex h-9 items-center justify-center rounded-md px-4 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white'

type NavAction = 'login' | 'governance' | 'donation' | 'signout'

const actionMeta: Record<NavAction, { title: string; description: string; href: string; cta: string }> = {
  login: {
    title: 'Login',
    description: 'Authenticate to access governance and donation actions.',
    href: '/api/auth/signin',
    cta: 'Continue to Login',
  },
  governance: {
    title: 'Governance',
    description: 'Open the governance workspace for pool proposals and voting.',
    href: '/pools/1/governance',
    cta: 'Open Governance',
  },
  donation: {
    title: 'Donation',
    description: 'Go to the donation workflow for active disasters and pools.',
    href: '/donate',
    cta: 'Open Donation',
  },
  signout: {
    title: 'Signout',
    description: 'End your current SafePool session securely.',
    href: '/api/auth/signout',
    cta: 'Sign Out',
  },
}

export default function TopNavigationMenu({ isAuthenticated = false }: TopNavigationMenuProps) {
  const [activeAction, setActiveAction] = useState<NavAction | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const activeMeta = useMemo(() => (activeAction ? actionMeta[activeAction] : null), [activeAction])

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginError(null)
    setIsSubmitting(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl: '/dashboard',
    })

    setIsSubmitting(false)

    if (!result || result.error) {
      setLoginError('Login failed. Please verify your credentials.')
      return
    }

    window.location.href = result.url ?? '/dashboard'
  }

  const closeOverlay = () => {
    setActiveAction(null)
    setLoginError(null)
  }

  return (
    <>
      <NavigationMenu className="rounded-lg bg-black/45 p-1 backdrop-blur-sm">
        <NavigationMenuList>
          {!isAuthenticated ? (
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <button className={itemClass} onClick={() => setActiveAction('login')} type="button">
                  Login
                </button>
              </NavigationMenuLink>
            </NavigationMenuItem>
          ) : (
            <>
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <button className={itemClass} onClick={() => setActiveAction('governance')} type="button">
                    Governance
                  </button>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <button className={itemClass} onClick={() => setActiveAction('donation')} type="button">
                    Donation
                  </button>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <button className={itemClass} onClick={() => setActiveAction('signout')} type="button">
                    Signout
                  </button>
                </NavigationMenuLink>
              </NavigationMenuItem>
            </>
          )}
        </NavigationMenuList>
      </NavigationMenu>

      {activeMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          {activeAction === 'login' ? (
            <Card className="w-[24rem] border-white/20 bg-black/80 text-white">
              <CardHeader>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription className="text-white/70">
                  Login to continue to governance and donation actions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleLoginSubmit}>
                  <div className="space-y-2">
                    <label className="text-sm text-white/75" htmlFor="email">
                      Email
                    </label>
                    <Input
                      autoComplete="email"
                      id="email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                      type="email"
                      value={email}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-white/75" htmlFor="password">
                      Password
                    </label>
                    <Input
                      autoComplete="current-password"
                      id="password"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      required
                      type="password"
                      value={password}
                    />
                  </div>
                  {loginError && <p className="text-sm text-red-300">{loginError}</p>}
                  <div className="flex gap-2">
                    <Button className="w-full" onClick={closeOverlay} type="button" variant="outline">
                      Cancel
                    </Button>
                    <Button className="w-full" disabled={isSubmitting} type="submit" variant="secondary">
                      {isSubmitting ? 'Signing in...' : 'Login'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="w-[22rem] border-white/20 bg-black/80 text-white">
              <CardHeader>
                <CardTitle>{activeMeta.title}</CardTitle>
                <CardDescription className="text-white/70">{activeMeta.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button className="w-full" onClick={closeOverlay} variant="outline">
                  Close
                </Button>
                {activeAction === 'signout' ? (
                  <Button
                    className="w-full"
                    onClick={() => {
                      void signOut({ callbackUrl: '/' })
                    }}
                    variant="secondary"
                  >
                    {activeMeta.cta}
                  </Button>
                ) : (
                  <Link className="w-full" href={activeMeta.href}>
                    <Button className="w-full" variant="secondary">
                      {activeMeta.cta}
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
