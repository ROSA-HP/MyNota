import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  BookOpen,
  ClipboardPaste,
  FileText,
  Flag,
  FolderInput,
  KeyRound,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { PALETTE } from '@/ai/pipeline/convert'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Panel,
  Spinner,
  TextField,
  buttonClasses,
  toast,
} from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { InvitesPanel } from '@/features/sharing/InvitesPanel'
import { useInvites } from '@/features/sharing/invitesStore'
import { ReportDialog } from '@/features/sharing/ReportDialog'
import { shareError } from '@/features/sharing/shareApi'
import { supabase } from '@/lib/supabase'
import { chapterColor } from '@/features/workspace/canvas/visuals'
import { cn } from '@/lib/cn'
import type { ChapterColor, MapRow, MapStatsRow, SubjectRow } from '@/lib/database.types'
import { COVER, SubjectDot, useUpdated } from './mapBits'
import { MapPreviewArt } from './MapPreviewArt'
import { useLibrary } from './useLibrary'

const TYPE_ICON = { book: BookOpen, notes: FileText, blank: Square }
const MAP_DRAG = 'application/x-mynota-map'

function EmptyLibrary() {
  const { t } = useTranslation()
  const steps = [
    { Icon: KeyRound, label: t('library.empty.step1'), tint: 'bg-ch-yellow' },
    { Icon: ClipboardPaste, label: t('library.empty.step2'), tint: 'bg-ch-sky' },
    { Icon: Sparkles, label: t('library.empty.step3'), tint: 'bg-ch-mint' },
  ]
  return (
    <Panel className="grid items-center gap-8 overflow-hidden p-6 md:grid-cols-[1fr_1.1fr] md:p-10">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('library.empty.title')}</h2>
        <p className="mt-2 text-ink-muted">{t('library.empty.body')}</p>
        <Link to="/new" className={buttonClasses({ className: 'mt-5' })}>
          <Plus size={18} aria-hidden />
          {t('library.newMap')}
        </Link>
        <ol className="mt-6 flex flex-col gap-3">
          {steps.map(({ Icon, label, tint }) => (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-neo border-2 border-line text-ink',
                  tint,
                )}
              >
                <Icon size={19} aria-hidden />
              </span>
              <span className="font-semibold">{label}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-neo-lg border-2 border-line bg-paper p-2" aria-hidden>
        <MapPreviewArt className="block h-auto w-full opacity-90" />
      </div>
    </Panel>
  )
}

