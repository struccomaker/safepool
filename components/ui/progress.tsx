import * as React from 'react'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

export function Progress({ className = '', value = 0, ...props }: ProgressProps) {
  const safeValue = Math.min(100, Math.max(0, value))

  return (
    <div
      className={`relative h-2 w-full overflow-hidden rounded-full bg-white/15 ${className}`.trim()}
      {...props}
    >
      <div
        className="h-full bg-white transition-all duration-300 ease-out"
        style={{ transform: `translateX(-${100 - safeValue}%)` }}
      />
    </div>
  )
}
