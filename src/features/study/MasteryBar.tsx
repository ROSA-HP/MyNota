import { cn } from '@/lib/cn'

/** Mastered / learning / new as one bar (shares of a deck or a chapter). */
export function MasteryBar({
  mastered,
  learning,
  fresh,
  label,
  className,
}: {
  mastered: number
  learning: number
  fresh: number
  label: string
  className?: string
}) {
  const total = mastered + learning + fresh || 1
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'mynota-grow-x flex h-3 w-full min-w-24 overflow-hidden rounded-full border-2 border-line bg-paper-sunken',
        className,
      )}
    >
      {mastered > 0 && (
        <span className="bg-success" style={{ width: `${(mastered / total) * 100}%` }} />
      )}
      {learning > 0 && (
        <span className="bg-warning" style={{ width: `${(learning / total) * 100}%` }} />
      )}
    </span>
  )
}
