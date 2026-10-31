import { useMemo } from 'react'
import { motionMs } from '@/lib/motion'
import { useReactFlow } from '@xyflow/react'
import { ArrowLeftRight, ArrowRight, Check, Search, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { ParseKeys } from 'i18next'
import { Alert, Button, IconButton, Spinner } from '@/components/ui'
import { useAiKey } from '@/features/settings/aiKeyStore'
import { cn } from '@/lib/cn'
import type { ChapterColor, NodeRow, RelationRow } from '@/lib/database.types'
import { useCanvasUi } from '../canvas/canvasUi'
import { FIT } from '../canvas/fit'
import { findRoot } from '../canvas/layout'
import { chapterColor } from '../canvas/visuals'
import { LEVEL_THRESHOLDS } from '../canvas/zoom'
import { useNow } from '../BuildBanner'
import { useLinks } from '../linksStore'
import { useWorkspace } from '../workspaceStore'

/** The color a node shows on the map: its chapter's (books) or its section's (notes). */
export function groupColor(nodes: Record<string, NodeRow>, id: string): ChapterColor | null {
  const root = findRoot(Object.values(nodes))
  let cur = nodes[id]
  if (!root) return null
  // Walk up to the child of the root: the chapter (books) or the section (notes).
  while (cur?.parent_id && cur.parent_id !== root.id) cur = nodes[cur.parent_id]
  return cur && cur.id !== root.id ? (cur.color ?? null) : null
}

export function useSuggestions(): RelationRow[] {
  const relations = useWorkspace((s) => s.relations)
  const nodes = useWorkspace((s) => s.nodes)
  return useMemo(
    () =>
      Object.values(relations)
        .filter((r) => r.status === 'suggested' && nodes[r.from_node] && nodes[r.to_node])
        .sort(
          (a, b) =>
            (a.confidence === 'high' ? 0 : 1) - (b.confidence === 'high' ? 0 : 1) ||
            a.created_at.localeCompare(b.created_at),
        ),
    [relations, nodes],
  )
}

/** Runs a links pass for the whole map: between chapters (books) or between sections. */
export function useFindLinks() {
  const key = useAiKey((s) => s.key)
  const run = useLinks((s) => s.run)
  return {
    canFind: Boolean(key),
    find: () => {
      const ws = useWorkspace.getState()
      const root = findRoot(Object.values(ws.nodes))
      if (!key || !root) return
      void run(
        root.level === 'book' ? { kind: 'book' } : { kind: 'chapter', chapterId: root.id },
        key,
      )
    },
  }
}

function Swatch({ color }: { color: ChapterColor | null }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 rounded-[3px] border-[1.5px] border-line align-[-1px]"
      style={{ background: chapterColor(color).fill }}
    />
  )
}

function LinksStatusLine() {
  const { t } = useTranslation()
  const status = useLinks((s) => s.status)
  const now = useNow(status.state === 'waiting')
  if (status.state === 'running')
    return (
      <p className="flex items-center gap-2 text-sm font-semibold" role="status">
        <Spinner size={14} />
        {status.scope === 'book' ? t('ws.suggest.runningBook') : t('ws.suggest.running')}
      </p>
    )
  if (status.state === 'waiting')
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted" role="status">
        <Spinner size={14} />
        {t('ws.suggest.waiting', {
          s: Math.max(1, Math.ceil((status.until - now) / 1000)),
        })}
      </p>
    )
  if (status.state === 'failed')
    return (
      <Alert tone="danger">
        {t('ws.suggest.failed')} {t(`ai.errors.${status.kind}` as ParseKeys)}
      </Alert>
    )
  if (status.state === 'done' && status.found === 0)
    return <p className="text-sm text-ink-muted">{t('ws.suggest.nothingNew')}</p>
  return null
}

