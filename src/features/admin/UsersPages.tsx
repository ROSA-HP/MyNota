import { useState } from 'react'
import { Flag, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { Alert, Badge, Button, Panel, SelectField, TextField } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { adminApi, type UserStatus } from './adminApi'
import {
  Cell,
  Loading,
  ReasonDialog,
  Section,
  StatusBadge,
  Table,
  useDate,
  useLoad,
} from './AdminLayout'

export function UsersPage() {
  const { t } = useTranslation()
  const date = useDate()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<UserStatus | ''>('')
  const { data, error } = useLoad(() => adminApi.users(search, status || null), [search, status])

  return (
    <Section title={t('admin.users.title')}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(query.trim())
        }}
      >
        <div className="min-w-56 flex-1">
          <TextField
            label={t('admin.users.search')}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <SelectField
          label={t('admin.users.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as UserStatus | '')}
          options={[
            { value: '', label: t('admin.users.all') },
            { value: 'active', label: t('admin.status.active') },
            { value: 'suspended', label: t('admin.status.suspended') },
            { value: 'banned', label: t('admin.status.banned') },
          ]}
        />
        <Button type="submit" variant="secondary">
          {t('admin.users.find')}
        </Button>
      </form>
      {!data ? (
        <Loading error={error} />
      ) : (
        <Table
          empty={!data.length}
          head={[
            t('admin.users.user'),
            t('admin.users.status'),
            t('admin.users.lastLogin'),
            t('admin.users.maps'),
            t('admin.users.joined'),
          ]}
        >
          {data.map((u) => (
            <tr key={u.id}>
              <Cell>
                <Link to={`/admin/users/${u.id}`} className="font-bold underline">
                  {u.name || u.username}
                </Link>
                <div className="text-xs text-ink-muted" dir="ltr">
                  @{u.username} · {u.email ?? '—'}
                </div>
              </Cell>
              <Cell>
                <span className="flex flex-wrap gap-1">
                  <StatusBadge status={u.status} />
                  {u.role === 'admin' && <Badge tone="brand">{t('admin.users.admin')}</Badge>}
                  {u.two_factor_enabled && (
                    <Badge tone="neutral">
                      <ShieldCheck size={12} aria-hidden /> 2FA
                    </Badge>
                  )}
                  {u.flagged && (
                    <Badge tone="danger">
                      <Flag size={12} aria-hidden /> {t('admin.users.flagged')}
                    </Badge>
                  )}
                </span>
              </Cell>
              <Cell className="whitespace-nowrap">{date(u.last_login)}</Cell>
              <Cell>{u.map_count}</Cell>
              <Cell className="whitespace-nowrap">{date(u.created_at, false)}</Cell>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  )
}

type Action = { status: UserStatus } | { flag: boolean }

export function UserDetailPage() {
  const { t } = useTranslation()
  const date = useDate()
  const { userId = '' } = useParams()
  const me = useAuth((s) => s.profile?.id)
  const [action, setAction] = useState<Action | null>(null)
  const { data, error, reload } = useLoad(() => adminApi.user(userId), [userId])
  if (!data) return <Loading error={error} />
  const p = data.profile
  const self = p.id === me

  const title =
    action && 'status' in action
      ? t(`admin.users.do.${action.status}`)
      : action?.flag
        ? t('admin.users.flag')
        : t('admin.users.unflag')

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/users" className="text-sm font-semibold underline">
        ← {t('admin.users.title')}
      </Link>
      <Panel className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold" dir="auto">
            {p.name || p.username}
          </h2>
          <StatusBadge status={p.status} />
          {p.role === 'admin' && <Badge tone="brand">{t('admin.users.admin')}</Badge>}
          {p.two_factor_enabled && <Badge tone="neutral">2FA</Badge>}
        </div>
        <p className="text-sm text-ink-muted" dir="ltr">
          @{p.username} · {p.email ?? '—'}
        </p>
        <p className="text-sm text-ink-muted">
          {t('admin.users.joinedOn', { date: date(p.created_at, false) })} ·{' '}
          {t('admin.users.reports', { made: data.reports_made, against: data.reports_against })}
        </p>
        {p.flag && (
          <Alert tone="warning">
            {t('admin.users.flaggedBecause', { reason: p.flag.reason, date: date(p.flag.at) })}
          </Alert>
        )}
        {self ? (
          <p className="text-sm text-ink-muted">{t('admin.users.self')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {p.status !== 'active' && (
              <Button size="sm" onClick={() => setAction({ status: 'active' })}>
                {t('admin.users.do.active')}
              </Button>
            )}
            {p.status !== 'suspended' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAction({ status: 'suspended' })}
              >
                {t('admin.users.do.suspended')}
              </Button>
            )}
            {p.status !== 'banned' && (
              <Button size="sm" variant="danger" onClick={() => setAction({ status: 'banned' })}>
                {t('admin.users.do.banned')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setAction({ flag: !p.flag })}>
              <Flag size={14} aria-hidden />{' '}
              {p.flag ? t('admin.users.unflag') : t('admin.users.flag')}
            </Button>
          </div>
        )}
      </Panel>

      <Section title={t('admin.users.maps')}>
        <Table
          empty={!data.maps.length}
          head={[t('admin.maps.map'), t('admin.maps.link'), t('admin.maps.updated')]}
        >
          {data.maps.map((m) => (
            <tr key={m.id}>
              <Cell>
                <span dir="auto" className="font-semibold">
                  {m.title}
                </span>{' '}
                <span className="text-xs text-ink-muted">
                  {t(`library.types.${m.type as 'book' | 'notes' | 'blank'}`)}
                </span>
              </Cell>
              <Cell>{t(`admin.maps.access.${m.link_access as 'off' | 'view' | 'edit'}`)}</Cell>
              <Cell className="whitespace-nowrap">{date(m.updated_at)}</Cell>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title={t('admin.logins.title')}>
        <Table
          empty={!data.logins.length}
          head={[t('admin.audit.when'), t('admin.logins.result'), t('admin.logins.device')]}
        >
          {data.logins.map((l, i) => (
            <tr key={i}>
              <Cell className="whitespace-nowrap">{date(l.at)}</Cell>
              <Cell className={l.success ? '' : 'font-bold text-danger'}>
                {l.success ? t('admin.logins.ok') : t('admin.logins.failed')} · {l.method}
              </Cell>
              <Cell>
                {l.device || '—'} {l.country && `· ${l.country}`}
              </Cell>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title={t('admin.users.shares')}>
        <Table empty={!data.shares.length} head={[t('admin.audit.when'), t('admin.audit.action')]}>
          {data.shares.map((s, i) => (
            <tr key={i}>
              <Cell className="whitespace-nowrap">{date(s.at)}</Cell>
              <Cell className="font-mono text-xs">{s.action}</Cell>
            </tr>
          ))}
        </Table>
      </Section>

      <ReasonDialog
        open={action !== null}
        title={title}
        body={action && 'status' in action ? t(`admin.users.explain.${action.status}`) : undefined}
        confirm={title}
        danger={action !== null && 'status' in action && action.status !== 'active'}
        onClose={() => setAction(null)}
        run={async (reason) => {
          if (!action) return
          if ('status' in action) await adminApi.setStatus(p.id, action.status, reason)
          else await adminApi.flag(p.id, reason, action.flag)
          reload()
        }}
      />
    </div>
  )
}
