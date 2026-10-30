import { cn } from '@/lib/cn'

/** Brand mark: a tiny three-node map. The wordmark stays Latin in every language. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)} dir="ltr">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect x="4" y="4" width="26" height="26" rx="6" fill="var(--shadow)" />
        <rect
          x="1.5"
          y="1.5"
          width="26"
          height="26"
          rx="6"
          fill="var(--brand)"
          stroke="var(--line)"
          strokeWidth="2"
        />
        <path d="M11.6 12.7 17.8 9.6M11.6 15.3l6.2 3.1" stroke="var(--line)" strokeWidth="1.6" />
        <circle
          cx="9"
          cy="14"
          r="3.2"
          fill="var(--ch-yellow)"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <circle
          cx="20"
          cy="8.5"
          r="2.6"
          fill="var(--ch-coral)"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <circle
          cx="20"
          cy="19.5"
          r="2.6"
          fill="var(--ch-sky)"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
      </svg>
      {withText && <span className="text-xl font-bold tracking-tight text-ink">MyNota</span>}
    </span>
  )
}
