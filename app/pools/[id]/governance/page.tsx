// Server Component
import { notFound } from 'next/navigation'
import GovernanceVote from '@/components/GovernanceVote'

export default function GovernancePage({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Governance</h1>
      <p className="text-white/50 mb-8">Vote on proposals to change pool rules and parameters.</p>
      <GovernanceVote poolId={params.id} />
    </div>
  )
}
