export interface ErrorLike {
  message?: string
  description?: string
  status?: number
  code?: string
}

export function formatError(err: unknown, fallbackMessage = 'Internal error'): string {
  if (typeof err !== 'object' || err === null) {
    return fallbackMessage
  }

  const e = err as ErrorLike
  const parts = [
    e.message,
    e.description,
    typeof e.status === 'number' ? `status=${e.status}` : undefined,
    e.code ? `code=${e.code}` : undefined,
  ].filter((value): value is string => Boolean(value && value.trim().length > 0))

  if (parts.length === 0) {
    return fallbackMessage
  }

  return parts.join(' | ')
}

export function formatOpenPaymentsError(err: unknown): string {
  return formatError(err, 'Open Payments error')
}