/** Closes a small popover menu on Escape or a pointer press outside it. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, ref, close])
}

function MapCard({
  map,
  stats,
  subjects,
  movable,
  onMove,
  onLeave,
  onReport,
}: {
  map: MapRow
  stats: MapStatsRow | undefined
  subjects: SubjectRow[]
  movable: boolean
  onMove: (subjectId: string | null) => void
  /** Shared maps (not yours): leave it, or report it. */
  onLeave?: () => void
  onReport?: () => void
}) {
  const { t } = useTranslation()
  const updated = useUpdated()
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const Icon = TYPE_ICON[map.type]
  const book = map.type === 'book' && stats && stats.chapters > 0

  const closeMenu = useCallback(() => setMenu(false), [])
  useDismiss(menu, menuRef, closeMenu)

  const meta = book
    ? `${t('library.chaptersBuilt', { built: stats.chapters_built, total: stats.chapters })} · ${updated(map.updated_at)}`
    : stats
      ? `${t('library.blocks', { count: stats.blocks })} · ${updated(map.updated_at)}`
      : updated(map.updated_at)

  return (
    <div
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.setData(MAP_DRAG, map.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="group relative"
    >
      <Panel
        shadow="md"
        className="relative h-full overflow-hidden transition-transform group-hover:-translate-y-0.5"
      >
        <div
          className={cn(
            'flex h-20 items-center gap-2 border-b-2 border-line px-3',
            book ? 'bg-ch-mint' : COVER[map.cover_color],
          )}
        >
          {book &&
            stats.chapter_colors
              .slice(0, 6)
              .map((c, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="h-14 flex-1 rounded-[6px] border-2 border-line"
                  style={{ background: chapterColor(c).fill }}
                />
              ))}
        </div>
        <div className="p-4">
          <Badge>
            <Icon size={12} aria-hidden /> {t(`library.types.${map.type}`)}
          </Badge>
          <h3 className="mt-2 line-clamp-2 font-bold" dir="auto">
            <Link
              to={`/maps/${map.id}`}
              draggable={false}
              className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-brand"
            >
              {map.title}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-ink-muted">{meta}</p>
          {book && (
            <span
              aria-hidden
              className="mt-2.5 flex h-2.5 overflow-hidden rounded-full border-[1.5px] border-line bg-surface"
            >
              <span
                className="bg-brand"
                style={{ width: `${(stats.chapters_built / stats.chapters) * 100}%` }}
              />
            </span>
          )}
        </div>
      </Panel>
      {(movable || onLeave) && (
        <div ref={menuRef} className="absolute end-2 top-2 z-10">
          <button
            type="button"
            aria-label={t('library.mapMenu', { title: map.title })}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-neo border-2 border-line bg-surface opacity-90 hover:opacity-100"
          >
            <MoreHorizontal size={17} />
          </button>
          {menu && (
            <div
              role="menu"
              className="absolute end-0 top-11 w-56 rounded-neo-lg border-2 border-line bg-surface p-1.5 neo-shadow"
            >
              {!movable && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false)
                      onLeave?.()
                    }}
                    className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-start text-sm font-semibold hover:bg-paper-sunken"
                  >
                    <LogOut size={15} aria-hidden className="rtl:-scale-x-100" /> {t('share.leave')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false)
                      onReport?.()
                    }}
                    className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-start text-sm font-semibold text-danger hover:bg-paper-sunken"
                  >
                    <Flag size={15} aria-hidden /> {t('link.report')}
                  </button>
                </>
              )}
              {movable && (
                <p className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-ink-muted">
                  <FolderInput size={13} aria-hidden /> {t('library.moveTo')}
                </p>
              )}
              {movable &&
                [...subjects.map((s) => ({ id: s.id, name: s.name, color: s.color })), null].map(
                  (s) => (
                    <button
                      key={s?.id ?? 'none'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={(s?.id ?? null) === map.subject_id}
                      onClick={() => {
                        setMenu(false)
                        onMove(s?.id ?? null)
                      }}
                      className={cn(
                        'flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-start text-sm font-semibold hover:bg-paper-sunken',
                        (s?.id ?? null) === map.subject_id && 'bg-paper-sunken',
                      )}
                    >
                      {s ? <SubjectDot color={s.color} /> : <span className="size-3" />}
                      <span dir="auto" className="truncate">
                        {s ? s.name : t('library.noSubject')}
                      </span>
                    </button>
                  ),
                )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SubjectDialog({
  open,
  subject,
  onClose,
  onSave,
}: {
  open: boolean
  subject: SubjectRow | null
  onClose: () => void
  onSave: (name: string, color: ChapterColor) => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [color, setColor] = useState<ChapterColor>('mint')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [seenOpen, setSeenOpen] = useState(false)
  // Reset the form each time the dialog opens (state derived from props, no effect).
  if (open !== seenOpen) {
    setSeenOpen(open)
    if (open) {
      setName(subject?.name ?? '')
      setColor(subject?.color ?? 'mint')
      setError(null)
    }
  }
  async function save() {
    if (!name.trim()) return setError(t('library.subject.errName'))
    setBusy(true)
    try {
      await onSave(name.trim().slice(0, 80), color)
      onClose()
    } catch {
      setError(t('library.subject.saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={subject ? t('library.subject.edit') : t('library.newSubject')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            {subject ? t('common.save') : t('library.subject.create')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField
          label={t('library.subject.name')}
          value={name}
          maxLength={80}
          autoFocus
          dir="auto"
          error={error}
          onChange={(e) => setName(e.target.value)}
        />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('library.subject.color')}</legend>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <label
                key={c}
                className={cn(
                  'flex size-11 cursor-pointer items-center justify-center rounded-full border-2',
                  color === c
                    ? 'border-line outline-3 outline-offset-2 outline-ink'
                    : 'border-line-soft',
                )}
                style={{ background: chapterColor(c).fill }}
              >
                <input
                  type="radio"
                  name="subject-color"
                  value={c}
                  checked={color === c}
                  onChange={() => setColor(c)}
                  aria-label={t(`library.colors.${c}`)}
                  className="sr-only"
                />
                <SubjectDot color={c} className="size-4" />
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

type Group = { key: string; subject: SubjectRow | null; shared?: boolean; maps: MapRow[] }

export function LibraryPage() {
  const { t } = useTranslation()
  const userId = useAuth((s) => s.session?.user.id)
  const { state, reload, createSubject, updateSubject, deleteSubject, moveMap } = useLibrary()
  const [params, setParams] = useSearchParams()
  const filter = params.get('subject')
  const [editing, setEditing] = useState<{ open: boolean; subject: SubjectRow | null }>({
    open: false,
    subject: null,
  })
  const [deleting, setDeleting] = useState<SubjectRow | null>(null)
  const [leaving, setLeaving] = useState<MapRow | null>(null)
  const [reporting, setReporting] = useState<string | null>(null)
  useEffect(() => {
    void useInvites.getState().load()
  }, [])
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [subjectMenu, setSubjectMenu] = useState<string | null>(null)
  const subjectMenuRef = useRef<HTMLDivElement>(null)
  const closeSubjectMenu = useCallback(() => setSubjectMenu(null), [])
  useDismiss(subjectMenu !== null, subjectMenuRef, closeSubjectMenu)

  const ready = state.status === 'ready' ? state : null
  const subjects = useMemo(() => ready?.subjects ?? [], [ready])
  const activeSubject = subjects.find((s) => s.id === filter) ?? null
  const own = (m: MapRow) => !userId || m.owner_id === userId

  const groups = useMemo<Group[]>(() => {
    if (!ready) return []
    const out: Group[] = subjects.map((s) => ({
      key: s.id,
      subject: s,
      maps: ready.maps.filter((m) => m.subject_id === s.id),
    }))
    const known = new Set(subjects.map((s) => s.id))
    out.push({
      key: 'none',
      subject: null,
      maps: ready.maps.filter((m) => own(m) && (!m.subject_id || !known.has(m.subject_id))),
    })
    out.push({
      key: 'shared',
      subject: null,
      shared: true,
      maps: ready.maps.filter((m) => !own(m)),
    })
    return out
    // own() depends only on userId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, subjects, userId])
  const visible = activeSubject
    ? groups.filter((g) => g.subject?.id === activeSubject.id)
    : groups.filter((g) => g.maps.length > 0 || g.subject)

  const move = (mapId: string, subjectId: string | null) => {
    const subject = subjects.find((s) => s.id === subjectId)
    moveMap(mapId, subjectId)
      .then(() =>
        toast(
          subject ? t('library.moved', { name: subject.name }) : t('library.movedNone'),
          'success',
        ),
      )
      .catch(() => toast(t('library.subject.saveFailed'), 'danger'))
  }
  /** Drop handlers for a subject chip or group (null = no subject). */
  const dropZone = (key: string, subjectId: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(MAP_DRAG)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(key)
    },
    onDragLeave: () => setDropTarget((d) => (d === key ? null : d)),
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData(MAP_DRAG)
      setDropTarget(null)
      if (!id) return
      e.preventDefault()
      const map = ready?.maps.find((m) => m.id === id)
      if (map && map.subject_id !== subjectId) move(id, subjectId)
    },
  })
  const setFilter = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('subject', id)
    else next.delete('subject')
    setParams(next, { replace: true })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t('library.title')}</h1>
        <Link
          to={activeSubject ? `/new?subject=${activeSubject.id}` : '/new'}
          className={buttonClasses({})}
        >
          <Plus size={18} aria-hidden />
          {t('library.newMap')}
        </Link>
      </div>

      <div className="mt-6">
        <InvitesPanel onAccepted={() => void reload()} />
      </div>

      {ready && ready.maps.length + subjects.length > 0 && (
        <div role="group" aria-label={t('library.subjects')} className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={!activeSubject}
            onClick={() => setFilter(null)}
            className={cn(
              'h-10 cursor-pointer rounded-full border-2 border-line px-3.5 text-sm font-semibold',
              !activeSubject
                ? 'bg-selected text-selected-ink'
                : 'bg-surface hover:bg-surface-muted',
            )}
          >
            {t('library.all')} · {ready.maps.length}
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={activeSubject?.id === s.id}
              onClick={() => setFilter(activeSubject?.id === s.id ? null : s.id)}
              {...dropZone(`chip:${s.id}`, s.id)}
              className={cn(
                'inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border-2 border-line px-3.5 text-sm font-semibold',
                activeSubject?.id === s.id
                  ? 'bg-selected text-selected-ink'
                  : 'bg-surface hover:bg-surface-muted',
                dropTarget === `chip:${s.id}` && 'outline-3 outline-offset-2 outline-brand',
              )}
            >
              <SubjectDot color={s.color} />
              <span dir="auto">{s.name}</span> ·{' '}
              {ready.maps.filter((m) => m.subject_id === s.id).length}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEditing({ open: true, subject: null })}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border-2 border-dashed border-line px-3.5 text-sm font-semibold hover:bg-surface"
          >
            <Plus size={15} aria-hidden /> {t('library.newSubject')}
          </button>
        </div>
      )}

      <div className="mt-6">
        {state.status === 'loading' && (
          <div className="flex justify-center py-20">
            <Spinner size={28} />
          </div>
        )}
        {state.status === 'error' && (
          <Alert tone="danger">
            <div className="flex flex-wrap items-center gap-3">
              {t('library.loadFailed')}
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw size={15} aria-hidden />}
                onClick={() => void reload()}
              >
                {t('library.retry')}
              </Button>
            </div>
          </Alert>
        )}
        {ready && ready.maps.length === 0 && subjects.length === 0 && <EmptyLibrary />}
        {ready && (ready.maps.length > 0 || subjects.length > 0) && (
          <div className="flex flex-col gap-8">
            {visible.map((g) => {
              const headed = subjects.length > 0 || g.shared
              const zone = g.shared ? {} : dropZone(`group:${g.key}`, g.subject?.id ?? null)
              return (
                <section
                  key={g.key}
                  aria-labelledby={`g-${g.key}`}
                  {...zone}
                  className={cn(
                    'rounded-neo-lg',
                    dropTarget === `group:${g.key}` && 'outline-3 outline-offset-8 outline-brand',
                  )}
                >
                  {headed && (
                    <div className="mb-3 flex items-center gap-2.5">
                      {g.subject && <SubjectDot color={g.subject.color} />}
                      <h2
                        id={`g-${g.key}`}
                        dir="auto"
                        className={cn('text-lg font-bold', !g.subject && 'text-ink-muted')}
                      >
                        {g.subject
                          ? g.subject.name
                          : g.shared
                            ? t('library.shared')
                            : t('library.noSubject')}
                      </h2>
                      <span className="text-xs font-semibold tabular-nums text-ink-muted">
                        {t('library.mapCount', { count: g.maps.length })}
                      </span>
                      {g.subject && (
                        <div className="relative ms-auto">
                          <button
                            type="button"
                            aria-label={t('library.subject.menu', { name: g.subject.name })}
                            aria-haspopup="menu"
                            aria-expanded={subjectMenu === g.key}
                            onClick={() => setSubjectMenu(subjectMenu === g.key ? null : g.key)}
                            className="flex size-9 cursor-pointer items-center justify-center rounded-neo hover:bg-paper-sunken"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          {subjectMenu === g.key && (
                            <div
                              ref={subjectMenuRef}
                              role="menu"
                              className="absolute end-0 top-10 z-10 w-48 rounded-neo-lg border-2 border-line bg-surface p-1.5 neo-shadow"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setSubjectMenu(null)
                                  setEditing({ open: true, subject: g.subject })
                                }}
                                className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold hover:bg-paper-sunken"
                              >
                                <Pencil size={15} aria-hidden /> {t('library.subject.edit')}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setSubjectMenu(null)
                                  setDeleting(g.subject)
                                }}
                                className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold text-danger hover:bg-danger-soft"
                              >
                                <Trash size={15} aria-hidden /> {t('library.subject.delete')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {g.maps.length ? (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {g.maps.map((m) => (
                        <MapCard
                          key={m.id}
                          map={m}
                          stats={ready.stats[m.id]}
                          subjects={subjects}
                          movable={own(m)}
                          onMove={(sid) => move(m.id, sid)}
                          onLeave={own(m) ? undefined : () => setLeaving(m)}
                          onReport={own(m) ? undefined : () => setReporting(m.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3 rounded-neo-lg border-2 border-dashed border-line-soft p-5 text-sm text-ink-muted">
                      {t('library.emptySubject')}
                      <Link
                        to={g.subject ? `/new?subject=${g.subject.id}` : '/new'}
                        className="font-semibold text-brand underline underline-offset-4"
                      >
                        {t('library.newMap')}
                      </Link>
                    </div>
                  )}
                  {!g.subject && !g.shared && subjects.length > 0 && g.maps.length > 0 && (
                    <p className="mt-2 text-xs text-ink-muted">{t('library.dragHint')}</p>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>

      <SubjectDialog
        open={editing.open}
        subject={editing.subject}
        onClose={() => setEditing({ open: false, subject: null })}
        onSave={async (name, color) => {
          if (editing.subject) await updateSubject(editing.subject.id, { name, color })
          else await createSubject(name, color)
        }}
      />
      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={t('library.subject.deleteTitle', { name: deleting?.name ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const s = deleting
                setDeleting(null)
                if (!s) return
                if (activeSubject?.id === s.id) setFilter(null)
                deleteSubject(s.id).catch(() => toast(t('library.subject.saveFailed'), 'danger'))
              }}
            >
              {t('library.subject.delete')}
            </Button>
          </>
        }
      >
        <p>{t('library.subject.deleteBody')}</p>
      </Dialog>
      <Dialog
        open={Boolean(leaving)}
        onClose={() => setLeaving(null)}
        title={t('library.leaveTitle', { title: leaving?.title ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaving(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const m = leaving
                setLeaving(null)
                if (!m || !userId) return
                const { error } = await supabase.rpc('member_remove', {
                  p_map: m.id,
                  p_user: userId,
                })
                if (error) return toast(t(shareError(error)), 'danger')
                toast(t('share.left'), 'success')
                void reload()
              }}
            >
              {t('share.leave')}
            </Button>
          </>
        }
      >
        <p>{t('library.leaveBody')}</p>
      </Dialog>
      {reporting && (
        <ReportDialog open onClose={() => setReporting(null)} target={{ mapId: reporting }} />
      )}
    </div>
  )
}
