import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui'
import type { Availability } from './useUsernameAvailability'

export function UsernameStatus({ state }: { state: Availability }) {
  const { t } = useTranslation()
  if (state === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
        <Spinner size={12} /> {t('auth.signUp.usernameChecking')}
      </span>
    )
  }
  if (state === 'available') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
        <Check size={14} aria-hidden /> {t('auth.signUp.usernameAvailable')}
      </span>
    )
  }
  return null
}
