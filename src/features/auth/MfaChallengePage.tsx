import { useEffect, useState, type FormEvent } from 'react'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Alert, Button, TextField } from '@/components/ui'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './authStore'
import { listTotp, verifyCode } from './mfa'

/** Six-digit code input for authenticator apps (one-time-code autofill on phones). */
export function TotpCodeField({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (v: string) => void
  error?: string | null
}) {
  const { t } = useTranslation()
  return (
    <TextField
      label={t('settings.security.code')}
      autoComplete="one-time-code"
      inputMode="numeric"
      ltr
      maxLength={9}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error ?? null}
      autoFocus
      required
    />
  )
}

/**
 * Shown instead of the app after signing in to an account with two-factor sign-in on:
 * nothing else opens until the authenticator code is entered.
 */
export function MfaChallengePage() {
  const { t } = useTranslation()
  const signOut = useAuth((s) => s.signOut)
  const refreshAssurance = useAuth((s) => s.refreshAssurance)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<ParseKeys | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void listTotp().then(
      (list) => setFactorId(list[0]?.id ?? null),
      () => setError('common.errorGeneric'),
    )
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setError(null)
    setLoading(true)
    try {
      await verifyCode(factorId, code)
      await refreshAssurance()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(
        msg === 'settings.security.codeInvalid'
          ? 'settings.security.codeInvalid'
          : 'settings.security.codeWrong',
      )
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.mfa.title')}
      subtitle={t('auth.mfa.subtitle')}
      footer={
        <button
          type="button"
          onClick={() => void signOut()}
          className="cursor-pointer font-bold text-ink underline decoration-2 underline-offset-4"
        >
          {t('common.signOut')}
        </button>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {error && <Alert tone="danger">{t(error)}</Alert>}
        <TotpCodeField value={code} onChange={setCode} />
        <Button type="submit" fullWidth loading={loading} disabled={!factorId}>
          {t('auth.mfa.submit')}
        </Button>
        <p className="text-sm text-ink-muted">{t('auth.mfa.lost')}</p>
      </form>
    </AuthLayout>
  )
}
