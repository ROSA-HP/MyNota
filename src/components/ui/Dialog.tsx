import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/** Native <dialog>: focus trap, Esc to close and top-layer stacking come from the browser. */
export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose() // backdrop click
      }}
      className={cn(
        'm-auto w-[min(92vw,30rem)] rounded-neo-lg border-2 border-line bg-surface p-0 text-ink neo-shadow-lg',
        'backdrop:bg-[#121c1b]/50',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b-2 border-line px-5 py-3">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="flex size-10 cursor-pointer items-center justify-center rounded-neo hover:bg-paper-sunken pointer-coarse:size-11"
        >
          <X size={20} />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && (
        <div className="flex justify-end gap-2 border-t-2 border-line px-5 py-3">{footer}</div>
      )}
    </dialog>
  )
}
