import { NextResponse } from 'next/server'
import { queryRows, runCommand, toClickHouseDateTime } from '@/lib/clickhouse'
import { sendContributionEmail } from '@/lib/email'

interface ConfirmBody {
  contribution_id: string
  member_email?: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  try {
    const body = await req.json() as ConfirmBody

    if (!body.contribution_id) {
      return NextResponse.json({ error: 'contribution_id required' }, { status: 400 })
    }

    if (!UUID_REGEX.test(body.contribution_id)) {
      return NextResponse.json({ error: 'Invalid contribution_id' }, { status: 400 })
    }

    const completedRows = await queryRows<{ id: string }>(
      `SELECT id FROM contributions WHERE id = {id:String} LIMIT 1`,
      { id: body.contribution_id }
    )

    if (completedRows.length > 0) {
      return NextResponse.json({ id: body.contribution_id }, { status: 200 })
    }

    // Look up the pending contribution
    const rows = await queryRows<{
      id: string
      pool_id: string
      member_id: string
      amount: number
      currency: string
      incoming_payment_id: string
    }>(
      `SELECT id, pool_id, member_id, amount, currency, incoming_payment_id
       FROM pending_contributions
       WHERE id = {id:String}
       LIMIT 1`,
      { id: body.contribution_id }
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Contribution not found' }, { status: 404 })
    }
    const contribution = rows[0]

    const contributedAt = toClickHouseDateTime(new Date())

    await runCommand(
      `
      INSERT INTO contributions
        (id, pool_id, member_id, amount, currency, incoming_payment_id, contributed_at, status)
      SELECT
        toUUID({id:String}),
        toUUID({pool_id:String}),
        toUUID({member_id:String}),
        toDecimal64({amount:Float64}, 6),
        {currency:String},
        {incoming_payment_id:String},
        parseDateTimeBestEffort({contributed_at:String}),
        'completed'
      WHERE NOT EXISTS (
        SELECT 1 FROM contributions WHERE id = toUUID({id:String})
      )
      `,
      {
        id: contribution.id,
        pool_id: contribution.pool_id,
        member_id: contribution.member_id,
        amount: contribution.amount,
        currency: contribution.currency,
        incoming_payment_id: contribution.incoming_payment_id,
        contributed_at: contributedAt,
      }
    )

    // Send confirmation email (non-blocking)
    if (body.member_email) {
      sendContributionEmail({
        to: body.member_email,
        amount: Number(contribution.amount),
        currency: contribution.currency,
        poolId: contribution.pool_id,
      }).catch(console.error)
    }

    return NextResponse.json({ id: body.contribution_id }, { status: 200 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
