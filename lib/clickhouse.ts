import { createClient } from '@clickhouse/client'

type ClickHouseQueryParams = Record<string, unknown>
type ClickHouseInsertRow = Record<string, unknown>

const url = process.env.CLICKHOUSE_HOST ?? 'http://localhost:8123'
const username = process.env.CLICKHOUSE_USER ?? 'default'
const password = process.env.CLICKHOUSE_PASSWORD ?? ''
const database = process.env.CLICKHOUSE_DATABASE ?? 'safepool'
const requestTimeout = Number(process.env.CLICKHOUSE_REQUEST_TIMEOUT_MS ?? '30000')

const client = createClient({
  url,
  username,
  password,
  database,
  request_timeout: Number.isFinite(requestTimeout) ? requestTimeout : 30000,
})

export async function queryRows<T extends ClickHouseInsertRow>(
  query: string,
  queryParams?: ClickHouseQueryParams
): Promise<T[]> {
  const result = await client.query({
    query,
    query_params: queryParams,
    format: 'JSONEachRow',
  })

  return (await result.json()) as T[]
}

export async function insertRows<T extends ClickHouseInsertRow>(table: string, values: T[]): Promise<void> {
  if (values.length === 0) return

  await client.insert({
    table,
    values,
    format: 'JSONEachRow',
  })
}

export async function runCommand(query: string, queryParams?: ClickHouseQueryParams): Promise<void> {
  await client.command({
    query,
    query_params: queryParams,
  })
}

export function toClickHouseDateTime(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

export default client
