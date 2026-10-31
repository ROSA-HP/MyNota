import { useState, type FormEvent } from 'react'
import type { ParseKeys } from 'i18next'
import { Download, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Alert, Button, TextField, toast } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { forgetAccountOnDevice } from '@/lib/localdb'
import { supabase } from '@/lib/supabase'
import { collectMyData, downloadJson, exportFileName } from './dataExport'

const DELETE_ERRORS: Record<string, ParseKeys> = {
  confirm: 'settings.data.errConfirm',
  mfa: 'settings.data.errMfa',
  limit: 'settings.data.errLimit',
}

/** Settings › Your data: download everything, or delete the account (Phase 7.5). */
export function DataSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const profile = useAuth((s) => s.profile)
  const signOut = useAuth((s) => s.signOut)
  const [progress, setProgress] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<ParseKeys | null>(null)
  const [busy, setBusy] = useState(false)

  if (!profile) return null

  async function download() {
    if (!profile) return
    setProgress(t('settings.data.collecting'))
    try {
      const data = await collectMyData(profile.id, (done, total) =>
        setProgress(t('settings.data.progress', { done, total })),
      )
      downloadJson(data, exportFileName(profile.username))
      toast(t('settings.data.downloaded'), 'success')
    } catch {
      toast(t('common.errorGeneric'), 'danger')
    } finally {
      setProgress(null)
    }
  }

  async function remove(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError(null)
    if (confirm.trim().replace(/^@/, '').toLowerCase() !== profile.username)
      return setError('settings.data.errConfirm')
    setBusy(true)
    const { error: fnError } = await supabase.functions.invoke('delete-account', {
      body: { confirm: profile.username },
    })
    if (fnError) {
      let code = ''
      try {
        const ctx = (fnError as { context?: Response }).context
        code = ((await ctx?.json()) as { error?: string } | undefined)?.error ?? ''
      } catch {
        /* not JSON (function not deployed, offline) */
      }
      setError(DELETE_ERRORS[code] ?? 'settings.data.errDelete')
      setBusy(false)
      return
    }
    await forgetAccountOnDevice(profile.id).catch(() => undefined)
    await signOut()
    navigate('/', { replace: true })
    toast(t('settings.data.deleted'), 'success')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">{t('settings.data.exportTitle')}</h3>
        <p className="text-sm text-ink-muted">{t('settings.data.exportHint')}</p>
        <div>
          <Button
            variant="secondary"
            icon={<Download size={18} aria-hidden />}
            loading={progress !== null}
            onClick={() => void download()}
          >
            {progress ?? t('settings.data.export')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t-2 border-line-soft pt-5">
        <h3 className="font-bold">{t('settings.data.deleteTitle')}</h3>
        <p className="text-sm text-ink-muted">{t('settings.data.deleteHint')}</p>
        {!deleting ? (
          <div>
            <Button
              variant="danger"
              icon={<Trash2 size={18} aria-hidden />}
              onClick={() => setDeleting(true)}
            >
              {t('settings.data.delete')}
            </Button>
          </div>
        ) : (
          <form onSubmit={remove} noValidate className="flex flex-col gap-3">
            <Alert tone="danger">{t('settings.data.deleteWarning')}</Alert>
            <div className="max-w-72">
              <TextField
                label={t('settings.data.typeUsername', { username: profile.username })}
                autoCapitalize="none"
                spellCheck={false}
                ltr
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && (
              <Alert tone="danger">
                {t(error)}{' '}
                {error === 'settings.data.errMfa' && (
                  <Link to="/settings#security" className="font-bold underline">
                    {t('settings.security.title')}
                  </Link>
                )}
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" loading={busy}>
                {t('settings.data.deleteForever')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDeleting(false)
                  setConfirm('')
                  setError(null)
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        )}
      </div>
      <p className="text-sm text-ink-muted">
        <Link to="/privacy" className="font-semibold underline">
          {t('legal.privacy.title')}
        </Link>{' '}
        ·{' '}
        <Link to="/terms" className="font-semibold underline">
          {t('legal.terms.title')}
        </Link>
      </p>
    </div>
  )
}
