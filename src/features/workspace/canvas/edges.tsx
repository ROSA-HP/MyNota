import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react'
import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RelationRow } from '@/lib/database.types'
import { useWorkspace } from '../workspaceStore'

/**
 * Edges are drawn from the live node boxes (not from handles), so they follow nodes while
 * dragging and mirror correctly in right-to-left layouts.
 */
interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function rectOf(n: InternalNode | undefined): Rect | null {
  if (!n) return null
  const { x, y } = n.internals.positionAbsolute
  return { x, y, w: n.measured.width ?? n.width ?? 0, h: n.measured.height ?? n.height ?? 0 }
}

export type BranchEdgeT = Edge<Record<string, never>, 'branch'>
export type TreeEdgeT = Edge<{ rtl: boolean }, 'tree'>
export type StepEdgeT = Edge<Record<string, never>, 'step'>
export type RelationEdgeT = Edge<
  { relation: RelationRow; canEdit: boolean; selected: boolean; rtl: boolean },
  'relation'
>

/** Map title → section: a curve from the bottom centre to the top centre. */
export function BranchEdge({ id, source, target }: EdgeProps<BranchEdgeT>) {
  const s = rectOf(useInternalNode(source))
  const t = rectOf(useInternalNode(target))
  if (!s || !t) return null
  const sx = s.x + s.w / 2
  const sy = s.y + s.h
  const tx = t.x + t.w / 2
  const ty = t.y
  const my = (sy + ty) / 2
  return (
    <BaseEdge
      id={id}
      path={`M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`}
      style={{ stroke: 'var(--line)', strokeWidth: 2 }}
    />
  )
}

/** Parent → child in a stacked column: down the trunk, then across into the child. */
export function TreeEdge({ id, source, target, data }: EdgeProps<TreeEdgeT>) {
  const s = rectOf(useInternalNode(source))
  const t = rectOf(useInternalNode(target))
  if (!s || !t) return null
  const rtl = data?.rtl ?? false
  const trunkX = rtl ? s.x + s.w - 16 : s.x + 16
  const sy = s.y + s.h
  const ty = t.y + t.h / 2
  const tx = rtl ? t.x + t.w : t.x
  const r = Math.min(8, Math.abs(ty - sy) / 2, Math.abs(tx - trunkX) / 2)
  const dir = tx > trunkX ? 1 : -1
  const path = `M${trunkX},${sy} L${trunkX},${ty - r} Q${trunkX},${ty} ${trunkX + dir * r},${ty} L${tx},${ty}`
  return <BaseEdge id={id} path={path} style={{ stroke: 'var(--line)', strokeWidth: 1.6 }} />
}

/** Process sections: an arrow from one step down to the next. */
export function StepEdge({ id, source, target, markerEnd }: EdgeProps<StepEdgeT>) {
  const s = rectOf(useInternalNode(source))
  const t = rectOf(useInternalNode(target))
  if (!s || !t) return null
  const x1 = s.x + s.w / 2
  const x2 = t.x + t.w / 2
  return (
    <BaseEdge
      id={id}
      path={`M${x1},${s.y + s.h} L${x2},${t.y - 2}`}
      markerEnd={markerEnd}
      style={{ stroke: 'var(--line)', strokeWidth: 1.6 }}
    />
  )
}

