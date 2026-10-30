import { useState, type FormEvent } from 'react'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Alert, Button, PasswordField, TextField } from '@/components/ui'
import { usePreferences } from '@/features/settings/preferencesStore'
import { authRedirect, supabase } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { authErrorKey } from './errors'
import { GoogleButton, OrDivider } from './GoogleButton'
import { fieldErrors, normalizeUsernameInput, signUpSchema } from './schemas'
import { UsernameStatus } from './UsernameStatus'
import { useUsernameAvailability } from './useUsernameAvailability'

export function SignUpPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { language, theme } = usePreferences()
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<ParseKeys | null>(null)
  const [loading, setLoading] = useState(false)
  const availability = useUsernameAvailability(form.username)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({
      ...f,
      [key]: key === 'username' ? normalizeUsernameInput(e.target.value) : e.target.value,
    }))

  const usernameError = errors.username
    ? t(errors.username as ParseKeys)
    : availability === 'taken'
      ? t('auth.errors.usernameTaken')
      : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const parsed = signUpSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setLoading(true)

    const { data: free, error: rpcError } = await supabase.rpc('username_available', {
      candidate: parsed.data.username,
    })
    if (rpcError) {
      setLoading(false)
      setFormError('auth.errors.network')
      return
    }
    if (!free) {
      setLoading(false)
      setErrors({ username: 'auth.errors.usernameTaken' })
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: authRedirect('/auth/callback'),
        // Read by the handle_new_user() trigger to create the profile.
        data: {
          name: parsed.data.name,
          username: parsed.data.username,
          ui_language: language,
          theme,
        },
      },
    })
    setLoading(false)
    if (error) {
      const key = authErrorKey(error)
      if (key === 'auth.errors.usernameTaken') setErrors({ username: key })
      else setFormError(key)
      return
    }
    // With email confirmation on there is no session yet. (For an email that already exists,
    // Supabase also returns no session and sends nothing, so we do not reveal it either way.)
    if (data.session) navigate('/library', { replace: true })
    else navigate('/check-email', { replace: true, state: { email: parsed.data.email } })
  }

  return (
    <AuthLayout
      title={t('auth.signUp.title')}
      subtitle={t('auth.signUp.subtitle')}
      footer={
        <>
          {t('auth.signUp.haveAccount')}{' '}
          <Link
            to="/sign-in"
            className="font-bold text-ink underline decoration-2 underline-offset-4"
          >
            {t('auth.signUp.toSignIn')}
          </Link>
        </>
      }
    >
      <GoogleButton onError={(k) => setFormError(k as ParseKeys)} />
      <OrDivider />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="danger">{t(formError)}</Alert>}
        <TextField
          label={t('auth.signUp.name')}
          placeholder={t('auth.signUp.namePlaceholder')}
          autoComplete="name"
          value={form.name}
          onChange={set('name')}
          maxLength={80}
          error={errors.name ? t(errors.name as ParseKeys) : null}
          required
        />
        <TextField
          label={t('auth.signUp.username')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          ltr
          value={form.username}
          onChange={set('username')}
          hint={t('auth.signUp.usernameHint')}
          error={usernameError}
          status={<UsernameStatus state={availability} />}
          required
        />
        <TextField
          label={t('common.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          ltr
          value={form.email}
          onChange={set('email')}
          error={errors.email ? t(errors.email as ParseKeys) : null}
          required
        />
        <PasswordField
          label={t('common.password')}
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          hint={t('auth.signUp.passwordHint')}
          error={errors.password ? t(errors.password as ParseKeys) : null}
          required
        />
        <Button type="submit" fullWidth loading={loading} className="mt-1">
          {t('auth.signUp.submit')}
        </Button>
        <p className="text-center text-xs text-ink-muted">{t('auth.signUp.terms')}</p>
      </form>
    </AuthLayout>
  )
}
