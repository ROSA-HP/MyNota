import { useState, type FormEvent } from 'react'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Alert, Button, PasswordField, Spinner, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './authStore'
import { authErrorKey } from './errors'
import { passwordSchema } from './schemas'

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const status = useAuth((s) => s.status)
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<ParseKeys | null>(null)
  const [error, setError] = useState<ParseKeys | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = passwordSchema.safeParse(password)
    if (!parsed.success) {
      setFieldError('auth.errors.passwordTooShort')
      return
    }
    setFieldError(null)
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password: parsed.data })
    setLoading(false)
    if (err) {
      setError(authErrorKey(err))
      return
    }
    useAuth.setState({ recovering: false })
    toast(t('auth.reset.done'), 'success')
    navigate('/library', { replace: true })
  }

  return (
    <AuthLayout title={t('auth.reset.title')}>
      {status === 'loading' ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : status === 'signedOut' ? (
        <div className="flex flex-col gap-4">
          <Alert tone="danger">{t('auth.reset.invalidLink')}</Alert>
          <Link to="/forgot-password" className="font-bold underline underline-offset-4">
            {t('auth.forgot.title')}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="danger">{t(error)}</Alert>}
          <PasswordField
            label={t('auth.reset.newPassword')}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={t('auth.signUp.passwordHint')}
            error={fieldError ? t(fieldError) : null}
            required
          />
          <Button type="submit" fullWidth loading={loading}>
            {t('auth.reset.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
