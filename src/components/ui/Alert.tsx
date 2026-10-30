import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

type Tone = 'info' | 'success' | 'warning' | 'danger'

const styles: Record<Tone, { cls: string; Icon: typeof Info }> = {
  info: { cls: 'bg-brand-soft', Icon: Info },
  success: { cls: 'bg-success-soft', Icon: CheckCircle2 },
  warning: { cls: 'bg-warning-soft', Icon: AlertTriangle },
  danger: { cls: 'bg-danger-soft', Icon: XCircle },
}

/** Inline message. Icon + text, so meaning never relies on color alone. */
export function Alert({
  tone = 'info',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  const { cls, Icon } = styles[tone]
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-neo border-2 border-line p-3 text-sm font-medium text-ink',
        cls,
        className,
      )}
    >
      <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
