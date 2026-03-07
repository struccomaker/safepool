import { insertRows, queryRows } from '@/lib/clickhouse'

interface SupabaseUserLike {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

function getDisplayName(user: SupabaseUserLike): string {
  const fullName = user.user_metadata?.full_name
  const metadataName = typeof fullName === 'string' ? fullName.trim() : ''

  if (metadataName) return metadataName
  if (user.email) return user.email.split('@')[0]
  return 'SafePool User'
}

export async function syncSupabaseUserToClickHouse(user: SupabaseUserLike): Promise<void> {
  const existing = await queryRows<{ id: string }>(
    `
    SELECT toString(id) AS id
    FROM users
    WHERE id = toUUID({id:String})
    LIMIT 1
    `,
    { id: user.id }
  )

  if (existing.length > 0) return

  await insertRows('users', [{
    id: user.id,
    email: user.email ?? '',
    name: getDisplayName(user),
  }])
}
