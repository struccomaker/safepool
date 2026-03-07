import * as React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = '', ...props }, ref) => {
  return (
    <input
      className={`flex h-10 w-full rounded-md border border-[var(--border)] bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      ref={ref}
      {...props}
    />
  )
})

Input.displayName = 'Input'
