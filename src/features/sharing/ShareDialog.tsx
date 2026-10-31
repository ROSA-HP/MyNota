import { Check, Copy, Flag, Link2, RotateCcw, UserPlus } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Alert, Button, Dialog, SelectField, Spinner, toast } from '@/components/ui'
import { controlClasses } from '@/components/ui/Field'
import { Avatar } from '@/app/Avatar'
import { useAuth } from '@/features/auth/authStore'
import { cn } from '@/lib/cn'
import type { LinkAccess, MapPersonRow, ShareSettingsRow } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { ReportDialog } from './ReportDialog'
import { shareError, shareUrl } from './shareApi'
import { usePeople } from './usePeople'

const ACCESS: LinkAccess[] = ['off', 'view', 'edit']
const EXPIRY = ['never', '1', '7', '30'] as const
type Expiry = (typeof EXPIRY)[number]

/** The expiry timestamp for a preset, counted from now. */
function expiresAt(expiry: Expiry): string | null {
  return expiry === 'never'
    ? null
    : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString()
}

/** Days left until an expiry date, rounded to the nearest preset the select offers. */
function expiryFor(iso: string | null): Expiry {
  if (!iso) return 'never'
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000
  return days <= 1.5 ? '1' : days <= 10 ? '7' : '30'
}

/**
 * Share a map (docs/features.md › Sharing). The owner invites people, manages members and the
 * share link; everyone else sees who is on the map and can leave it.
 */
export function ShareDialog({
  open,
  onClose,
  mapId,
  mapTitle,
  role,
}: {
  open: boolean
  onClose: () => void
  mapId: string
  mapTitle: string
  role: 'owner' | 'editor' | 'viewer' | null
}) {
  const { t } = useTranslation()
  const owner = role === 'owner'
  const { people, reload } = usePeople(open ? mapId : null)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('share.title', { title: mapTitle })}
      className="w-[min(94vw,34rem)]"
    >
      <div className="flex flex-col gap-6">
        {owner && <InviteForm mapId={mapId} onInvited={reload} />}
        <People mapId={mapId} people={people} owner={owner} onChange={reload} onLeft={onClose} />
        {owner && <LinkSection mapId={mapId} />}
      </div>
    </Dialog>
  )
}

function InviteForm({ mapId, onInvited }: { mapId: string; onInvited: () => void }) {
  const { t } = useTranslation()
  const [who, setWho] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!who.trim()) return
    setBusy(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('invite_member', {
      p_map: mapId,
      p_who: who.trim(),
      p_role: role,
    })
    setBusy(false)
    if (err) {
      setError(
        err.code === 'MN404'
          ? t('share.invite.noAccount')
          : err.code === 'MN409'
            ? t('share.invite.alreadyMember')
            : err.code === 'MN400'
              ? t('share.invite.yourself')
              : t(shareError(err)),
      )
      return
    }
    const invited = data[0]
    toast(t('share.invite.sent', { name: invited ? `@${invited.username}` : who }), 'success')
    setWho('')
    onInvited()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
      <label htmlFor="share-who" className="text-sm font-semibold">
        {t('share.invite.label')}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="share-who"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder={t('share.invite.placeholder')}
          aria-invalid={error ? true : undefined}
          aria-describedby="share-who-hint"
          className={cn(controlClasses(Boolean(error)), 'min-w-48 flex-1 text-start')}
        />
        <select
          aria-label={t('share.role')}
          value={role}
          onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
          className={cn(controlClasses(), 'w-auto! cursor-pointer')}
        >
          <option value="editor">{t('share.roles.editor')}</option>
          <option value="viewer">{t('share.roles.viewer')}</option>
        </select>
        <Button
          type="submit"
          loading={busy}
          icon={<UserPlus size={17} aria-hidden />}
          disabled={!who.trim()}
        >
          {t('share.invite.send')}
        </Button>
      </div>
      <p
        id="share-who-hint"
        className={cn('text-sm', error ? 'text-danger' : 'text-ink-muted')}
        role={error ? 'alert' : undefined}
      >
        {error ?? t('share.invite.hint')}
      </p>
    </form>
  )
}

