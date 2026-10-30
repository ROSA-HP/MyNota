import type { ReactNode, SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Field, controlClasses } from './Field'

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  options: Array<{ value: string; label: string; lang?: string }>
}

export function SelectField({ label, hint, error, options, className, ...rest }: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(controlClasses(invalid), 'cursor-pointer appearance-none pe-10')}
            {...rest}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value} lang={o.lang}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={18}
            aria-hidden
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2"
          />
        </div>
      )}
    </Field>
  )
}
