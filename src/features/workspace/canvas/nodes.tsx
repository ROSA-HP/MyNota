import { useLayoutEffect, useRef, type PointerEvent } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { CircleAlert, Clock, Maximize2, Pencil, RotateCcw, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui'
import { MathFormula } from '@/components/ui/MathFormula'
import { useKeyFor } from '@/features/settings/aiKeyStore'
import { useDeck } from '@/features/study/deckStore'
import { masteryMapFor, type Mastery } from '@/features/study/mastery'
import { cn } from '@/lib/cn'
import type { ChapterColor, MapRow, NodeRow } from '@/lib/database.types'
import { useChapterBuilder } from '../bookBuild'
import { EditingTag } from '../live/LivePresence'
import { useBuild } from '../buildStore'
import { useWorkspace } from '../workspaceStore'
import { useCanvasUi } from './canvasUi'
import { DetailList } from './DetailList'
import { blockCard, expandedCard } from './layout'
import { chapterColor, TYPE_ICON } from './visuals'
import type { ChapterSummary, ZoomLevel } from './zoom'

export type RootNodeT = Node<{ node: NodeRow; mapType: MapRow['type'] | null }, 'root'>
export type SectionNodeT = Node<
  {
    node: NodeRow
    childCount: number
    /** Book maps: sections take their chapter's color. */
    color?: ChapterColor | null
    /** Zoomed out to sections: a bigger card with the summary and first blocks. */
    expanded?: { blockTitles: string[] } | null
  },
  'section'
>
export type BlockNodeT = Node<
  {
    node: NodeRow
    color: ChapterColor | null
    step: number | null
    connectFrom: boolean
    rtl: boolean
    /** Selected at the blocks level: the card opens in place with all its details. */
    expanded?: boolean
  },
  'block'
>
export type RegionNodeT = Node<{ color: ChapterColor | null; failed: boolean }, 'region'>

export type ChapterTabNodeT = Node<{ chapter: ChapterSummary }, 'chapterTab'>
export type ChapterRegionNodeT = Node<
  { chapter: ChapterSummary; level: ZoomLevel },
  'chapterRegion'
>

/**
 * Handles. Edges are drawn from node boxes (see edges.tsx), so React Flow's own handles stay
 * invisible; the four link dots (one per side) are what students drag to make a link.
 */
function Handles({ linkable = true }: { linkable?: boolean }) {
  const { t } = useTranslation()
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
      {canEdit &&
        linkable &&
        LINK_SIDES.map((side) => (
          <Handle
            key={side}
            id={`link-${side}`}
            type="source"
            position={side}
            isConnectable
            className="mynota-link-handle nodrag"
            title={t('ws.link.dragHandle')}
            aria-label={t('ws.link.dragHandle')}
          />
        ))}
    </>
  )
}

const LINK_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const

/** Long-press (touch) opens the node menu, like right-click on desktop. */
function useLongPress(nodeId: string) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openMenu = useCanvasUi((s) => s.openMenu)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const { clientX, clientY } = e
      clear()
      timer.current = setTimeout(() => openMenu(nodeId, clientX, clientY), 550)
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerMove: (e: PointerEvent) => {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clear()
    },
  }
}

export function RootNode({ data, selected }: NodeProps<RootNodeT>) {
  const { t } = useTranslation()
  const { node, mapType } = data
  return (
    <div
      {...useLongPress(node.id)}
      className={cn(
        'relative flex h-16 w-[200px] flex-col items-center justify-center gap-0.5 rounded-neo-lg border-2 border-line bg-brand px-3 text-center text-brand-ink neo-shadow',
        selected && 'outline-3 outline-offset-2 outline-ink',
      )}
    >
      {mapType && (
        <span className="text-[11px] font-semibold opacity-85">
          {t(`library.types.${mapType}`)}
        </span>
      )}
      <span dir="auto" className="line-clamp-2 text-[17px] leading-tight font-bold">
        {node.title}
      </span>
      <EditingTag nodeId={node.id} />
      <Handles linkable={false} />
    </div>
  )
}

