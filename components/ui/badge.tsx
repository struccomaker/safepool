import * as React from 'react'

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outline'
}

export function Badge({ className = '', variant = 'default', ...props }: BadgeProps) {
  const variantClass =
    variant === 'outline'
      ? 'border border-white/20 bg-transparent text-white/80'
      : 'border border-transparent bg-white/10 text-white'

  return (
    <div
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${variantClass} ${className}`.trim()}
      {...props}
    />
  )
}
