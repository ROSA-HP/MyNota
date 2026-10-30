import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only buttons need an accessible name. */
  label: string
  children: ReactNode
  bordered?: boolean
}

export function IconButton({
  label,
  children,
  bordered = true,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'neo-btn inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-neo text-ink',
        bordered
          ? 'border-2 border-line bg-surface neo-shadow-sm hover:bg-surface-muted'
          : 'hover:bg-paper-sunken',
        'disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