function SectionStatusChip({ sectionId }: { sectionId: string }) {
  const { t } = useTranslation()
  const status = useBuild((s) => s.sections[sectionId])
  const retry = useBuild((s) => s.retrySection)
  const key = useKeyFor(useBuild((s) => s.provider))
  if (!status || status.state === 'done') return null
  if (status.state === 'failed') {
    return (
      <span className="nodrag absolute -bottom-4 start-1/2 flex -translate-x-1/2 items-center gap-1.5 rtl:translate-x-1/2">
        <span className="inline-flex items-center gap-1 rounded-full border-2 border-line bg-danger-soft px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-ink">
          <CircleAlert size={12} aria-hidden /> {t('ws.build.sectionFailed')}
        </span>
        {key && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void retry(sectionId, key)
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border-2 border-line bg-surface px-2 py-0.5 text-[11px] font-bold text-ink neo-shadow-sm"
          >
            <RotateCcw size={12} aria-hidden /> {t('ws.build.retry')}
          </button>
        )}
      </span>
    )
  }
  return (
    <span className="absolute -bottom-3.5 start-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border-2 border-line bg-surface px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-ink rtl:translate-x-1/2">
      {status.state === 'waiting' ? (
        <>
          <Clock size={12} aria-hidden /> {t('ws.build.queued')}
        </>
      ) : status.state === 'running' ? (
        <>
          <Spinner size={11} /> {t('ws.build.running')}
        </>
      ) : (
        t('ws.build.queued')
      )}
    </span>
  )
}

export function SectionNode({ data, selected }: NodeProps<SectionNodeT>) {
  const { t } = useTranslation()
  const { node, childCount, expanded } = data
  const c = chapterColor(data.color === undefined ? node.color : data.color)
  const longPress = useLongPress(node.id)
  const cover = useCanvasUi((s) => s.cover)
  if (expanded) {
    const more = childCount - expanded.blockTitles.length
    return (
      <div
        {...longPress}
        className={cn(
          'mynota-zoomtext flex size-full flex-col gap-[calc(8px/var(--z))] overflow-hidden rounded-[14px] border-[2.5px] bg-surface p-[calc(10px/var(--z))] text-ink',
          selected && 'neo-shadow outline-3 outline-offset-2',
        )}
        style={{ borderColor: selected ? 'var(--line)' : c.strong, outlineColor: c.strong }}
      >
        <span dir="auto" className="zt-title font-bold">
          {node.title}
        </span>
        {node.summary && (
          <span dir="auto" className="zt-body text-ink-muted">
            {node.summary}
          </span>
        )}
        <span className="zt-small font-semibold text-ink-muted">
          {t(`ws.shapes.${node.branch_view}`)} · {t('ws.blocks', { count: childCount })}
        </span>
        <span aria-hidden className="h-0.5 shrink-0" style={{ background: c.fill }} />
        {/* Wide sections (grouped columns) list their blocks in columns too. */}
        <div className="min-h-0 overflow-hidden" style={{ columnWidth: 210, columnGap: 18 }}>
          {expanded.blockTitles.map((title, i) =>
            cover ? (
              <span key={i} aria-hidden className="zt-body block truncate text-ink-faint">
                ••••••
              </span>
            ) : (
              <span key={i} dir="auto" className="zt-body block truncate font-semibold">
                {title}
              </span>
            ),
          )}
        </div>
        {more > 0 && <span className="zt-small text-ink-muted">+{more}</span>}
        <Handles />
      </div>
    )
  }
  return (
    <div
      {...longPress}
      className={cn(
        'relative flex h-[58px] w-[190px] flex-col items-center justify-center rounded-[11px] border-[2.5px] bg-surface px-2.5 text-center text-ink',
        selected && 'neo-shadow outline-3 outline-offset-2',
      )}
      style={{ borderColor: selected ? 'var(--line)' : c.strong, outlineColor: c.strong }}
    >
      <span dir="auto" className="line-clamp-1 text-[15px] font-bold">
        {node.title}
      </span>
      <span className="text-[11px] text-ink-muted">
        {t(`ws.shapes.${node.branch_view}`)} · {t('ws.blocks', { count: childCount })}
      </span>
      <SectionStatusChip sectionId={node.id} />
      <EditingTag nodeId={node.id} />
      <Handles />
    </div>
  )
}

