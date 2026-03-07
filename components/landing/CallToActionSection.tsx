import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function CallToActionSection() {
  return (
    <section id="cta" className="mx-auto max-w-6xl px-6 py-20">
      <div className="rounded-2xl border border-white/15 bg-gradient-to-r from-cyan-500/15 via-green-500/10 to-amber-500/10 p-8 text-center md:p-12">
        <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Ready to launch your community pool?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-white/70">
          Set up your first SafePool in minutes and simulate a disaster response flow with live payouts and analytics.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <Link href="/pools/create" className={buttonVariants({ size: 'lg' })}>
            Start a Pool
          </Link>
          <Link href="/dashboard" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            Open Dashboard
          </Link>
        </div>
      </div>
    </section>
  )
}
