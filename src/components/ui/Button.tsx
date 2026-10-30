import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  /** Icon after the label (mirrors automatically in RTL when it is directional). */
  iconEnd?: ReactNode
  fullWidth?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink border-line neo-shadow hover:bg-brand-hover',
  secondary: 'bg-surface text-ink border-line neo-shadow hover:bg-surface-muted',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-paper-sunken',
  danger: 'bg-danger text-white border-line neo-shadow hover:brightness-95',
}

// md/lg meet the 44px touch-target minimum for tablets.
const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-[15px] gap-2',
  lg: 'min-h-13 px-6 text-base gap-2.5',
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: Pick<ButtonProps, 'variant' | 'size' | 'fullWidth' | 'className'>): string {
  return cn(
    'neo-btn inline-flex select-none items-center justify-center rounded-neo border-2 font-semibold',
    'cursor-pointer disabled:cursor-not-allowed disabled:opacity-55',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
    className,
  )
}

export function Button({
  variant,
  size,
  loading = false,
  icon,
  iconEnd,
  fullWidth,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
      {!loading && iconEnd}
    </button>
  )
}
