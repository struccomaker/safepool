import Link from 'next/link'
import GlobeScene from '@/components/GlobeScene'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'

export default function HeroSection() {
  return (
    <section id="home" className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-80">
        <GlobeScene />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/20 via-[var(--background)]/65 to-[var(--background)]" />

      <div className="mx-auto flex min-h-[70vh] max-w-6xl flex-col items-center justify-center px-6 py-24 text-center">
        <Badge className="mb-6 bg-cyan-400/20 text-cyan-100">Hackomania 2026 Demo</Badge>
        <h1 className="max-w-4xl text-5xl font-bold tracking-tight text-white md:text-7xl">
          Community emergency funds with instant disaster payouts
        </h1>
        <p className="mt-6 max-w-2xl text-base text-white/70 md:text-lg">
          SafePool lets members pool micro-contributions and automatically sends Open Payments transfers when verified
          disasters hit their area.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link href="/pools" className={buttonVariants({ size: 'lg' })}>
            Browse Pools
          </Link>
          <Link href="/pools/create" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Create Pool
          </Link>
        </div>
      </div>
    </section>
  )
}
