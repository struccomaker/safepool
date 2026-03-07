import * as React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className = '', ...props }: CardProps) {
  return <div className={`rounded-xl border border-[var(--border)] bg-[var(--card)] text-white shadow-sm ${className}`.trim()} {...props} />
}

export function CardHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col space-y-1.5 p-6 ${className}`.trim()} {...props} />
}

export function CardTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`font-semibold leading-none tracking-tight ${className}`.trim()} {...props} />
}

export function CardDescription({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-sm text-white/65 ${className}`.trim()} {...props} />
}

export function CardContent({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-6 pt-0 ${className}`.trim()} {...props} />
}
