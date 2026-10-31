import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  shadow?: 'none' | 'sm' | 'md' | 'lg'
  tone?: 'surface' | 'muted' | 'brand'
}

const shadows = { none: '', sm: 'neo-shadow-sm', md: 'neo-shadow', lg: 'neo-shadow-lg' }
const tones = { surface: 'bg-surface', muted: 'bg-surface-muted', brand: 'bg-brand-soft' }

/** A surface. Static panels carry no shadow; pass one only for raised or floating things. */
export function Panel({ shadow = 'none', tone = 'surface', className, ...rest }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-neo-lg border-2 border-line text-ink',
        tones[tone],
        shadows[shadow],
        className,
      )}
      {...rest}
    />
  )
}
