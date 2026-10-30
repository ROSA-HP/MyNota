import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'bg-paper-sunken text-ink',
  brand: 'bg-brand-soft text-ink',
  success: 'bg-success-soft text-ink',
  warning: 'bg-warning-soft text-ink',
  danger: 'bg-danger-soft text-ink',
}

/** Small label in Space Mono (numbers and badges only, per the design system). */
export function Badge({
  tone = 'neutral',
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border-2 border-line px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none',
        tones[tone],
        className,
      )}
      {...rest}
    />
  )
}
