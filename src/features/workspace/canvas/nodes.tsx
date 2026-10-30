import { useRef, type PointerEvent } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { CircleAlert, Clock, RotateCcw, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui'
import { useKeyFor } from '@/features/settings/aiKeyStore'
import { cn } from '@/lib/cn'
import type { ChapterColor, MapRow, NodeRow } from '@/lib/database.types'
import { useBuild } from '../buildStore'
import { useWorkspace } from '../workspaceStore'
import { useCanvasUi } from './canvasUi'
import { chapterColor, TYPE_ICON } from './visuals'

export type RootNodeT = Node<{ node: NodeRow; mapType: MapRow['type'] | null }, 'root'>
export type SectionNodeT = Node<{ node: NodeRow; childCount: number }, 'section'>
export type BlockNodeT = Node<
  {
    node: NodeRow
    color: ChapterColor | null
    step: number | null
    connectFrom: boolean
    rtl: boolean
  },
  'block'
>
export type RegionNodeT = Node<{ color: ChapterColor | null; failed: boolean }, 'region'>

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
        'flex h-16 w-[200px] flex-col items-center justify-center gap-0.5 rounded-neo-lg border-2 border-line bg-brand px-3 text-center text-brand-ink neo-shadow',
        selected && 'outline-3 outline-offset-2 outline-ink',
      )}
    >
      {mapType && (
        <span className="font-mono text-[10px] font-bold opacity-85">
          {t(`library.types.${mapType}`)}
        </span>
      )}
      <span dir="auto" className="line-clamp-2 text-[17px] leading-tight font-bold">
        {node.title}
      </span>
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
  const { node, childCount } = data
  const c = chapterColor(node.color)
  return (
    <div
      {...useLongPress(node.id)}
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
      <Handles />
    </div>
  )
}

export function BlockNode({ data, selected }: NodeProps<BlockNodeT>) {
  const { t } = useTranslation()
  const { node, color, step } = data
  const c = chapterColor(color)
  const Icon = node.type ? TYPE_ICON[node.type] : null
  const typeLabel = node.type ? t(`ws.types.${node.type}`) : null
  return (
    <div
      {...useLongPress(node.id)}
      className={cn(
        'flex h-[66px] w-[210px] items-center gap-2 rounded-neo border-2 bg-surface px-2 py-1.5 text-ink',
        selected ? 'border-[2.5px] neo-shadow outline-3 outline-offset-2' : '',
      )}
      style={{
        borderColor: selected ? 'var(--line)' : c.strong,
        ...(selected ? { outlineColor: c.strong } : {}),
      }}
    >
      {step !== null ? (
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xs font-bold text-paper"
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
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          dir="auto"
          className={cn(
            'line-clamp-2 text-sm leading-tight',
            node.importance === 'core'
              ? 'font-bold'
              : node.importance === 'extra'
                ? 'font-medium text-ink-muted'
                : 'font-semibold',
          )}
        >
          {node.title}
        </span>
        <span className="flex items-center gap-1.5">
          {node.importance === 'core' && (
            <span className="rounded-[5px] border-[1.5px] border-line bg-brand-soft px-1 font-mono text-[10px] leading-tight font-bold">
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
      </span>
      <Handles />
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

export const nodeTypes = {
  root: RootNode,
  section: SectionNode,
  block: BlockNode,
  region: RegionNode,
}