function People({
  mapId,
  people,
  owner,
  onChange,
  onLeft,
}: {
  mapId: string
  people: MapPersonRow[] | null
  owner: boolean
  onChange: () => void
  onLeft: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useAuth((s) => s.session?.user.id)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

  const run = async (key: string, call: () => PromiseLike<{ error: { code?: string } | null }>) => {
    if (confirm !== key) return setConfirm(key)
    setConfirm(null)
    const { error } = await call()
    if (error) return toast(t(shareError(error)), 'danger')
    onChange()
  }

  if (!people)
    return (
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner /> {t('common.loading')}
      </div>
    )

  return (
    <section aria-labelledby="share-people" className="flex flex-col gap-2">
      <h3 id="share-people" className="text-sm font-semibold">
        {t('share.people')}
      </h3>
      <ul className="flex flex-col divide-y-2 divide-line-soft rounded-neo border-2 border-line">
        {people.map((p) => {
          const self = p.user_id === me
          return (
            <li
              key={`${p.kind}:${p.user_id}`}
              className="flex flex-wrap items-center gap-3 px-3 py-2.5"
            >
              <Avatar name={p.name} username={p.username} url={p.avatar_url} size={32} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span dir="auto" className="truncate font-semibold">
                  {p.name || p.username}
                  {self && <span className="font-normal text-ink-muted"> · {t('share.you')}</span>}
                </span>
                <span className="truncate text-xs text-ink-muted" dir="ltr">
                  @{p.username}
                  {p.kind === 'invite' && <> · {t('share.waiting')}</>}
                </span>
              </span>
              {p.kind === 'owner' ? (
                <span className="text-sm font-semibold text-ink-muted">
                  {t('share.roles.owner')}
                </span>
              ) : owner && p.kind === 'member' ? (
                <>
                  <select
                    aria-label={t('share.roleOf', { name: p.username })}
                    value={p.role}
                    onChange={async (e) => {
                      const { error } = await supabase.rpc('member_set_role', {
                        p_map: mapId,
                        p_user: p.user_id,
                        p_role: e.target.value as 'editor' | 'viewer',
                      })
                      if (error) toast(t(shareError(error)), 'danger')
                      onChange()
                    }}
                    className={cn(controlClasses(), 'min-h-10 w-auto! cursor-pointer text-sm')}
                  >
                    <option value="editor">{t('share.roles.editor')}</option>
                    <option value="viewer">{t('share.roles.viewer')}</option>
                  </select>
                  <Button
                    variant={confirm === `rm:${p.user_id}` ? 'danger' : 'ghost'}
                    size="sm"
                    onClick={() =>
                      void run(`rm:${p.user_id}`, () =>
                        supabase.rpc('member_remove', { p_map: mapId, p_user: p.user_id }),
                      )
                    }
                  >
                    {confirm === `rm:${p.user_id}` ? t('share.confirmRemove') : t('share.remove')}
                  </Button>
                </>
              ) : owner && p.kind === 'invite' && p.invite_id ? (
                <>
                  <span className="text-sm text-ink-muted">{t(`share.roles.${p.role}`)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const id = p.invite_id
                      if (id)
                        void run(`inv:${id}`, () => supabase.rpc('invite_cancel', { p_invite: id }))
                    }}
                  >
                    {confirm === `inv:${p.invite_id}`
                      ? t('share.confirmCancel')
                      : t('share.cancelInvite')}
                  </Button>
                </>
              ) : (
                <span className="text-sm text-ink-muted">{t(`share.roles.${p.role}`)}</span>
              )}
            </li>
          )
        })}
      </ul>
      {!owner && me && (
        <span className="flex flex-wrap gap-2">
          <Button
            variant={confirm === 'leave' ? 'danger' : 'secondary'}
            className="self-start"
            onClick={async () => {
              if (confirm !== 'leave') return setConfirm('leave')
              const { error } = await supabase.rpc('member_remove', { p_map: mapId, p_user: me })
              if (error) return toast(t(shareError(error)), 'danger')
              toast(t('share.left'), 'success')
              onLeft()
              navigate('/library')
            }}
          >
            {confirm === 'leave' ? t('share.confirmLeave') : t('share.leave')}
          </Button>
          <Button
            variant="ghost"
            icon={<Flag size={16} aria-hidden />}
            onClick={() => setReporting(true)}
          >
            {t('link.report')}
          </Button>
        </span>
      )}
      {reporting && <ReportDialog open onClose={() => setReporting(false)} target={{ mapId }} />}
    </section>
  )
}

