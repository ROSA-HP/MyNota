import { useMemo, useState } from 'react'
import { Flag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Badge, Button, Dialog, SelectField, TextField } from '@/components/ui'
import { adminApi, type AdminMap, type LoginEvent, type MapContent } from './adminApi'
import { Cell, Loading, ReasonDialog, Section, Table, useDate, useLoad } from './AdminLayout'

type MapType = 'book' | 'notes' | 'blank'
type Access = 'off' | 'view' | 'edit'

/** The outline of a map an admin opened (read only; the opening is in the audit log). */
function ContentView({ content, onClose }: { content: MapContent; onClose: () => void }) {
  const { t } = useTranslation()
  const tree = useMemo(() => {
    const kids = new Map<string | null, MapContent['nodes']>()
    for (const n of content.nodes) {
      const list = kids.get(n.parent_id) ?? []
      list.push(n)
      kids.set(n.parent_id, list)
    }
    const out: Array<{ depth: number; node: MapContent['nodes'][number] }> = []
    const walk = (parent: string | null, depth: number) => {
      for (const n of kids.get(parent) ?? []) {
        out.push({ depth, node: n })
        if (depth < 12) walk(n.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [content])
  return (
    <Dialog open onClose={onClose} title={content.map.title} className="w-[min(94vw,48rem)]">
      <p className="mb-3 text-sm text-ink-muted">
        {t('admin.maps.contentNote', {
          nodes: content.nodes.length,
          links: content.relations.length,
        })}
      </p>
      <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto text-sm">
        {tree.map(({ depth, node }) => (
          <li key={node.id} style={{ paddingInlineStart: depth * 16 }} dir="auto">
            <span className={depth < 2 ? 'font-bold' : 'font-semibold'}>{node.title}</span>
            {node.summary && <span className="text-ink-muted"> — {node.summary}</span>}
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

/** Maps (all, or only shared ones for the Sharing page) with open content and take down. */
export function MapsPage({ shared = false }: { shared?: boolean }) {
  const { t } = useTranslation()
  const date = useDate()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<AdminMap | null>(null)
  const [takedown, setTakedown] = useState<AdminMap | null>(null)
  const [content, setContent] = useState<MapContent | null>(null)
  const { data, error, reload } = useLoad(() => adminApi.maps(search, shared), [search, shared])

  return (
    <Section title={shared ? t('admin.sharing.title') : t('admin.maps.title')}>
      {shared && <p className="text-sm text-ink-muted">{t('admin.sharing.hint')}</p>}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(query.trim())
        }}
      >
        <div className="min-w-56 flex-1">
          <TextField
            label={t('admin.maps.search')}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
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
            t('admin.maps.map'),
            t('admin.maps.owner'),
            t('admin.maps.size'),
            t('admin.maps.link'),
            t('admin.maps.updated'),
            '',
          ]}
        >
          {data.map((m) => (
            <tr key={m.id}>
              <Cell>
                <span dir="auto" className="font-semibold">
                  {m.title}
                </span>
                <div className="text-xs text-ink-muted">
                  {t(`library.types.${m.type as MapType}`)}
                  {m.open_reports > 0 && (
                    <Badge tone="danger" className="ms-2">
                      {t('admin.maps.reported', { count: m.open_reports })}
                    </Badge>
                  )}
                </div>
              </Cell>
              <Cell>
                <Link to={`/admin/users/${m.owner_id}`} className="underline" dir="ltr">
                  @{m.owner_username}
                </Link>
              </Cell>
              <Cell className="whitespace-nowrap">
                {t('admin.maps.blocks', { count: m.blocks })}
                <div className="text-xs text-ink-muted">
                  {t('admin.maps.members', { count: m.members })}
                  {m.pending_invites > 0 &&
                    ` · ${t('admin.maps.invites', { count: m.pending_invites })}`}
                </div>
              </Cell>
              <Cell>
                <Badge tone={m.link_access === 'off' ? 'neutral' : 'warning'}>
                  {t(`admin.maps.access.${m.link_access as Access}`)}
                </Badge>
              </Cell>
              <Cell className="whitespace-nowrap">{date(m.updated_at)}</Cell>
              <Cell>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setOpen(m)}>
                    {t('admin.maps.open')}
                  </Button>
                  {m.link_access !== 'off' && (
                    <Button size="sm" variant="danger" onClick={() => setTakedown(m)}>
                      {t('admin.maps.takedown')}
                    </Button>
                  )}
                </div>
              </Cell>
            </tr>
          ))}
        </Table>
      )}
      <ReasonDialog
        open={open !== null}
        title={t('admin.maps.openTitle', { title: open?.title ?? '' })}
        body={t('admin.maps.openBody')}
        confirm={t('admin.maps.open')}
        onClose={() => setOpen(null)}
        run={async (reason) => {
          if (open) setContent(await adminApi.mapContent(open.id, reason))
        }}
      />
      <ReasonDialog
        open={takedown !== null}
        title={t('admin.maps.takedownTitle', { title: takedown?.title ?? '' })}
        body={t('admin.maps.takedownBody')}
        confirm={t('admin.maps.takedown')}
        danger
        onClose={() => setTakedown(null)}
        run={async (reason) => {
          if (!takedown) return
          await adminApi.takedown(takedown.id, reason)
          reload()
        }}
      />
      {content && <ContentView content={content} onClose={() => setContent(null)} />}
    </Section>
  )
}

export function SharingPage() {
  return <MapsPage shared />
}

type Resolve = 'none' | 'takedown' | 'suspend'

export function ReportsPage() {
  const { t } = useTranslation()
  const date = useDate()
  const [status, setStatus] = useState<'open' | 'resolved'>('open')
  const [resolving, setResolving] = useState<string | null>(null)
  const [action, setAction] = useState<Resolve>('none')
  const { data, error, reload } = useLoad(() => adminApi.reports(status), [status])

  return (
    <Section
      title={t('admin.reports.title')}
      actions={
        <SelectField
          label={t('admin.users.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value === 'resolved' ? 'resolved' : 'open')}
          options={[
            { value: 'open', label: t('admin.reports.open') },
            { value: 'resolved', label: t('admin.reports.resolved') },
          ]}
        />
      }
    >
      {!data ? (
        <Loading error={error} />
      ) : (
        <Table
          empty={!data.length}
          head={[
            t('admin.audit.when'),
            t('admin.maps.map'),
            t('admin.reports.reason'),
            t('admin.reports.by'),
            status === 'open' ? '' : t('admin.reports.outcome'),
          ]}
        >
          {data.map((r) => (
            <tr key={r.id}>
              <Cell className="whitespace-nowrap">{date(r.created_at)}</Cell>
              <Cell>
                <span dir="auto" className="font-semibold">
                  {r.map_title}
                </span>
                <div className="text-xs">
                  <Link to={`/admin/users/${r.owner_id}`} className="underline" dir="ltr">
                    @{r.owner_username}
                  </Link>
                </div>
              </Cell>
              <Cell>
                <Badge tone="danger">{t(`report.reasons.${r.reason as 'spam'}`)}</Badge>
                {r.details && (
                  <div className="mt-1 text-ink-muted" dir="auto">
                    {r.details}
                  </div>
                )}
              </Cell>
              <Cell dir="ltr">@{r.reporter_username}</Cell>
              <Cell>
                {r.status === 'open' ? (
                  <Button size="sm" onClick={() => setResolving(r.id)}>
                    {t('admin.reports.resolve')}
                  </Button>
                ) : (
                  <span dir="auto">
                    {r.outcome}
                    <span className="block text-xs text-ink-muted">
                      {r.handled_by_username && `@${r.handled_by_username} · `}
                      {date(r.resolved_at)}
                    </span>
                  </span>
                )}
              </Cell>
            </tr>
          ))}
        </Table>
      )}
      <ReasonDialog
        open={resolving !== null}
        title={t('admin.reports.resolve')}
        confirm={t('admin.reports.resolve')}
        danger={action !== 'none'}
        onClose={() => setResolving(null)}
        run={async (outcome) => {
          if (!resolving) return
          await adminApi.resolve(resolving, action, outcome)
          setAction('none')
          reload()
        }}
      >
        <SelectField
          label={t('admin.reports.action')}
          value={action}
          onChange={(e) => setAction(e.target.value as Resolve)}
          options={(['none', 'takedown', 'suspend'] as const).map((a) => ({
            value: a,
            label: t(`admin.reports.actions.${a}`),
          }))}
        />
      </ReasonDialog>
    </Section>
  )
}

export function LoginsPage() {
  const { t } = useTranslation()
  const date = useDate()
  const [failedOnly, setFailedOnly] = useState(false)
  const [flag, setFlag] = useState<LoginEvent | null>(null)
  const { data, error, reload } = useLoad(() => adminApi.logins(failedOnly), [failedOnly])
  return (
    <Section
      title={t('admin.logins.title')}
      actions={
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(e) => setFailedOnly(e.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />
          {t('admin.logins.failedOnly')}
        </label>
      }
    >
      <p className="text-sm text-ink-muted">{t('admin.logins.hint')}</p>
      {!data ? (
        <Loading error={error} />
      ) : (
        <Table
          empty={!data.length}
          head={[
            t('admin.audit.when'),
            t('admin.users.user'),
            t('admin.logins.result'),
            t('admin.logins.device'),
            '',
          ]}
        >
          {data.map((l) => (
            <tr key={l.id}>
              <Cell className="whitespace-nowrap">{date(l.at)}</Cell>
              <Cell>
                {l.user_id ? (
                  <Link to={`/admin/users/${l.user_id}`} className="underline" dir="ltr">
                    @{l.username}
                  </Link>
                ) : (
                  '—'
                )}
                {l.flagged && (
                  <Flag
                    size={12}
                    aria-label={t('admin.users.flagged')}
                    className="ms-1 inline text-danger"
                  />
                )}
              </Cell>
              <Cell className={l.success ? '' : 'font-bold text-danger'}>
                {l.success ? t('admin.logins.ok') : t('admin.logins.failed')} · {l.method}
              </Cell>
              <Cell>
                {l.device || '—'} {l.country && `· ${l.country}`}
              </Cell>
              <Cell>
                {l.user_id && !l.flagged && (
                  <Button size="sm" variant="ghost" onClick={() => setFlag(l)}>
                    <Flag size={14} aria-hidden /> {t('admin.users.flag')}
                  </Button>
                )}
              </Cell>
            </tr>
          ))}
        </Table>
      )}
      <ReasonDialog
        open={flag !== null}
        title={t('admin.users.flag')}
        confirm={t('admin.users.flag')}
        onClose={() => setFlag(null)}
        run={async (reason) => {
          if (!flag?.user_id) return
          await adminApi.flag(flag.user_id, reason)
          reload()
        }}
      />
    </Section>
  )
}
