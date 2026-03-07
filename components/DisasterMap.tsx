'use client'
import dynamic from 'next/dynamic'
import type { DisasterEvent } from '@/types'

const MapComponent = dynamic(() => import('./DisasterMapInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-gray-500">
      Loading map...
    </div>
  ),
})

export default function DisasterMap({ disasters, events }: { disasters?: DisasterEvent[]; events?: DisasterEvent[] }) {
  const data = events ?? disasters ?? []
  return <MapComponent events={data} />
}