/** Picks the facing sides of two boxes and returns a smooth curve between them. */
function floatingPath(a: Rect, b: Rect, rtl: boolean) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const dx = bc.x - ac.x
  const dy = bc.y - ac.y
  let p1: { x: number; y: number }
  let p2: { x: number; y: number }
  let c1: { x: number; y: number }
  let c2: { x: number; y: number }
  if (Math.abs(dx) > Math.abs(dy) * 0.8 && Math.abs(dx) > (a.w + b.w) / 2) {
    const sa = dx > 0 ? 1 : -1
    p1 = { x: ac.x + (sa * a.w) / 2, y: ac.y }
    p2 = { x: bc.x - (sa * b.w) / 2, y: bc.y }
    const gap = Math.abs(p2.x - p1.x)
    const k = Math.max(40, gap / 2)
    // Short hops between neighbouring columns arc upward so the label has room.
    const lift = gap < 140 ? 46 : 0
    c1 = { x: p1.x + sa * k, y: p1.y - lift }
    c2 = { x: p2.x - sa * k, y: p2.y - lift }
  } else if (Math.abs(dx) < (a.w + b.w) / 2 && Math.abs(dy) < 260) {
    // Same column: loop out to the side away from the tree lines (right in LTR, left in RTL)
    // so the link doesn't run through the blocks between.
    const out = rtl ? -1 : 1
    p1 = { x: rtl ? a.x : a.x + a.w, y: ac.y }
    p2 = { x: rtl ? b.x : b.x + b.w, y: bc.y }
    const edge = rtl ? Math.min(p1.x, p2.x) : Math.max(p1.x, p2.x)
    const bulge = edge + out * (40 + Math.abs(dy) / 6)
    c1 = { x: bulge, y: p1.y }
    c2 = { x: bulge, y: p2.y }
  } else {
    const sa = dy > 0 ? 1 : -1
    p1 = { x: ac.x, y: ac.y + (sa * a.h) / 2 }
    p2 = { x: bc.x, y: bc.y - (sa * b.h) / 2 }
    const k = Math.max(40, Math.abs(p2.y - p1.y) / 2)
    c1 = { x: p1.x, y: p1.y + sa * k }
    c2 = { x: p2.x, y: p2.y - sa * k }
  }
  const path = `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`
  // Point on the cubic at t = 0.5 for the label.
  const label = {
    x: 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x,
    y: 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y,
  }
  return { path, label }
}

/** A labelled link between two nodes. Suggested (AI) links are dashed with accept / dismiss. */
export function RelationEdge({ id, source, target, data, markerEnd }: EdgeProps<RelationEdgeT>) {
  const { t } = useTranslation()
  const update = useWorkspace((s) => s.updateRelation)
  const remove = useWorkspace((s) => s.deleteRelation)
  const selectRelation = useWorkspace((s) => s.selectRelation)
  const s = rectOf(useInternalNode(source))
  const tg = rectOf(useInternalNode(target))
  if (!s || !tg || !data) return null
  const { relation, canEdit, selected } = data
  const suggested = relation.status === 'suggested'
  const { path, label } = floatingPath(s, tg, data.rtl)
  const text = relation.label || t(`ws.relations.${relation.type}`)
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          stroke: suggested ? 'var(--ink-muted)' : 'var(--brand)',
          strokeWidth: selected ? 3.4 : 2.4,
          strokeDasharray: suggested ? '6 5' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex items-center gap-1"
          style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
        >
          <button
            type="button"
            onClick={() => selectRelation(relation.id)}
            dir="auto"
            className="cursor-pointer rounded-full border-2 bg-surface px-2.5 py-0.5 text-xs font-bold whitespace-nowrap"
            style={{
              borderColor: suggested ? 'var(--ink-muted)' : 'var(--brand)',
              borderStyle: suggested ? 'dashed' : 'solid',
              color: suggested ? 'var(--ink-muted)' : 'var(--ink)',
              boxShadow: selected ? '2px 2px 0 var(--shadow)' : undefined,
            }}
          >
            {text}
            {suggested && '?'}
          </button>
          {suggested && canEdit && (
            <>
              <button
                type="button"
                aria-label={t('ws.panel.accept')}
                title={t('ws.panel.accept')}
                onClick={() => update(relation.id, { status: 'accepted' })}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-line bg-success-soft text-ink"
              >
                <Check size={13} strokeWidth={3} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={t('ws.panel.dismiss')}
                title={t('ws.panel.dismiss')}
                onClick={() => remove(relation.id)}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-line bg-surface text-ink"
              >
                <X size={13} strokeWidth={3} aria-hidden />
              </button>
            </>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const edgeTypes = {
  branch: BranchEdge,
  tree: TreeEdge,
  step: StepEdge,
  relation: RelationEdge,
}
