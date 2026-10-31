import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { useToasts, type ToastTone } from './toast'

const icons: Record<ToastTone, typeof Info> = { info: Info, success: CheckCircle2, danger: XCircle }
const tones: Record<ToastTone, string> = {
  info: 'bg-surface',
  success: 'bg-success-soft',
  danger: 'bg-danger-soft',
}

export function Toaster() {
  const { t } = useTranslation()
  const { toasts, dismiss } = useToasts()
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => {
        const Icon = icons[toast.tone]
        return (
          <div
            key={toast.id}
            role={toast.tone === 'danger' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-neo border-2 border-line px-4 py-3 text-sm font-semibold text-ink neo-shadow',
              tones[toast.tone],
            )}
          >
            <Icon size={18} aria-hidden className="shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={t('common.close')}
              className="-me-1 flex size-8 cursor-pointer items-center justify-center rounded-md pointer-coarse:size-11 hover:bg-paper-sunken"
            >
              <X size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