const MASTERY_FILL: Record<Mastery, string> = {
  new: 'var(--surface)',
  learning: 'var(--warning)',
  struggling: 'var(--danger)',
  mastered: 'var(--success)',
}

/** The block's mastery dot (its cards' progress for this student), when dots are on. */
function MasteryDot({ nodeId }: { nodeId: string }) {
  const { t } = useTranslation()
  const on = useCanvasUi((s) => s.showMastery)
  const m = useDeck((s) =>
    on && s.status === 'ready' ? (masteryMapFor(s.cards, s.progress)[nodeId] ?? null) : null,
  )
  if (!m) return null
  return (
    <span
      role="img"
      aria-label={t(`deck.mastery.${m}`)}
      title={t(`deck.mastery.${m}`)}
      className="mynota-no-export absolute -end-1.5 -top-1.5 size-4 rounded-full border-2 border-line"
      style={{ background: MASTERY_FILL[m] }}
    />
  )
}

const CLAMP = ['', 'line-clamp-1', 'line-clamp-2', 'line-clamp-3'] as const

/** A formula on a card: typeset, centered, and scaled down when wider than the card. */
function CardFormula({ latex, accent }: { latex: string; accent: string }) {
  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const b = box.current
    const i = inner.current
    if (!b || !i) return
    i.style.transform = ''
    const scale = Math.min(1, (b.clientWidth - 12) / Math.max(1, i.scrollWidth))
    i.style.transform = scale < 1 ? `scale(${scale.toFixed(3)})` : ''
  }, [latex])
  return (
    <div
      ref={box}
      className="flex h-[52px] shrink-0 items-center justify-center overflow-hidden rounded-md border-s-[3px] bg-paper-sunken px-1.5"
      style={{ borderInlineStartColor: accent }}
    >
      <div ref={inner} className="origin-center text-[14px] whitespace-nowrap">
        <MathFormula latex={latex} />
      </div>
    </div>
  )
}

