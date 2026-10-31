import { useState } from 'react'
import type { ParseKeys } from 'i18next'
import { MailCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { Alert, Button, buttonClasses } from '@/components/ui'
import { authRedirect, supabase } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { authErrorKey } from './errors'

export function CheckEmailPage() {
  const { t } = useTranslation()
  const email = (useLocation().state as { email?: string } | null)?.email
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<ParseKeys | null>(null)

  async function resend() {
    if (!email) return
    setState('sending')
    setError(null)
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirect('/auth/callback') },
    })
    if (err) {
      setError(authErrorKey(err))
      setState('idle')
    } else {
      setState('sent')
    }
  }

  return (
    <AuthLayout title={t('auth.checkEmail.title')}>
      <div className="flex flex-col gap-4">
        <div className="flex size-14 items-center justify-center rounded-neo-lg border-2 border-line bg-ch-mint">
          <MailCheck size={28} aria-hidden />
        </div>
        <p className="text-ink-muted">
          {email ? (
            <>{t('auth.checkEmail.body', { email: '⁨' + email + '⁩' })}</>
          ) : (
            t('auth.checkEmail.bodyNoEmail')
          )}
        </p>
        {error && <Alert tone="danger">{t(error)}</Alert>}
        {state === 'sent' && <Alert tone="success">{t('auth.checkEmail.resent')}</Alert>}
        {email && (
          <Button
            variant="secondary"
            onClick={resend}
            loading={state === 'sending'}
            disabled={state === 'sent'}
          >
            {t('auth.checkEmail.resend')}
          </Button>
        )}
        <Link to="/sign-in" className={buttonClasses({ variant: 'ghost' })}>
          {t('auth.checkEmail.back')}
        </Link>
      </div>
    </AuthLayout>
  )
}
