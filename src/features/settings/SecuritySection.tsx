import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { ParseKeys } from 'i18next'
import { LogOut, ShieldCheck, ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, Badge, Button, toast } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import {
  listTotp,
  removeFactor,
  signOutOthers,
  startEnroll,
  verifyCode,
  type Enrollment,
  type TotpFactor,
} from '@/features/auth/mfa'
import { TotpCodeField } from '@/features/auth/MfaChallengePage'
import { supabase } from '@/lib/supabase'

interface SignIn {
  at: string
  success: boolean
  device: string
  country: string | null
}

/** Settings › Security: two-factor sign-in, other devices, recent sign-ins (Phase 7.2). */
export function SecuritySection() {
  const { t, i18n } = useTranslation()
  const profile = useAuth((s) => s.profile)
  const refreshProfile = useAuth((s) => s.refreshProfile)
  const refreshAssurance = useAuth((s) => s.refreshAssurance)
  const [factors, setFactors] = useState<TotpFactor[] | null>(null)
  const [enroll, setEnroll] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<ParseKeys | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [signIns, setSignIns] = useState<SignIn[]>([])

  const reload = useCallback(async () => {
    try {
      setFactors(await listTotp())
    } catch {
      setFactors([])
      setError('common.errorGeneric')
    }
  }, [])

  useEffect(() => {
    void listTotp().then(setFactors, () => setFactors([]))
    void supabase
      .from('login_events')
      .select('at, success, device, country')
      .order('at', { ascending: false })
      .limit(8)
      .then(({ data }) => setSignIns((data as SignIn[] | null) ?? []))
  }, [reload])

  const on = (factors?.length ?? 0) > 0
  const date = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })

  async function begin() {
    setError(null)
    setBusy(true)
    try {
      setEnroll(await startEnroll('MyNota'))
      setCode('')
    } catch {
      setError('common.errorGeneric')
    } finally {
      setBusy(false)
    }
  }

  async function finish(e: FormEvent) {
    e.preventDefault()
    if (!enroll) return
    setError(null)
    setBusy(true)
    try {
      await verifyCode(enroll.factorId, code)
      setEnroll(null)
      await Promise.all([reload(), refreshProfile(), refreshAssurance()])
      toast(t('settings.security.turnedOn'), 'success')
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'settings.security.codeInvalid'
          ? 'settings.security.codeInvalid'
          : 'settings.security.codeWrong',
      )
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    setError(null)
    try {
      for (const f of factors ?? []) await removeFactor(f.id)
      setConfirmOff(false)
      await Promise.all([reload(), refreshProfile(), refreshAssurance()])
      toast(t('settings.security.turnedOff'))
    } catch {
      setError('settings.security.offFailed')
    } finally {
      setBusy(false)
    }
  }

  async function others() {
    setBusy(true)
    try {
      await signOutOthers()
      toast(t('settings.security.othersDone'), 'success')
    } catch {
      toast(t('common.errorGeneric'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert tone="danger">{t(error)}</Alert>}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{t('settings.security.twoFactor')}</h3>
          {factors !== null &&
            (on ? (
              <Badge tone="success">
                <ShieldCheck size={12} aria-hidden /> {t('settings.security.on')}
              </Badge>
            ) : (
              <Badge tone="neutral">
                <ShieldOff size={12} aria-hidden /> {t('settings.security.off')}
              </Badge>
            ))}
        </div>
        <p className="text-sm text-ink-muted">{t('settings.security.twoFactorHint')}</p>
        {profile?.role === 'admin' && !on && (
          <Alert tone="warning">{t('settings.security.adminNeeds')}</Alert>
        )}

        {enroll ? (
          <form onSubmit={finish} noValidate className="flex flex-col gap-4">
            <ol className="flex list-decimal flex-col gap-1 ps-5 text-sm">
              <li>{t('settings.security.step1')}</li>
              <li>{t('settings.security.step2')}</li>
            </ol>
            <div className="flex flex-wrap items-start gap-4">
              <img
                src={enroll.qr}
                alt={t('settings.security.qrAlt')}
                width={176}
                height={176}
                className="rounded-neo border-2 border-line bg-white p-2"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-semibold">{t('settings.security.secret')}</span>
                <code
                  dir="ltr"
                  className="rounded-md border-2 border-line bg-paper-sunken px-2 py-1 font-mono text-sm break-all select-all"
                >
                  {enroll.secret}
                </code>
              </div>
            </div>
            <div className="max-w-56">
              <TotpCodeField value={code} onChange={setCode} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy}>
                {t('settings.security.verify')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEnroll(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : on ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-muted">
              {t('settings.security.since', { date: date(factors?.[0]?.createdAt ?? '') })}
            </span>
            {confirmOff ? (
              <>
                <Button variant="danger" size="sm" loading={busy} onClick={() => void turnOff()}>
                  {t('settings.security.confirmOff')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmOff(false)}>
                  {t('common.cancel')}
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setConfirmOff(true)}>
                {t('settings.security.turnOff')}
              </Button>
            )}
          </div>
        ) : (
          <div>
            <Button loading={busy} disabled={factors === null} onClick={() => void begin()}>
              {t('settings.security.turnOn')}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t-2 border-line-soft pt-5">
        <h3 className="font-bold">{t('settings.security.devices')}</h3>
        {signIns.length ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {signIns.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2">
                <span className={s.success ? 'text-ink' : 'font-semibold text-danger'}>
                  {s.success ? t('settings.security.signedIn') : t('settings.security.failed')}
                </span>
                <span className="text-ink-muted">{date(s.at)}</span>
                {s.device && <span className="text-ink-muted">· {s.device}</span>}
                {s.country && <span className="text-ink-muted">· {s.country}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">{t('settings.security.noSignIns')}</p>
        )}
        <div>
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            icon={<LogOut size={16} aria-hidden className="rtl:-scale-x-100" />}
            onClick={() => void others()}
          >
            {t('settings.security.signOutOthers')}
          </Button>
        </div>
      </div>
    </div>
  )
}
