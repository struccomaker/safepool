export const dynamic = 'force-dynamic'

import client from '@/lib/clickhouse'

export async function GET() {
  let interval: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const send = async () => {
        try {
          const result = await client.query({
            query: `
              SELECT
                c.id,
                c.amount,
                c.currency,
                c.contributed_at,
                c.pool_id,
                p.name AS pool_name,
                substring(c.member_id, 1, 8) AS member_name
              FROM contributions c
              JOIN pools p ON c.pool_id = p.id
              WHERE c.status = 'completed'
              ORDER BY c.contributed_at DESC
              LIMIT 5
            `,
            format: 'JSONEachRow',
          })
          const rows = await result.json()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(rows)}\n\n`))
        } catch {
          // Silently skip on error — stream stays alive
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
