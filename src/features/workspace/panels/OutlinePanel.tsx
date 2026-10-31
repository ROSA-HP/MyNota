import { useMemo, useState } from 'react'
import { motionMs } from '@/lib/motion'
import { useReactFlow } from '@xyflow/react'
import { ChevronDown, ChevronRight, Search, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import type { NodeRow } from '@/lib/database.types'
import { matchesQuery } from '@/lib/searchText'
import { Spinner } from '@/components/ui'
import { useChapterBuilder } from '../bookBuild'
import { useBuild } from '../buildStore'
import { childrenIndex, findRoot } from '../canvas/layout'
import { OUTLINE_DRAG_TYPE } from '../canvas/linking'
import { chapterColor } from '../canvas/visuals'
import { chapterSummaries, type ChapterSummary } from '../canvas/zoom'
import { useCanvasUi } from '../canvas/canvasUi'
import { useWorkspace } from '../workspaceStore'

/** Whole map as a tree; click flies to the node. The filter matches titles and summaries. */
export function OutlinePanel({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const nodes = useWorkspace((s) => s.nodes)
  const selectedId = useWorkspace((s) => s.selectedId)
  const select = useWorkspace((s) => s.select)
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const update = useWorkspace((s) => s.updateNode)
  const { setCenter, getInternalNode } = useReactFlow()
  const [filter, setFilter] = useState('')
  const list = useMemo(() => Object.values(nodes), [nodes])
  const kids = useMemo(() => childrenIndex(list), [list])
  const root = useMemo(() => findRoot(list), [list])
  const sources = useWorkspace((s) => s.sources)
  const book = root?.level === 'book'
  const chapters = useMemo(
    () => (book && root ? chapterSummaries(nodes, sources, root.id) : []),
    [book, root, nodes, sources],
  )
  const chapterById = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters])
  const live = useBuild((s) => s.chapters)
  const { build, canBuild } = useChapterBuilder()
  const waiting = chapters.filter(
    (c) => (c.progress === 'waiting' || c.progress === 'partial') && !live[c.id],
  )
  const q = filter.trim()
  const cover = useCanvasUi((s) => s.cover)
  const revealed = useCanvasUi((s) => s.revealed)
  const hiddenTitle = (n: NodeRow) => cover && n.level === 'block' && !revealed.includes(n.id)

  const matches = (n: NodeRow): boolean =>
    !q ||
    (!hiddenTitle(n) && matchesQuery(n.title, q)) ||
    (!hiddenTitle(n) && matchesQuery(n.summary, q)) ||
    (kids.get(n.id) ?? []).some(matches)

  const go = (n: NodeRow) => {
    select(n.id)
    const internal = getInternalNode(n.id)
    if (internal) {
      const { x, y } = internal.internals.positionAbsolute
      void setCenter(
        x + (internal.measured.width ?? 0) / 2,
        y + (internal.measured.height ?? 0) / 2,
        { zoom: 1, duration: motionMs(350) },
      )
    }
    onNavigate?.()
  }

  // Hide details: block titles stay covered here too, until revealed on the map.
  const hidden = (n: NodeRow) => hiddenTitle(n) && n.id !== selectedId

  const renderNode = (n: NodeRow, depth: number, color: NodeRow['color']): React.ReactNode => {
    if (!matches(n)) return null
    const children = kids.get(n.id) ?? []
    const open = q ? true : !n.collapsed
    return (
      <li key={n.id}>
        <div
          className={cn(
            'flex items-center gap-1 rounded-lg',
            n.id === selectedId && 'bg-surface outline-2 outline-line',
          )}
          style={{ paddingInlineStart: depth * 14 }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              aria-label={hiddenTitle(n) ? t('ws.studyView.covered') : n.title}
              aria-expanded={open}
              disabled={!canEdit && !q}
              onClick={() => canEdit && update(n.id, { collapsed: !n.collapsed })}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-paper-sunken pointer-coarse:size-11"
            >
              {open ? (
                <ChevronDown size={17} aria-hidden />
              ) : (
                <ChevronRight size={17} aria-hidden className="rtl:-scale-x-100" />
              )}
            </button>
          ) : (
            <span className="size-7 shrink-0" />
          )}
          {depth === 1 &&
            (chapterById.get(n.id) ? (
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line font-mono text-[10px] font-bold"
                style={{ background: chapterColor(color).fill }}
              >
                {chapterById.get(n.id)?.number}
              </span>
            ) : (
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[3px] border-[1.5px] border-line"
                style={{ background: chapterColor(color).strong }}
              />
            ))}
          <button
            type="button"
            onClick={() => go(n)}
            draggable={canEdit && depth > 0}
            onDragStart={(e) => {
              e.dataTransfer.setData(OUTLINE_DRAG_TYPE, n.id)
              e.dataTransfer.effectAllowed = 'link'
            }}
            title={canEdit && depth > 0 ? t('ws.link.dragFromOutline') : undefined}
            dir="auto"
            className={cn(
              'min-h-9 min-w-0 flex-1 cursor-pointer truncate rounded-md px-1.5 text-start text-sm',
              depth === 0
                ? 'font-bold'
                : depth === 1
                  ? 'font-semibold'
                  : n.importance === 'extra'
                    ? 'text-ink-muted'
                    : '',
            )}
          >
            {hidden(n) ? (
              <span className="tracking-widest text-ink-faint">
                <span aria-hidden>••••••</span>
                <span className="sr-only">{t('ws.studyView.covered')}</span>
              </span>
            ) : (
              n.title
            )}
          </button>
          {chapterById.get(n.id) ? (
            <ChapterChip chapter={chapterById.get(n.id) as ChapterSummary} />
          ) : (
            depth === 1 &&
            children.length > 0 && (
              <span className="pe-1.5 font-mono text-[11px] font-bold text-ink-muted">
                {children.length}
              </span>
            )
          )}
        </div>
        {open && children.length > 0 && (
          <ul>{children.map((c) => renderNode(c, depth + 1, depth === 0 ? c.color : color))}</ul>
        )}
      </li>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold">{t('ws.outline')}</h2>
        <span className="text-xs font-semibold tabular-nums text-ink-muted">
          {t('ws.nodes', { count: list.length })}
        </span>
      </div>
      <label className="flex min-h-10 items-center gap-2 rounded-neo border-2 border-line bg-surface px-2.5">
        <Search size={15} aria-hidden className="text-ink-muted" />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('ws.filter')}
          aria-label={t('ws.filter')}
          dir="auto"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>
      {book && chapters.length > 0 && (
        <div className="flex flex-col gap-2 rounded-neo border-2 border-line bg-surface p-2.5">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
            <span>
              {t('ws.book.chaptersBuilt', {
                done: chapters.filter((c) => c.progress === 'built').length,
                total: chapters.length,
              })}
            </span>
          </div>
          <span aria-hidden className="flex h-2 gap-0.5">
            {chapters.map((c) => (
              <span
                key={c.id}
                className="flex-1 rounded-[2px] border border-line"
                style={{
                  background:
                    c.progress === 'built'
                      ? chapterColor(c.color).strong
                      : c.progress === 'partial'
                        ? chapterColor(c.color).fill
                        : 'var(--surface)',
                }}
              />
            ))}
          </span>
          {canEdit && canBuild && waiting.length > 0 && (
            <button
              type="button"
              onClick={() => build(waiting.map((c) => c.id))}
              className="neo-btn flex min-h-10 items-center justify-center gap-2 text-sm"
            >
              <Sparkles size={15} aria-hidden />
              {t('ws.book.buildAll', { count: waiting.length })}
            </button>
          )}
        </div>
      )}
      <ul className="-mx-1 flex-1 overflow-y-auto px-1">{root && renderNode(root, 0, null)}</ul>
    </div>
  )
}

/** A chapter's state in the outline: building now, in the queue, not built, or unfinished. */
function ChapterChip({ chapter }: { chapter: ChapterSummary }) {
  const { t } = useTranslation()
  const live = useBuild((s) => s.chapters[chapter.id])
  if (live === 'running')
    return (
      <span className="flex shrink-0 items-center pe-1.5" title={t('ws.book.building')}>
        <Spinner size={13} />
      </span>
    )
  const label =
    live === 'queued'
      ? t('ws.book.queued')
      : chapter.progress === 'waiting' ||
          chapter.progress === 'partial' ||
          chapter.progress === 'empty'
        ? t(`ws.book.status.${chapter.progress}`)
        : null
  if (!label)
    return (
      <span className="pe-1.5 font-mono text-[11px] font-bold text-ink-muted">
        {chapter.blocks}
      </span>
    )
  return (
    <span
      className={cn(
        'me-1 shrink-0 rounded-full border-[1.5px] px-1.5 text-[10.5px] font-bold whitespace-nowrap',
        chapter.progress === 'partial'
          ? 'border-line bg-warning-soft'
          : 'border-dashed border-ink-muted text-ink-muted',
      )}
    >
      {label}
    </span>
  )
}
