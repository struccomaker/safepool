export const dynamic = 'force-dynamic'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { GLOBAL_POOL_CONFIG, GLOBAL_POOL_ID } from '@/lib/global-pool'

export async function GET() {
  let interval: ReturnType<typeof setInterval> | null = null
  const admin = createSupabaseAdminClient()

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const send = async () => {
        try {
          const { data, error } = await admin
            .from('contributions')
            .select('id,amount,currency,contributed_at,pool_id,member_id')
            .eq('status', 'completed')
            .eq('pool_id', GLOBAL_POOL_ID)
            .order('contributed_at', { ascending: false })
            .limit(5)

          if (error) {
            throw new Error(`Failed to load contribution stream data: ${error.message}`)
          }

          const rows = data.map((row) => ({
            id: row.id,
            amount: row.amount,
            currency: row.currency,
            contributed_at: row.contributed_at,
            pool_id: row.pool_id,
            pool_name: GLOBAL_POOL_CONFIG.name,
            member_name: row.member_id.slice(0, 8),
          }))

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(rows)}\n\n`))
        } catch (err) {
          console.error('Contribution SSE poll failed', err)
        }
      }

      send()
      interval = setInterval(send, 5000)
    },
    cancel() {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