export function BlockNode({ data, selected }: NodeProps<BlockNodeT>) {
  const { t } = useTranslation()
  const { node, color, step } = data
  const c = chapterColor(color)
  const Icon = node.type ? TYPE_ICON[node.type] : null
  const typeLabel = node.type ? t(`ws.types.${node.type}`) : null
  const covered = useCanvasUi((s) => s.cover && !selected && !s.revealed.includes(node.id))
  const open = Boolean(data.expanded) && !covered
  const card = blockCard(node)
  const big = open ? expandedCard(node) : null
  const titleLines = big?.titleLines ?? card.titleLines
  return (
    <div
      {...useLongPress(node.id)}
      className={cn(
        'relative flex size-full flex-col gap-1.5 rounded-neo border-2 bg-surface px-2.5 py-2.5 text-ink',
        covered && 'border-dashed bg-surface-muted',
        selected ? 'border-[2.5px] neo-shadow outline-3 outline-offset-2' : '',
        open && 'z-10',
      )}
      style={{
        borderColor: selected ? 'var(--line)' : c.strong,
        ...(selected ? { outlineColor: c.strong } : {}),
      }}
    >
      <div className="flex min-w-0 items-start gap-2">
        {step !== null ? (
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-selected font-mono text-xs font-bold text-selected-ink"
            title={t('ws.step', { n: step })}
          >
            {step}
          </span>
        ) : Icon ? (
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-[7px] border-[1.5px] border-line bg-paper-sunken"
            title={typeLabel ?? undefined}
          >
            <Icon size={15} role="img" aria-label={typeLabel ?? undefined} />
          </span>
        ) : null}
        {covered ? (
          <span
            className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1"
            aria-label={t('ws.studyView.covered')}
          >
            <span aria-hidden className="h-2.5 w-4/5 rounded-full bg-line-soft" />
            <span aria-hidden className="h-2.5 w-1/2 rounded-full bg-line-soft" />
          </span>
        ) : (
          <span
            dir="auto"
            className={cn(
              'min-w-0 flex-1 pt-0.5 text-sm leading-[18px]',
              CLAMP[Math.min(3, titleLines) as 1 | 2 | 3],
              node.importance === 'core'
                ? 'font-bold'
                : node.importance === 'extra'
                  ? 'font-medium text-ink-muted'
                  : 'font-semibold',
            )}
          >
            {node.title}
          </span>
        )}
      </div>
      {/* Formulas come first: for a block about a formula, the formula is the point. */}
      {!open && !covered && card.formula && <CardFormula latex={card.formula} accent={c.strong} />}
      {!open && !covered && card.summaryLines > 0 && (
        <p
          dir="auto"
          className={cn('text-[12.5px] leading-4 text-ink-muted', CLAMP[card.summaryLines])}
        >
          {node.summary}
        </p>
      )}
      {open && (
        <div className="mynota-reveal nowheel flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pe-0.5">
          <DetailList details={node.details.filter((d) => d.kind === 'formula')} compact />
          {node.summary && (
            <p dir="auto" className="text-[12.5px] leading-4 text-ink-muted">
              {node.summary}
            </p>
          )}
          <DetailList details={node.details.filter((d) => d.kind !== 'formula')} compact />
        </div>
      )}

      {card.badges && (
        <span className="mt-auto flex h-[18px] items-center gap-1.5">
          {node.importance === 'core' && (
            <span className="rounded-[5px] border-[1.5px] border-line bg-brand-soft px-1 text-[11px] leading-tight font-semibold">
              {t('ws.core')}
            </span>
          )}
          {node.importance === 'extra' && (
            <span className="text-[11px] text-ink-faint">{t('ws.extra')}</span>
          )}
          {node.ai_added && (
            <Sparkles
              size={12}
              className="text-ink-muted"
              role="img"
              aria-label={t('ws.aiAddedBadge')}
            />
          )}
        </span>
      )}
      {open && <CardActions />}
      <MasteryDot nodeId={node.id} />
      <EditingTag nodeId={node.id} />
      <Handles />
    </div>
  )
}

/** Open / Edit under an expanded card: both open the details panel (editing lives there). */
function CardActions() {
  const { t } = useTranslation()
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const open = (mode: 'read' | 'edit') => useCanvasUi.getState().setPanelOpen(true, mode)
  const btn =
    'nodrag inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border-2 border-line px-2 text-xs font-bold'
  return (
    <div className="mynota-reveal flex shrink-0 justify-end gap-1.5">
      <button
        type="button"
        className={cn(btn, 'bg-surface hover:bg-surface-muted')}
        onClick={(e) => {
          e.stopPropagation()
          open('read')
        }}
      >
        <Maximize2 size={13} aria-hidden /> {t('ws.card.open')}
      </button>
      {canEdit && (
        <button
          type="button"
          className={cn(btn, 'bg-brand text-brand-ink hover:bg-brand-hover')}
          onClick={(e) => {
            e.stopPropagation()
            open('edit')
          }}
        >
          <Pencil size={13} aria-hidden /> {t('ws.card.edit')}
        </button>
      )}
    </div>
  )
}

