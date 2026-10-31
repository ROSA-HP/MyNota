import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet } from 'react-router'
import { Alert, Badge, Button, Dialog, Spinner, TextField, buttonClasses } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { cn } from '@/lib/cn'
import { AdminError, type UserStatus } from './adminApi'

/**
 * The admin area (`/admin`, Phase 7.3). Shown only to admins whose session passed two-factor
 * sign-in; the database checks the same thing on every call, so this is convenience, not the
 * protection.
 */
export function AdminLayout() {
  const { t } = useTranslation()
  const profile = useAuth((s) => s.profile)
  const verified = useAuth((s) => s.mfaVerified)

  if (!profile) return null
  if (profile.role !== 'admin')
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Alert tone="danger">{t('admin.notAdmin')}</Alert>
      </div>
    )
  if (!verified)
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldAlert size={24} aria-hidden /> {t('admin.title')}
        </h1>
        <Alert tone="warning">{t('admin.needs2fa')}</Alert>
        <div>
          <Link to="/settings#security" className={buttonClasses({})}>
            {t('admin.setUp2fa')}
          </Link>
        </div>
      </div>
    )

  const pages = [
    ['/admin', 'overview'],
    ['/admin/users', 'users'],
    ['/admin/maps', 'maps'],
    ['/admin/sharing', 'sharing'],
    ['/admin/reports', 'reports'],
    ['/admin/logins', 'logins'],
    ['/admin/ai', 'ai'],
    ['/admin/audit', 'audit'],
    ['/admin/system', 'system'],
  ] as const

  return (
    <div className="flex flex-col">
      <div className="border-b-2 border-line bg-surface-muted px-4 sm:px-8">
        <div className="flex items-center gap-2 pt-4">
          <h1 className="text-xl font-bold">{t('admin.title')}</h1>
          <Badge tone="warning">{t('admin.audited')}</Badge>
        </div>
        <nav
          aria-label={t('admin.title')}
          className="-mb-0.5 flex gap-1 overflow-x-auto pt-3 [scrollbar-width:thin]"
        >
          {pages.map(([to, key]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin'}
              className={({ isActive }) =>
                cn(
                  'rounded-t-neo border-2 border-b-0 px-3 py-2 text-sm font-semibold whitespace-nowrap',
                  isActive
                    ? 'border-line bg-paper text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink',
                )
              }
            >
              {t(`admin.nav.${key}`)}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        <Outlet />
      </div>
    </div>
  )
}

/** Loads data for a page; `reload` runs it again after an action. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    load().then(
      (d) => {
        if (!alive) return
        setData(d)
        setError(null)
      },
      (e: unknown) => {
        if (alive) setError(e instanceof AdminError ? e.message : String(e))
      },
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` are the inputs of `load`
  }, [...deps, version])
  return { data, error, reload: () => setVersion((v) => v + 1) }
}

export function Loading({ error }: { error: string | null }) {
  const { t } = useTranslation()
  if (error) return <Alert tone="danger">{t('admin.loadFailed', { error })}</Alert>
  return (
    <div className="flex justify-center py-10">
      <Spinner size={24} />
    </div>
  )
}

export function Section({
  title,
  children,
  actions,
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** A scrollable table with the app's border style. */
export function Table({
  head,
  children,
  empty,
}: {
  head: ReactNode[]
  children: ReactNode
  empty?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto rounded-neo border-2 border-line bg-surface">
      <table className="w-full text-start text-sm">
        <thead className="border-b-2 border-line bg-paper-sunken text-xs font-bold tracking-wide text-ink-muted uppercase">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2 text-start whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-line-soft">
          {empty ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-6 text-center text-ink-muted">
                {t('admin.empty')}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  )
}

export const Cell = ({
  children,
  className,
  dir,
}: {
  children: ReactNode
  className?: string
  dir?: 'auto' | 'ltr'
}) => (
  <td dir={dir} className={cn('px-3 py-2 align-top', className)}>
    {children}
  </td>
)

export function useDate() {
  const { i18n } = useTranslation()
  return (iso: string | null | undefined, withTime = true) =>
    iso
      ? new Date(iso).toLocaleString(i18n.language, {
          dateStyle: 'medium',
          ...(withTime ? { timeStyle: 'short' } : {}),
        })
      : '—'
}

export function StatusBadge({ status }: { status: UserStatus }) {
  const { t } = useTranslation()
  const tone = status === 'active' ? 'success' : status === 'suspended' ? 'warning' : 'danger'
  return <Badge tone={tone}>{t(`admin.status.${status}`)}</Badge>
}

/**
 * Asks for the reason an admin action needs (stored in the audit log), then runs it.
 * `run` throws on failure; the message is shown in the dialog.
 */
export function ReasonDialog({
  open,
  title,
  body,
  confirm,
  danger,
  onClose,
  run,
  children,
}: {
  open: boolean
  title: string
  body?: ReactNode
  confirm: string
  danger?: boolean
  onClose: () => void
  run: (reason: string) => Promise<void>
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 3) return setError(t('admin.reasonNeeded'))
    setBusy(true)
    setError(null)
    try {
      await run(reason.trim())
      setReason('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {body && <div className="text-sm text-ink-muted">{body}</div>}
        {children}
        <TextField
          label={t('admin.reason')}
          hint={t('admin.reasonHint')}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy}>
            {confirm}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
