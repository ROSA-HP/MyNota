import { cn } from '@/lib/cn'

/** The mark keeps its light-theme colors in both themes (the owner wants one logo). */
const MARK = {
  ink: '#121c1b',
  brand: '#0f766e',
  yellow: '#fde68a',
  coral: '#ffa38f',
  sky: '#a5d8ff',
}

/** Brand mark: a tiny three-node map. The wordmark stays Latin in every language. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)} dir="ltr">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect x="4" y="4" width="26" height="26" rx="6" fill={MARK.ink} />
        <rect
          x="1.5"
          y="1.5"
          width="26"
          height="26"
          rx="6"
          fill={MARK.brand}
          stroke={MARK.ink}
          strokeWidth="2"
        />
        <path d="M11.6 12.7 17.8 9.6M11.6 15.3l6.2 3.1" stroke={MARK.ink} strokeWidth="1.6" />
        <circle cx="9" cy="14" r="3.2" fill={MARK.yellow} stroke={MARK.ink} strokeWidth="1.5" />
        <circle cx="20" cy="8.5" r="2.6" fill={MARK.coral} stroke={MARK.ink} strokeWidth="1.5" />
        <circle cx="20" cy="19.5" r="2.6" fill={MARK.sky} stroke={MARK.ink} strokeWidth="1.5" />
      </svg>
      {withText && <span className="text-xl font-bold tracking-tight text-ink">MyNota</span>}
    </span>
  )
}