export function RegionNode({ data }: NodeProps<RegionNodeT>) {
  const c = chapterColor(data.color)
  return (
    <div
      aria-hidden
      className="h-full w-full rounded-[18px] border-2"
      style={
        data.failed
          ? {
              background: 'var(--surface)',
              borderColor: 'var(--danger)',
              borderStyle: 'dashed',
              borderWidth: 2.5,
            }
          : { background: c.tint, borderColor: c.strong }
      }
    />
  )
}

function ChapterStatus({ chapter }: { chapter: ChapterSummary }) {
  const { t } = useTranslation()
  const live = useBuild((s) => s.chapters[chapter.id])
  const running = live === 'running'
  const queued = live === 'queued'
  if (running)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-surface px-2 py-0.5 text-xs font-bold whitespace-nowrap">
        <Spinner size={11} /> {t('ws.book.building')}
      </span>
    )
  if (queued)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-surface px-2 py-0.5 text-xs font-bold whitespace-nowrap">
        <Clock size={12} aria-hidden /> {t('ws.book.queued')}
      </span>
    )
  return null
}

/** The notebook tab on top of a chapter: number, title, page range, live status. */
export function ChapterTabNode({ data, selected }: NodeProps<ChapterTabNodeT>) {
  const { chapter } = data
  const c = chapterColor(chapter.color)
  const waiting = chapter.progress === 'waiting'
  return (
    <div
      {...useLongPress(chapter.id)}
      className={cn(
        'mynota-tab flex size-full items-center gap-2 rounded-t-[12px] border-[2.5px] border-b-0 border-line px-2.5 text-ink',
        waiting && 'border-dashed',
        selected && 'outline-3 outline-offset-2 outline-ink',
      )}
      style={{ background: waiting ? 'var(--surface)' : c.fill }}
    >
      <span className="tab-badge flex shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface font-mono font-bold">
        {chapter.number}
      </span>
      <span dir="auto" className="tab-title min-w-0 truncate font-bold">
        {chapter.title}
      </span>
      <span className="ms-auto flex shrink-0 items-center gap-2">
        <ChapterStatus chapter={chapter} />
        {chapter.pages && (
          <span className="rounded-[5px] border-[1.5px] border-line bg-surface px-1.5 font-mono text-[11px] font-bold">
            {chapter.pages}
          </span>
        )}
      </span>
      <Handles linkable={false} />
    </div>
  )
}

function BuildChapterButton({ chapter, big }: { chapter: ChapterSummary; big?: boolean }) {
  const { t } = useTranslation()
  const { build, canBuild } = useChapterBuilder()
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const live = useBuild((s) => s.chapters[chapter.id])
  if (!canEdit || live === 'running' || live === 'queued') return null
  if (!canBuild)
    return (
      <Link to="/settings" className="mynota-no-export nodrag text-sm font-semibold underline">
        {t('ws.build.needKey')}
      </Link>
    )
  const partial = chapter.progress === 'partial'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        build([chapter.id])
      }}
      className={cn(
        'mynota-no-export nodrag nopan inline-flex cursor-pointer items-center gap-2 self-start rounded-neo border-2 border-line bg-surface font-semibold text-ink neo-shadow-sm hover:bg-paper-sunken',
        big ? 'zt-button' : 'h-11 px-4 text-sm',
      )}
    >
      {partial ? <RotateCcw size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
      {partial ? t('ws.book.continue') : t('ws.book.build')}
    </button>
  )
}

/**
 * A chapter's background region. Built chapters are tinted; waiting ones are striped with a
 * Build button. Zoomed out to chapters, it shows the chapter overview (title, sections, size).
 */
