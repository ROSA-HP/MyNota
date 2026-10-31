import { useState, type FormEvent } from 'react'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { Alert, Button, PasswordField, TextField } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './authStore'
import { authErrorKey } from './errors'
import { GoogleButton, OrDivider } from './GoogleButton'
import { fieldErrors, signInSchema } from './schemas'

export function SignInPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const notice = useAuth((s) => s.notice)
  const clearNotice = useAuth((s) => s.clearNotice)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<ParseKeys | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/home'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    clearNotice()
    setFormError(null)
    setUnconfirmed(false)
    const parsed = signInSchema.safeParse({ email, password })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    setLoading(false)
    if (error) {
      const key = authErrorKey(error)
      setFormError(key)
      setUnconfirmed(key === 'auth.errors.emailNotConfirmed')
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <AuthLayout
      title={t('auth.signIn.title')}
      subtitle={t('auth.signIn.subtitle')}
      footer={
        <>
          {t('auth.signIn.noAccount')}{' '}
          <Link
            to="/sign-up"
            className="font-bold text-ink underline decoration-2 underline-offset-4"
          >
            {t('auth.signIn.toSignUp')}
          </Link>
        </>
      }
    >
      {notice === 'suspended' && (
        <Alert tone="danger" className="mb-4">
          {t('auth.errors.suspended')}
        </Alert>
      )}
      <GoogleButton onError={(k) => setFormError(k as ParseKeys)} />
      <OrDivider />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <Alert tone="danger">
            {t(formError)}
            {unconfirmed && (
              <>
                {' '}
                <Link
                  to="/check-email"
                  state={{ email: email.trim() }}
                  className="font-bold underline underline-offset-2"
                >
                  {t('auth.checkEmail.resend')}
                </Link>
              </>
            )}
          </Alert>
        )}
        <TextField
          label={t('common.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          ltr
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email ? t(errors.email as ParseKeys) : null}
          required
        />
        <PasswordField
          label={t('common.password')}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password ? t(errors.password as ParseKeys) : null}
          status={
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              {t('auth.signIn.forgot')}
            </Link>
          }
          required
        />
        <Button type="submit" fullWidth loading={loading} className="mt-1">
          {t('auth.signIn.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
