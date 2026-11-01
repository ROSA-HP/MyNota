import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button, Panel, SelectField, TextField } from '@/components/ui'
import { cn } from '@/lib/cn'
import { adminApi, type AuditEntry, type Setting } from './adminApi'
import { Cell, Loading, ReasonDialog, Section, Table, useDate, useLoad } from './AdminLayout'

function Stat({ label, value, to }: { label: string; value: number | string; to?: string }) {
  const body = (
    <>
      <span className="text-sm font-semibold text-ink-muted">{label}</span>
      <span className="font-mono text-2xl font-bold tabular-nums">{value}</span>
    </>
  )
  return to ? (
    <Link
      to={to}
      className="neo-btn flex flex-col gap-1 rounded-neo border-2 border-line bg-surface p-4 neo-shadow-sm hover:bg-surface-muted"
    >
      {body}
    </Link>
  ) : (
    <Panel className="flex flex-col gap-1 p-4">{body}</Panel>
  )
}

export function OverviewPage() {
  const { t, i18n } = useTranslation()
  const { data, error } = useLoad(() => adminApi.overview(), [])
  if (!data) return <Loading error={error} />
  const n = (v: number) => v.toLocaleString(i18n.language)
  const max = Math.max(1, ...data.signups.map((s) => s.count))
  const mb = (data.source_bytes / 1024 / 1024).toLocaleString(i18n.language, {
    maximumFractionDigits: 1,
  })
  return (
    <div className="flex flex-col gap-6">
      <div className="mynota-stagger grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('admin.overview.users')} value={n(data.users)} to="/admin/users" />
        <Stat label={t('admin.overview.active7')} value={n(data.active_7d)} />
        <Stat label={t('admin.overview.studying7')} value={n(data.studying_7d)} />
        <Stat label={t('admin.overview.suspended')} value={n(data.suspended)} />
        <Stat label={t('admin.overview.maps')} value={n(data.maps)} to="/admin/maps" />
        <Stat label={t('admin.overview.maps7')} value={n(data.maps_7d)} />
        <Stat label={t('admin.overview.blocks')} value={n(data.blocks)} />
        <Stat label={t('admin.overview.reviews7')} value={n(data.reviews_7d)} />
        <Stat label={t('admin.overview.links')} value={n(data.public_links)} to="/admin/sharing" />
        <Stat
          label={t('admin.overview.reports')}
          value={n(data.open_reports)}
          to="/admin/reports"
        />
        <Stat label={t('admin.overview.storage')} value={`${mb} MB`} />
      </div>
      <Section title={t('admin.overview.signups')}>
        {data.signups.length ? (
          <Panel className="p-4">
            <div
              className="flex h-32 items-end gap-1"
              role="img"
              aria-label={t('admin.overview.signups')}
            >
              {data.signups.map((s, i) => (
                <div
                  key={s.day}
                  title={`${s.day}: ${s.count}`}
                  className="mynota-grow-y flex-1 rounded-t-sm bg-brand"
                  style={{
                    height: `${Math.max(4, (s.count / max) * 100)}%`,
                    animationDelay: `${Math.min(i, 30) * 15}ms`,
                  }}
                />
              ))}
            </div>
          </Panel>
        ) : (
          <p className="text-sm text-ink-muted">{t('admin.empty')}</p>
        )}
      </Section>
    </div>
  )
}

