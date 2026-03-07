import * as React from 'react'

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost'
type ButtonSize = 'default' | 'sm' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const baseClass =
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]/50 disabled:pointer-events-none disabled:opacity-50'

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-green-500 text-black hover:bg-green-400',
  secondary: 'bg-white/10 text-white hover:bg-white/20',
  outline: 'border border-white/20 bg-transparent text-white hover:bg-white/10',
  ghost: 'text-white/80 hover:bg-white/10 hover:text-white',
}

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-md px-3',
  lg: 'h-11 rounded-md px-8',
}

export function buttonVariants({
  variant = 'default',
  size = 'default',
  className = '',
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}) {
  return `${baseClass} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', ...props }, ref) => {
    return <button className={buttonVariants({ variant, size, className })} ref={ref} {...props} />
  }
)

Button.displayName = 'Button'