export function ChapterRegionNode({ data }: NodeProps<ChapterRegionNodeT>) {
  const { t } = useTranslation()
  const { chapter, level } = data
  const c = chapterColor(chapter.color)
  const waiting = chapter.progress === 'waiting' || chapter.progress === 'empty'
  const overview = level === 'chapters'
  // Zoomed out (chapters or sections), a waiting chapter's message stays readable.
  const scaled = level !== 'blocks'
  const live = useBuild((s) => s.chapters[chapter.id])
  return (
    <div
      className={cn(
        'mynota-zoomtext flex size-full flex-col overflow-hidden rounded-[6px_22px_22px_22px] border-[2.5px] text-ink',
        waiting && 'border-dashed',
        overview || (scaled && waiting)
          ? 'gap-[calc(10px/var(--z))] p-[min(calc(14px/var(--z)),4cqw)]'
          : 'gap-2 p-5',
      )}
      style={
        waiting
          ? {
              borderColor: c.strong,
              background: `repeating-linear-gradient(135deg, var(--surface) 0 12px, color-mix(in srgb, ${c.fill} 35%, var(--surface)) 12px 24px)`, // taste-skill-ignore: the hatch marks a chapter still waiting to be built
            }
          : { background: c.tint, borderColor: c.strong }
      }
    >
      {overview && (
        <span className="flex items-center gap-[calc(8px/var(--z))]">
          <span className="zt-badge flex shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface font-mono font-bold">
            {chapter.number}
          </span>
          <span dir="auto" className="zt-chapter line-clamp-2 min-w-0 font-bold break-words">
            {chapter.title}
          </span>
        </span>
      )}
      {waiting ? (
        <span
          className={cn(
            'flex flex-col',
            scaled ? 'zt-body gap-[calc(6px/var(--z))]' : 'gap-2 pt-3',
          )}
        >
          <span className={cn('font-bold', !scaled && 'text-base')}>
            {live === 'queued' || live === 'running' ? t('ws.book.inQueue') : t('ws.book.notBuilt')}
          </span>
          <span className={cn('text-ink-muted', !scaled && 'text-sm')}>
            {t('ws.book.waitingInfo', { count: chapter.paragraphs })}
            {chapter.pages ? ` · ${t('ws.book.pages', { pages: chapter.pages })}` : ''}
          </span>
          {chapter.progress === 'waiting' && <BuildChapterButton chapter={chapter} big={scaled} />}
        </span>
      ) : overview ? (
        <>
          <span className="grid grid-cols-2 gap-[calc(6px/var(--z))]">
            {chapter.sections.slice(0, 8).map((sec) => (
              <span
                key={sec.id}
                className="zt-body flex min-w-0 items-center gap-[calc(6px/var(--z))] rounded-[calc(8px/var(--z))] border-2 bg-surface px-[calc(8px/var(--z))] py-[calc(4px/var(--z))] font-bold"
                style={{ borderColor: c.strong }}
              >
                <span dir="auto" className="truncate">
                  {sec.title}
                </span>
                <span className="ms-auto font-mono text-ink-muted">{sec.count}</span>
              </span>
            ))}
          </span>
          <span className="zt-small mt-auto flex items-center gap-[calc(8px/var(--z))] font-semibold text-ink-muted">
            <span
              aria-hidden
              className="flex h-[calc(8px/var(--z))] flex-1 overflow-hidden rounded-full border-[1.5px] border-line bg-surface"
            >
              <span
                style={{
                  width: `${chapter.blocks ? (chapter.core / chapter.blocks) * 100 : 0}%`,
                  background: c.strong,
                }}
              />
            </span>
            {t('ws.book.blocksCore', { count: chapter.blocks, core: chapter.core })}
          </span>
          {chapter.progress === 'partial' && <BuildChapterButton chapter={chapter} big />}
        </>
      ) : (
        chapter.progress === 'partial' && (
          <span className="mt-auto flex items-center gap-2 self-start rounded-neo border-2 border-line bg-warning-soft px-3 py-2 text-sm font-semibold">
            {t('ws.book.unfinished')} <BuildChapterButton chapter={chapter} />
          </span>
        )
      )}
      <Handles linkable={false} />
    </div>
  )
}

export const nodeTypes = {
  root: RootNode,
  section: SectionNode,
  block: BlockNode,
  region: RegionNode,
  chapterTab: ChapterTabNode,
  chapterRegion: ChapterRegionNode,
}