function LinkSection({ mapId }: { mapId: string }) {
  const { t, i18n } = useTranslation()
  const [settings, setSettings] = useState<ShareSettingsRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    let alive = true
    void supabase.rpc('share_settings', { p_map: mapId }).then(({ data, error: err }) => {
      if (!alive) return
      if (err) setError(t(shareError(err)))
      else setSettings(data[0] ?? null)
    })
    return () => {
      alive = false
    }
  }, [mapId, t])

  const apply = async (access: LinkAccess, expiry: Expiry) => {
    setBusy(true)
    setError(null)
    const expires = expiresAt(expiry)
    const { data, error: err } = await supabase.rpc('share_link_set', {
      p_map: mapId,
      p_access: access,
      p_expires_at: access === 'off' ? null : expires,
    })
    setBusy(false)
    if (err) return setError(t(shareError(err)))
    setSettings(data[0] ?? null)
  }

  const reset = async () => {
    if (!confirmReset) return setConfirmReset(true)
    setConfirmReset(false)
    setBusy(true)
    const { data, error: err } = await supabase.rpc('share_link_reset', { p_map: mapId })
    setBusy(false)
    if (err) return setError(t(shareError(err)))
    setSettings(data[0] ?? null)
    toast(t('share.link.wasReset'), 'success')
  }

  const url = settings?.link_token ? shareUrl(settings.link_token) : ''
  const access = settings?.link_access ?? 'off'
  const expiry = expiryFor(settings?.link_expires_at ?? null)

  return (
    <section
      aria-labelledby="share-link"
      className="flex flex-col gap-3 border-t-2 border-line-soft pt-5"
    >
      <h3 id="share-link" className="flex items-center gap-2 text-sm font-semibold">
        <Link2 size={16} aria-hidden />
        {t('share.link.title')}
      </h3>
      {error && <Alert tone="danger">{error}</Alert>}
      {!settings && !error ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> {t('common.loading')}
        </div>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label={t('share.link.access')}
            className="grid grid-cols-3 gap-2"
          >
            {ACCESS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={access === a}
                disabled={busy}
                onClick={() => void apply(a, expiry)}
                className={cn(
                  'flex min-h-11 cursor-pointer flex-col items-start rounded-neo border-2 px-3 py-2 text-start',
                  access === a
                    ? 'border-line bg-ink text-paper'
                    : 'border-line-soft hover:bg-surface-muted',
                )}
              >
                <span className="text-sm font-bold">{t(`share.link.${a}`)}</span>
                <span className={cn('text-xs', access === a ? 'text-paper/80' : 'text-ink-muted')}>
                  {t(`share.link.${a}Hint`)}
                </span>
              </button>
            ))}
          </div>
          {access !== 'off' && url && (
            <>
              <div className="flex gap-2">
                <input
                  readOnly
                  dir="ltr"
                  value={url}
                  aria-label={t('share.link.address')}
                  onFocus={(e) => e.target.select()}
                  className={cn(controlClasses(), 'min-w-0 flex-1 font-mono text-xs')}
                />
                <Button
                  variant="secondary"
                  icon={copied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1800)
                    } catch {
                      toast(t('share.link.copyFailed'), 'danger')
                    }
                  }}
                >
                  {copied ? t('share.link.copied') : t('share.link.copy')}
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <SelectField
                  label={t('share.link.expires')}
                  className="w-48"
                  value={expiry}
                  disabled={busy}
                  onChange={(e) => void apply(access, e.target.value as Expiry)}
                  options={EXPIRY.map((x) => ({
                    value: x,
                    label:
                      x === 'never'
                        ? t('share.link.never')
                        : t('share.link.days', { count: Number(x) }),
                  }))}
                />
                <Button
                  variant={confirmReset ? 'danger' : 'ghost'}
                  icon={<RotateCcw size={16} aria-hidden />}
                  disabled={busy}
                  onClick={() => void reset()}
                >
                  {confirmReset ? t('share.link.confirmReset') : t('share.link.reset')}
                </Button>
              </div>
              {settings?.link_expires_at && (
                <p className="text-xs text-ink-muted">
                  {t('share.link.until', {
                    date: new Date(settings.link_expires_at).toLocaleString(i18n.language),
                  })}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