/** Right panel: AI-suggested links to accept or dismiss (docs/screens.md › Suggested links). */
export function LinksTray({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const nodes = useWorkspace((s) => s.nodes)
  const map = useWorkspace((s) => s.map)
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const updateRelation = useWorkspace((s) => s.updateRelation)
  const suggestions = useSuggestions()
  const strong = suggestions.filter((r) => r.confidence === 'high')
  const busy = useLinks((s) => s.status.state === 'running' || s.status.state === 'waiting')
  const { find, canFind } = useFindLinks()
  const setSpotlight = useCanvasUi((s) => s.setSpotlight)
  const spotlight = useCanvasUi((s) => s.spotlight)
  const { fitView } = useReactFlow()
  const book = map?.type === 'book'

  const setAll = (rows: RelationRow[], status: RelationRow['status']) =>
    rows.forEach((r) => updateRelation(r.id, { status }))

  const show = (r: RelationRow) => {
    setSpotlight([r.from_node, r.to_node])
    useCanvasUi.getState().lockView()
    void fitView({
      nodes: [{ id: r.from_node }, { id: r.to_node }],
      ...FIT,
      // Close enough that single blocks (and the dashed link) are drawn.
      minZoom: book
        ? LEVEL_THRESHOLDS.book.sections + 0.02
        : LEVEL_THRESHOLDS.notes.sections + 0.02,
      maxZoom: 1,
      duration: motionMs(450),
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b-2 border-line px-4 py-3">
        <h2 className="text-lg font-bold">{t('ws.suggest.title')}</h2>
        <span className="font-mono text-xs font-bold text-ink-muted">{suggestions.length}</span>
        <IconButton
          label={t('ws.panel.close')}
          bordered={false}
          className="ms-auto size-9"
          onClick={onClose}
        >
          <X size={18} />
        </IconButton>
      </div>

      {canEdit && suggestions.length > 0 && (
        <div className="flex gap-2 border-b-2 border-line-soft p-3">
          <Button
            size="sm"
            className="flex-1"
            disabled={!strong.length}
            icon={<Check size={15} strokeWidth={3} aria-hidden />}
            onClick={() => setAll(strong, 'accepted')}
          >
            {t('ws.suggest.acceptStrong', { count: strong.length })}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => setAll(suggestions, 'dismissed')}
          >
            {t('ws.suggest.dismissAll')}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <LinksStatusLine />
        {suggestions.length === 0 && !busy && (
          <div className="flex flex-col items-start gap-3 rounded-neo-lg border-2 border-dashed border-line-soft p-4">
            <span className="flex size-10 items-center justify-center rounded-neo border-2 border-line bg-ch-yellow">
              <Sparkles size={18} aria-hidden />
            </span>
            <p className="font-bold">{t('ws.suggest.empty')}</p>
            <p className="text-sm text-ink-muted">{t('ws.suggest.emptyBody')}</p>
          </div>
        )}
        {suggestions.map((r) => {
          const from = nodes[r.from_node]
          const to = nodes[r.to_node]
          if (!from || !to) return null
          const shown = spotlight.includes(r.from_node) && spotlight.includes(r.to_node)
          const Arrow = r.direction === 'both' ? ArrowLeftRight : ArrowRight
          return (
            <article
              key={r.id}
              className={cn(
                'flex flex-col gap-2 rounded-neo-lg border-2 border-line bg-surface p-3',
                shown && 'bg-success-soft/40 outline-2 outline-line',
              )}
            >
              <p className="text-[15px] leading-snug font-bold">
                <Swatch color={groupColor(nodes, from.id)} /> <span dir="auto">{from.title}</span>{' '}
                <Arrow
                  size={14}
                  aria-hidden
                  className="mx-0.5 inline align-[-2px] text-ink-muted rtl:-scale-x-100"
                />{' '}
                <Swatch color={groupColor(nodes, to.id)} /> <span dir="auto">{to.title}</span>
              </p>
              <p className="flex items-center gap-2 text-xs font-bold">
                <span
                  dir="auto"
                  className="rounded-full border-[1.5px] border-dashed border-brand px-2 py-0.5"
                >
                  {r.label || t(`ws.relations.${r.type}`)}
                </span>
                <span className={r.confidence === 'high' ? 'text-success' : 'text-ink-muted'}>
                  {r.confidence === 'high' ? t('ws.suggest.strong') : t('ws.suggest.medium')}
                </span>
              </p>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="bg-success-soft"
                      onClick={() => updateRelation(r.id, { status: 'accepted' })}
                    >
                      {t('ws.suggest.accept')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => updateRelation(r.id, { status: 'dismissed' })}
                    >
                      {t('ws.suggest.dismiss')}
                    </Button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => show(r)}
                  className="ms-auto min-h-9 cursor-pointer px-2 pointer-coarse:min-h-11 text-sm font-bold text-brand underline-offset-4 hover:underline"
                >
                  {t('ws.suggest.show')}
                </button>
              </div>
            </article>
          )
        })}
        {canEdit &&
          (canFind ? (
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              loading={busy}
              disabled={busy}
              icon={<Search size={15} aria-hidden />}
              onClick={find}
            >
              {suggestions.length
                ? t('ws.suggest.findMore')
                : book
                  ? t('ws.suggest.findBook')
                  : t('ws.suggest.find')}
            </Button>
          ) : (
            <Link to="/settings" className="text-sm font-semibold underline">
              {t('ws.suggest.needKey')}
            </Link>
          ))}
      </div>

      <p className="border-t-2 border-line-soft px-4 py-3 text-sm text-ink-muted">
        {t('ws.suggest.note')}
      </p>
    </div>
  )
}
