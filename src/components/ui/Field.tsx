import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  /** Optional status shown at the end of the label row (e.g. "Available"). */
  status?: ReactNode
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
  className?: string
}

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, hint, error, status, children, className }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {status}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export const controlClasses = (invalid = false) =>
  cn(
    'min-h-11 w-full rounded-neo border-2 bg-surface px-3 text-[15px] text-ink placeholder:text-ink-faint',
    'transition-[box-shadow,border-color] duration-200 focus:outline-none focus-visible:outline-none focus:neo-shadow-sm',
    invalid ? 'border-danger' : 'border-line focus:border-brand',
    'disabled:cursor-not-allowed disabled:opacity-60',
  )
