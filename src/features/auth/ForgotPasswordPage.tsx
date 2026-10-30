import { useState, type FormEvent } from 'react'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Alert, Button, TextField } from '@/components/ui'
import { authRedirect, supabase } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { authErrorKey } from './errors'
import { emailSchema } from './schemas'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<ParseKeys | null>(null)
  const [error, setError] = useState<ParseKeys | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) {
      setFieldError('auth.errors.emailInvalid')
      return
    }
    setFieldError(null)
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: authRedirect('/reset-password'),
    })
    setLoading(false)
    // Same message whether or not the account exists (no account enumeration).
    if (err && authErrorKey(err) !== 'common.errorGeneric') setError(authErrorKey(err))
    else setSent(true)
  }

  return (
    <AuthLayout
      title={t('auth.forgot.title')}
      subtitle={t('auth.forgot.subtitle')}
      footer={
        <Link
          to="/sign-in"
          className="font-bold text-ink underline decoration-2 underline-offset-4"
        >
          {t('auth.forgot.back')}
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success">{t('auth.forgot.sent')}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="danger">{t(error)}</Alert>}
          <TextField
            label={t('common.email')}
            type="email"
            autoComplete="email"
            inputMode="email"
            ltr
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError ? t(fieldError) : null}
            required
          />
          <Button type="submit" fullWidth loading={loading}>
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
