import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Field, controlClasses } from './Field'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  status?: ReactNode
  /** Force LTR for values like email and username inside an RTL page. */
  ltr?: boolean
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, status, ltr, className, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} status={status} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          dir={ltr ? 'ltr' : undefined}
          className={cn(controlClasses(invalid), ltr && 'text-start [unicode-bidi:plaintext]')}
          {...rest}
        />
      )}
    </Field>
  )
})

export const PasswordField = forwardRef<HTMLInputElement, Omit<TextFieldProps, 'type' | 'ltr'>>(
  function PasswordField({ label, hint, error, status, className, ...rest }, ref) {
    const { t } = useTranslation()
    const [visible, setVisible] = useState(false)
    return (
      <Field label={label} hint={hint} error={error} status={status} className={className}>
        {({ id, describedBy, invalid }) => (
          <div className="relative">
            <input
              ref={ref}
              id={id}
              type={visible ? 'text' : 'password'}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={cn(controlClasses(invalid), 'pe-12')}
              {...rest}
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
              aria-pressed={visible}
              className="absolute inset-y-0 end-0 flex w-11 cursor-pointer items-center justify-center rounded-e-neo text-ink-muted hover:text-ink"
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        )}
      </Field>
    )
  },
)
