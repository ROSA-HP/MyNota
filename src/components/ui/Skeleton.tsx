import { cn } from '@/lib/cn'

/** A loading placeholder with a soft sweep of light; size it with classes (h-*, w-*). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('mynota-skeleton', className)} />
}
