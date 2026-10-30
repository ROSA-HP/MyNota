import { cn } from '@/lib/cn'

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full border-2 border-current border-e-transparent',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span className="sr-only">…</span>
    </span>
  )
}
