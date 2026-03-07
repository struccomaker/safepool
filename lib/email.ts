import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

interface ContributionEmailOptions {
  to: string
  amount: number
  currency: string
  poolId: string
}

export async function sendContributionEmail({ to, amount, currency, poolId }: ContributionEmailOptions) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'SafePool <noreply@safepool.app>',
    to,
    subject: `SafePool: Contribution of ${currency} ${amount} confirmed`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#22c55e;">Contribution Confirmed</h2>
        <p>Your contribution of <strong>${currency} ${amount}</strong> to pool <code>${poolId}</code> has been received and recorded.</p>
        <p>You are now covered for payouts if a qualifying disaster is detected in your area.</p>
        <hr style="border-color:#333;"/>
        <p style="color:#888;font-size:12px;">SafePool · Community Emergency Funds powered by Interledger</p>
      </div>
    `,
  })
}

interface PayoutEmailOptions {
  to: string
  amount: number
  currency: string
  poolId: string
  disasterName: string
}

export async function sendPayoutEmail({ to, amount, currency, poolId, disasterName }: PayoutEmailOptions) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'SafePool <noreply@safepool.app>',
    to,
    subject: `SafePool: Emergency payout of ${currency} ${amount} sent`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#ef4444;">Emergency Payout Sent</h2>
        <p>A disaster event was detected: <strong>${disasterName}</strong></p>
        <p>SafePool has automatically sent you an emergency payout of <strong>${currency} ${amount}</strong> via Interledger.</p>
        <p>Pool: <code>${poolId}</code></p>
        <hr style="border-color:#333;"/>
        <p style="color:#888;font-size:12px;">SafePool · Community Emergency Funds powered by Interledger</p>
      </div>
    `,
  })
}