export function AiJobsPage() {
  const { t, i18n } = useTranslation()
  const [days, setDays] = useState(30)
  const { data, error } = useLoad(() => adminApi.aiJobs(days), [days])
  return (
    <Section
      title={t('admin.ai.title')}
      actions={
        <SelectField
          label={t('admin.ai.period')}
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          options={[7, 30, 90].map((d) => ({
            value: String(d),
            label: t('admin.ai.days', { count: d }),
          }))}
        />
      }
    >
      <p className="text-sm text-ink-muted">{t('admin.ai.hint')}</p>
      {!data ? (
        <Loading error={error} />
      ) : (
        <Table
          empty={!data.length}
          head={[
            t('admin.ai.provider'),
            t('admin.ai.model'),
            t('admin.ai.prompt'),
            t('admin.ai.total'),
            t('admin.ai.failed'),
            t('admin.ai.avg'),
            t('admin.ai.tokens'),
          ]}
        >
          {data.map((j, i) => (
            <tr key={i}>
              <Cell>{j.provider}</Cell>
              <Cell className="font-mono text-xs">{j.model}</Cell>
              <Cell className="font-mono text-xs">
                {j.prompt_version} · {j.pass}
              </Cell>
              <Cell>{j.total}</Cell>
              <Cell className={cn(j.failed > 0 && 'font-bold text-danger')}>
                {j.failed} ({Math.round((j.failed / Math.max(1, j.total)) * 100)}%)
              </Cell>
              <Cell>{j.avg_ms === null ? '—' : `${(j.avg_ms / 1000).toFixed(1)} s`}</Cell>
              <Cell className="tabular-nums">
                {(j.tokens_in + j.tokens_out).toLocaleString(i18n.language)}
              </Cell>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  )
}

/** Admin › Errors (Phase 7.6): scrubbed reports from students' browsers, grouped by message. */
export function ErrorsPage() {
  const { t } = useTranslation()
  const date = useDate()
  const [days, setDays] = useState(7)
  const { data, error } = useLoad(() => adminApi.errors(days), [days])
  return (
    <Section
      title={t('admin.errors.title')}
      actions={
        <SelectField
          label={t('admin.ai.period')}
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          options={[1, 7, 30].map((d) => ({
            value: String(d),
            label: t('admin.ai.days', { count: d }),
          }))}
        />
      }
    >
      <p className="text-sm text-ink-muted">{t('admin.errors.hint')}</p>
      {!data ? (
        <Loading error={error} />
      ) : (
        <Table
          empty={!data.length}
          head={[
            t('admin.errors.message'),
            t('admin.errors.count'),
            t('admin.errors.people'),
            t('admin.errors.last'),
            t('admin.errors.where'),
          ]}
        >
          {data.map((g) => (
            <tr key={g.message}>
              <Cell>
                <span className="font-mono text-xs font-semibold break-all">{g.message}</span>
                {g.stack && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-ink-muted">{g.kind}</summary>
                    <pre className="mt-1 overflow-x-auto font-mono text-[11px] whitespace-pre-wrap text-ink-muted">
                      {g.stack}
                    </pre>
                  </details>
                )}
              </Cell>
              <Cell>{g.count}</Cell>
              <Cell>{g.people}</Cell>
              <Cell className="whitespace-nowrap">{date(g.last_at)}</Cell>
              <Cell className="text-xs">
                <span className="font-mono">{g.route}</span>
                <div className="text-ink-muted">
                  {g.browser} · {g.app_version}
                </div>
              </Cell>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  )
}

function details(a: AuditEntry): string {
  const d = a.details
  return Object.keys(d).length ? JSON.stringify(d) : ''
}

export function AuditPage() {
  const { t } = useTranslation()
  const date = useDate()
  const [more, setMore] = useState<AuditEntry[]>([])
  const { data, error } = useLoad(() => adminApi.audit(), [])
  if (!data) return <Loading error={error} />
  const all = [...data, ...more]
  const last = all.at(-1)
  return (
    <Section title={t('admin.audit.title')}>
      <p className="text-sm text-ink-muted">{t('admin.audit.hint')}</p>
      <Table
        empty={!all.length}
        head={[
          t('admin.audit.when'),
          t('admin.audit.who'),
          t('admin.audit.action'),
          t('admin.audit.target'),
          t('admin.reason'),
        ]}
      >
        {all.map((a) => (
          <tr key={a.id}>
            <Cell className="whitespace-nowrap">{date(a.at)}</Cell>
            <Cell>{a.actor_username ?? '—'}</Cell>
            <Cell className="font-mono text-xs">{a.action}</Cell>
            <Cell className="font-mono text-xs">
              {a.target_type === 'user' && a.target_id ? (
                <Link to={`/admin/users/${a.target_id}`} className="underline">
                  {a.target_type}
                </Link>
              ) : (
                a.target_type
              )}{' '}
              <span className="text-ink-muted">{a.target_id?.slice(0, 8)}</span>
              {details(a) && <div className="text-ink-muted break-all">{details(a)}</div>}
            </Cell>
            <Cell dir="auto">{a.reason}</Cell>
          </tr>
        ))}
      </Table>
      {data.length === 100 && last && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void adminApi.audit(last.id).then((r) => setMore((m) => [...m, ...r]))}
          >
            {t('admin.more')}
          </Button>
        </div>
      )}
    </Section>
  )
}

function SettingRow({ s, onSaved }: { s: Setting; onSaved: () => void }) {
  const { t } = useTranslation()
  const date = useDate()
  const [value, setValue] = useState(String(s.value))
  const [open, setOpen] = useState(false)
  const isFeature = s.key.startsWith('features.')
  const next: number | boolean = isFeature ? !s.value : Number(value)
  const changed = isFeature || (value !== String(s.value) && Number.isFinite(Number(value)))
  return (
    <tr>
      <Cell className="font-mono text-xs">{s.key}</Cell>
      <Cell>
        {isFeature ? (
          <span className={s.value ? 'font-bold text-success' : 'text-ink-muted'}>
            {s.value ? t('admin.system.on') : t('admin.system.off')}
          </span>
        ) : (
          <div className="max-w-32">
            <TextField
              label={t('admin.system.value')}
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        )}
      </Cell>
      <Cell className="whitespace-nowrap text-ink-muted">{date(s.updated_at)}</Cell>
      <Cell>
        <Button size="sm" variant="secondary" disabled={!changed} onClick={() => setOpen(true)}>
          {isFeature
            ? s.value
              ? t('admin.system.turnOff')
              : t('admin.system.turnOn')
            : t('common.save')}
        </Button>
        <ReasonDialog
          open={open}
          title={s.key}
          body={t('admin.system.change', { value: String(next) })}
          confirm={t('common.save')}
          onClose={() => setOpen(false)}
          run={async (reason) => {
            await adminApi.setSetting(s.key, next, reason)
            onSaved()
          }}
        />
      </Cell>
    </tr>
  )
}

export function SystemPage() {
  const { t } = useTranslation()
  const { data, error, reload } = useLoad(() => adminApi.settings(), [])
  if (!data) return <Loading error={error} />
  return (
    <Section title={t('admin.system.title')}>
      <p className="text-sm text-ink-muted">{t('admin.system.hint')}</p>
      <Table
        head={[t('admin.system.setting'), t('admin.system.value'), t('admin.system.updated'), '']}
      >
        {data.map((s) => (
          <SettingRow key={`${s.key}:${String(s.value)}`} s={s} onSaved={reload} />
        ))}
      </Table>
    </Section>
  )
}
