import { useCallback, useState } from 'react'
import { relationColor } from './visuals'
import { camera } from '@/lib/motion'
import { createPortal } from 'react-dom'
import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  useReactFlow,
  useStore,
  type ReactFlowState,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  MoveHorizontal,
  PenLine,
  SquareArrowOutUpRight,
  Trash,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { RELATION_TYPES } from '@/ai/schemas/common'
import { cn } from '@/lib/cn'
import type { RelationRow, RelationType } from '@/lib/database.types'
import { useWorkspace } from '../workspaceStore'
import { useCanvasUi } from './canvasUi'
import { bezierAt, labelSize, pickLabelPoint } from './labelPlacement'
import { existingLink, nodeIdAt } from './linking'
import {
  arrowHead,
  bracket,
  centrePath,
  downThenAcross,
  nearestSides,
  oneBend,
  sideCurve,
  split,
  taperedPath,
  verticalS,
  type Cubic,
  type Side,
} from './organic'

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

/** Tree lines take their section's color (never plain black) and end in an arrowhead. */
type Tinted = { color?: string }
export type BranchEdgeT = Edge<Tinted, 'branch'>
export type TreeEdgeT = Edge<{ rtl: boolean } & Tinted, 'tree'>
export type StepEdgeT = Edge<Tinted, 'step'>
export type RelationEdgeT = Edge<
  {
    relation: RelationRow
    canEdit: boolean
    selected: boolean
    rtl: boolean
    /** Focus mode: outside the focused part of the map. */
    dimmed?: boolean
  },
  'relation'
>

/**
 * An organic tree line: a tapered, filled body (thick at the parent, thin at the child), a thin
 * centre line, and a crisp arrowhead whose tip sits on the child's edge. Every line has two
 * curves, so it morphs smoothly when cards move.
 */
function OrganicBranch({
  id,
  segs,
  color,
  from,
  to = 1.8,
}: {
  id: string
  segs: Cubic[]
  color: string | undefined
  from: number
  to?: number
}) {
  const stroke = color ?? 'var(--line)'
  // Every line bends one way only (no S), then splits into two curves so it can morph.
  const one = segs.map(oneBend)
  const two = one.length === 1 && one[0] ? split(one[0]) : one
  return (
    <>
      <path className="mynota-branch" d={taperedPath(two, from, to)} fill={stroke} />
      <BaseEdge
        id={id}
        path={centrePath(two)}
        style={{ stroke, strokeWidth: to, strokeLinecap: 'round', fill: 'none' }}
      />
      <path
        className="mynota-branch"
        d={arrowHead(two)}
        fill={stroke}
        stroke={stroke}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </>
  )
}

const holds = (outer: Rect, r: Rect) =>
  r.x + r.w / 2 > outer.x &&
  r.x + r.w / 2 < outer.x + outer.w &&
  r.y + r.h / 2 > outer.y &&
  r.y + r.h / 2 < outer.y + outer.h

/** Cached per node list and card positions, so panning and zooming never recompute it. */
const sidesCache = new WeakMap<object, Map<string, string>>()

/**
 * The nearest pair of sides (top, right, bottom or left) joining two cards without running
 * through another card, or null when every pair would (the line then routes around).
 */
function useNearestSides(source: string, target: string): [Side, Side] | null {
  const key = useStore(
    useCallback(
      (st: ReactFlowState) => {
        const a = rectOf(st.nodeLookup.get(source))
        const b = rectOf(st.nodeLookup.get(target))
        if (!a || !b) return ''
        let cache = sidesCache.get(st.nodes)
        if (!cache) sidesCache.set(st.nodes, (cache = new Map()))
        const k = `${source}>${target}:${a.x},${a.y},${a.w},${a.h};${b.x},${b.y},${b.w},${b.h}`
        const hit = cache.get(k)
        if (hit !== undefined) return hit
        const pad = 160
        const minX = Math.min(a.x, b.x) - pad
        const maxX = Math.max(a.x + a.w, b.x + b.w) + pad
        const minY = Math.min(a.y, b.y) - pad
        const maxY = Math.max(a.y + a.h, b.y + b.h) + pad
        const obstacles: Rect[] = []
        for (const n of st.nodeLookup.values()) {
          if (n.id === source || n.id === target || n.hidden) continue
          const r = rectOf(n)
          if (!r || r.x > maxX || r.x + r.w < minX || r.y > maxY || r.y + r.h < minY) continue
          // Another section's or chapter's colored area is in the way too (a line through it
          // looks like it belongs there); the area holding either card is not.
          if ((n.type === 'region' || n.type === 'chapterRegion') && (holds(r, a) || holds(r, b)))
            continue
          obstacles.push(r)
        }
        const sides = nearestSides(a, b, obstacles)
        const out = sides ? sides.join(':') : ''
        cache.set(k, out)
        return out
      },
      [source, target],
    ),
  )
  return key ? (key.split(':') as [Side, Side]) : null
}

/** Map title → section: joined at the nearest sides (usually bottom to top). */
export function BranchEdge({ id, source, target, data }: EdgeProps<BranchEdgeT>) {
  const s = rectOf(useInternalNode(source))
  const t = rectOf(useInternalNode(target))
  const sides = useNearestSides(source, target)
  if (!s || !t) return null
  const segs = sides
    ? [sideCurve(s, sides[0], t, sides[1])]
    : [verticalS({ x: s.x + s.w / 2, y: s.y + s.h }, { x: t.x + t.w / 2, y: t.y })]
  return <OrganicBranch id={id} segs={segs} color={data?.color} from={5} />
}

/**
 * Parent → child in a stacked column: joined at the nearest sides; when the way is blocked by
 * the cards in between, from the parent's trunk down beside them and into the child.
 */
export function TreeEdge({ id, source, target, data }: EdgeProps<TreeEdgeT>) {
  const s = rectOf(useInternalNode(source))
  const t = rectOf(useInternalNode(target))
  const sides = useNearestSides(source, target)
  if (!s || !t) return null
  const rtl = data?.rtl ?? false
  const segs = sides
    ? [sideCurve(s, sides[0], t, sides[1])]
    : [
        downThenAcross(
          { x: rtl ? s.x + s.w - 16 : s.x + 16, y: s.y + s.h },
          { x: rtl ? t.x + t.w : t.x, y: t.y + t.h / 2 },
        ),
      ]
  return <OrganicBranch id={id} segs={segs} color={data?.color} from={4} />
}

export type RailEdgeT = Edge<{ rtl: boolean } & Tinted, 'rail'>

/**
 * Section → a top-level block in grouped columns: joined at the nearest sides; when the way is
 * blocked, the branch flows over the gap above the blocks to its column, down beside it and
 * into the block.
 */
export function RailEdge({ id, source, target, data }: EdgeProps<RailEdgeT>) {
  const s = rectOf(useInternalNode(source))
  const t = rectOf(useInternalNode(target))
  const sides = useNearestSides(source, target)
  if (!s || !t) return null
  if (sides)
    return (
      <OrganicBranch
        id={id}
        segs={[sideCurve(s, sides[0], t, sides[1])]}
        color={data?.color}
        from={4.5}
      />
    )
  // Blocked: a bracket that turns one way only, out of the section's side towards the block's
  // column, down the gap beside the column (12px from the block) and into the block's side.
  const toLeft = t.x + t.w / 2 < s.x + s.w / 2
  const from = { x: toLeft ? s.x : s.x + s.w, y: s.y + s.h / 2 }
  const gapX = toLeft ? t.x - 12 : t.x + t.w + 12
  const end = { x: toLeft ? t.x : t.x + t.w, y: t.y + Math.min(t.h / 2, 24) }
  return <OrganicBranch id={id} segs={bracket(from, gapX, end)} color={data?.color} from={4.5} />
}

/** Process sections: from one step to the next, at the nearest sides. */
export function StepEdge({ id, source, target, data }: EdgeProps<StepEdgeT>) {
  const s = rectOf(useInternalNode(source))
  const t = rectOf(useInternalNode(target))
  const sides = useNearestSides(source, target)
  if (!s || !t) return null
  const segs = sides
    ? [sideCurve(s, sides[0], t, sides[1])]
    : [verticalS({ x: s.x + s.w / 2, y: s.y + s.h }, { x: t.x + t.w / 2, y: t.y })]
  return <OrganicBranch id={id} segs={segs} color={data?.color} from={3.5} />
}

export type BusEdgeT = Edge<Tinted & { top: number; y: number; spineX: number | null }, 'bus'>

/** A line through `points` with rounded corners. */
function roundedPath(points: Array<{ x: number; y: number }>, radius = 12): string {
  const pts = points.filter(
    (p, i) =>
      i === 0 || Math.hypot(p.x - (points[i - 1]?.x ?? 0), p.y - (points[i - 1]?.y ?? 0)) > 0.5,
  )
  const first = pts[0]
  if (!first) return ''
  let d = `M${first.x},${first.y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as { x: number; y: number }
    const prev = pts[i - 1] as { x: number; y: number }
    const next = pts[i + 1]
    if (!next) {
      d += ` L${p.x},${p.y}`
      break
    }
    const r = Math.min(
      radius,
      Math.hypot(p.x - prev.x, p.y - prev.y) / 2,
      Math.hypot(next.x - p.x, next.y - p.y) / 2,
    )
    const inX = p.x - (Math.sign(p.x - prev.x) || 0) * r
    const inY = p.y - (Math.sign(p.y - prev.y) || 0) * r
    const outX = p.x + (Math.sign(next.x - p.x) || 0) * r
    const outY = p.y + (Math.sign(next.y - p.y) || 0) * r
    d += ` L${inX},${inY} Q${p.x},${p.y} ${outX},${outY}`
  }
  return d
}

/**
 * Title (or chapter tab) → section, the neat way (2026-11-03): one neutral line down from the
 * title to a gutter, along it (lower rows by a spine left of every box), and a short drop in the
 * section's color into its heading. Lines to many sections share the same path, so they read as
 * one bus, never crossing a section.
 */
export function BusEdge({ id, source, target, data }: EdgeProps<BusEdgeT>) {
  const s = rectOf(useInternalNode(source))
  const t = rectOf(useInternalNode(target))
  if (!s || !t || !data) return null
  const sx = s.x + s.w / 2
  const tx = t.x + t.w / 2
  const points = [
    { x: sx, y: s.y + s.h },
    { x: sx, y: data.top },
  ]
  if (data.spineX !== null)
    points.push({ x: data.spineX, y: data.top }, { x: data.spineX, y: data.y })
  points.push({ x: tx, y: data.y })
  const drop: Cubic = [
    { x: tx, y: data.y },
    { x: tx, y: data.y + (t.y - data.y) / 3 },
    { x: tx, y: t.y - (t.y - data.y) / 3 },
    { x: tx, y: t.y },
  ]
  const color = data.color ?? 'var(--line)'
  return (
    <>
      <BaseEdge
        id={id}
        path={roundedPath(points)}
        style={{ stroke: 'var(--ink-faint)', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' }}
      />
      <path
        className="mynota-branch"
        d={centrePath([drop])}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        className="mynota-branch"
        d={arrowHead([drop], 10, 9)}
        fill={color}
        stroke={color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </>
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
  // One bend, no S (it still arrives squarely, where the arrowhead is).
  ;[, c1, c2] = oneBend([p1, c1, c2, p2])
  const path = `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`
  const at = bezierAt(p1, c1, c2, p2)
  // Point on the cubic at t = 0.5 for the label (useLabelPoint moves it off other cards).
  const label = at(0.5)
  return { path, label, p1, p2, at }
}

/**
 * The label position of a link between `source` and `target`: on the curve, nearest the middle,
 * not covering another card. Re-computed when nodes move; re-renders only when it changes.
 */
function useLabelPoint(source: string, target: string, rtl: boolean, labelWidth: number) {
  return useStore(
    useCallback(
      (st: ReactFlowState) => {
        const a = rectOf(st.nodeLookup.get(source))
        const b = rectOf(st.nodeLookup.get(target))
        if (!a || !b) return null
        const obstacles: Rect[] = []
        for (const n of st.nodeLookup.values()) {
          if (
            n.id === source ||
            n.id === target ||
            n.type === 'region' ||
            n.type === 'chapterRegion'
          )
            continue
          const r = rectOf(n)
          if (r) obstacles.push(r)
        }
        return pickLabelPoint(floatingPath(a, b, rtl).at, obstacles, { w: labelWidth, h: 26 })
      },
      [source, target, rtl, labelWidth],
    ),
    (x, y) => x?.x === y?.x && x?.y === y?.y,
  )
}

/** A labelled link between two nodes. Suggested (AI) links are dashed with accept / dismiss. */
export function RelationEdge({
  id,
  source,
  target,
  data,
  markerEnd,
  markerStart,
}: EdgeProps<RelationEdgeT>) {
  const { t } = useTranslation()
  const update = useWorkspace((s) => s.updateRelation)
  const selectRelation = useWorkspace((s) => s.selectRelation)
  const s = rectOf(useInternalNode(source))
  const tg = rectOf(useInternalNode(target))
  const [editing, setEditing] = useState(false)
  const pickerOpen = useCanvasUi((u) => u.picker?.relationId === data?.relation.id)
  const rel = data?.relation
  const labelText = rel ? rel.label || t(`ws.relations.${rel.type}`) : ''
  // Suggested links also carry accept / dismiss buttons beside the label.
  const labelWidth = labelSize(labelText).w + (rel?.status === 'suggested' ? 60 : 0)
  const placed = useLabelPoint(source, target, data?.rtl ?? false, labelWidth)
  if (!s || !tg || !data) return null
  const { relation, canEdit, selected } = data
  const suggested = relation.status === 'suggested'
  const { path, label: middle, p1, p2 } = floatingPath(s, tg, data.rtl)
  const label = placed ?? middle
  const text = relation.label || t(`ws.relations.${relation.type}`)
  const showTools = selected && canEdit && !suggested && !pickerOpen
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={18}
        style={{
          stroke: relationColor(relation),
          strokeWidth: selected ? 4 : 2.4,
          strokeDasharray: suggested ? '6 5' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        {showTools && (
          <LinkToolbar
            relation={relation}
            x={label.x}
            y={label.y}
            onEditLabel={() => setEditing(true)}
          />
        )}
        <div
          className={cn(
            'nodrag nopan pointer-events-auto absolute flex items-center gap-1',
            data.dimmed && 'pointer-events-none opacity-20',
          )}
          data-relation-label=""
          data-suggested={suggested ? '' : undefined}
          style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
        >
          {editing ? (
            <LabelEditor
              initial={relation.label}
              onDone={(v) => {
                if (v !== null) update(relation.id, { label: v.trim().slice(0, 40) })
                setEditing(false)
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => selectRelation(relation.id)}
              onDoubleClick={() => canEdit && !suggested && setEditing(true)}
              dir="auto"
              className="cursor-pointer rounded-full border-2 bg-surface px-2.5 py-0.5 text-xs font-bold whitespace-nowrap"
              style={{
                borderColor: relationColor(relation),
                borderStyle: suggested ? 'dashed' : 'solid',
                color: suggested ? 'var(--ink-muted)' : 'var(--ink)',
                boxShadow: selected ? '2px 2px 0 var(--shadow)' : undefined,
              }}
            >
              {text}
              {suggested && '?'}
            </button>
          )}
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
                onClick={() => update(relation.id, { status: 'dismissed' })}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-line bg-surface text-ink"
              >
                <X size={13} strokeWidth={3} aria-hidden />
              </button>
            </>
          )}
        </div>
        {showTools && (
          <>
            <EndHandle relation={relation} end="from" at={p1} other={p2} />
            <EndHandle relation={relation} end="to" at={p2} other={p1} />
          </>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

function LabelEditor({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)
  return (
    <input
      autoFocus
      value={value}
      maxLength={40}
      dir="auto"
      aria-label={t('ws.link.label')}
      placeholder={t('ws.link.labelPlaceholder')}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value)
        if (e.key === 'Escape') onDone(null)
        e.stopPropagation()
      }}
      className="h-8 w-40 rounded-full border-[2.5px] border-line bg-surface px-3 text-xs font-bold text-ink outline-none neo-shadow-sm"
    />
  )
}

/** Floating tools above a selected link. */
function LinkToolbar({
  relation,
  x,
  y,
  onEditLabel,
}: {
  relation: RelationRow
  x: number
  y: number
  onEditLabel: () => void
}) {
  const { t } = useTranslation()
  const update = useWorkspace((s) => s.updateRelation)
  const remove = useWorkspace((s) => s.deleteRelation)
  const select = useWorkspace((s) => s.select)
  const { fitView } = useReactFlow()
  const btn =
    'flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-paper-sunken'
  return (
    <div
      role="toolbar"
      aria-label={t('ws.link.tools')}
      className="nodrag nopan pointer-events-auto absolute flex items-center gap-0.5 rounded-neo border-[2.5px] border-line bg-surface p-1 neo-shadow"
      style={{ transform: `translate(-50%, -100%) translate(${x}px, ${y - 22}px)` }}
    >
      <label className="relative">
        <span className="sr-only">{t('ws.link.kind')}</span>
        <select
          value={relation.type}
          onChange={(e) => update(relation.id, { type: e.target.value as RelationType })}
          className="h-9 cursor-pointer appearance-none rounded-lg bg-brand-soft ps-2.5 pe-7 text-[13px] font-bold text-ink outline-none"
        >
          {RELATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`ws.kinds.${type}`)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          strokeWidth={2.6}
          aria-hidden
          className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2"
        />
      </label>
      <span aria-hidden className="mx-0.5 h-5 w-0.5 bg-line-soft" />
      <button
        type="button"
        className={btn}
        aria-label={t('ws.link.swap')}
        title={t('ws.link.swap')}
        onClick={() =>
          update(relation.id, { from_node: relation.to_node, to_node: relation.from_node })
        }
      >
        <ArrowLeftRight size={16} aria-hidden />
      </button>
      <button
        type="button"
        className={cn(
          btn,
          relation.direction === 'both' && 'bg-selected text-selected-ink hover:bg-selected',
        )}
        aria-label={t('ws.link.bothWays')}
        aria-pressed={relation.direction === 'both'}
        title={t('ws.link.bothWays')}
        onClick={() =>
          update(relation.id, { direction: relation.direction === 'both' ? 'forward' : 'both' })
        }
      >
        <MoveHorizontal size={16} aria-hidden />
      </button>
      <button
        type="button"
        className={btn}
        aria-label={t('ws.link.editLabel')}
        title={t('ws.link.editLabel')}
        onClick={onEditLabel}
      >
        <PenLine size={16} aria-hidden />
      </button>
      <button
        type="button"
        className={btn}
        aria-label={t('ws.link.goOther')}
        title={t('ws.link.goOther')}
        onClick={() => {
          select(relation.to_node)
          void fitView({ nodes: [{ id: relation.to_node }], ...camera(400), maxZoom: 1.1 })
        }}
      >
        <SquareArrowOutUpRight size={16} aria-hidden className="rtl:-scale-x-100" />
      </button>
      <span aria-hidden className="mx-0.5 h-5 w-0.5 bg-line-soft" />
      <button
        type="button"
        className={cn(btn, 'text-danger')}
        aria-label={t('ws.link.delete')}
        title={t('ws.link.delete')}
        onClick={() => remove(relation.id)}
      >
        <Trash size={16} aria-hidden />
      </button>
    </div>
  )
}

/**
 * A square on each end of a selected link: drag it onto another block to move that end.
 * While dragging, a dashed line follows the pointer (drawn in screen space).
 */
function EndHandle({
  relation,
  end,
  at,
  other,
}: {
  relation: RelationRow
  end: 'from' | 'to'
  at: { x: number; y: number }
  other: { x: number; y: number }
}) {
  const { t } = useTranslation()
  const update = useWorkspace((s) => s.updateRelation)
  const { flowToScreenPosition } = useReactFlow()
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setDrag({ x: e.clientX, y: e.clientY })
    const move = (ev: PointerEvent) => setDrag({ x: ev.clientX, y: ev.clientY })
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag(null)
      const node = nodeIdAt(ev.clientX, ev.clientY)
      const keep = end === 'from' ? relation.to_node : relation.from_node
      if (
        !node ||
        node === keep ||
        node === (end === 'from' ? relation.from_node : relation.to_node)
      )
        return
      if (existingLink(node, keep)) return
      update(relation.id, end === 'from' ? { from_node: node } : { to_node: node })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const fixed = drag ? flowToScreenPosition(other) : null
  return (
    <>
      <button
        type="button"
        aria-label={t('ws.link.moveEnd')}
        title={t('ws.link.moveEnd')}
        onPointerDown={onPointerDown}
        className="nodrag nopan pointer-events-auto absolute size-4 cursor-grab rounded-[4px] border-[3px] border-brand bg-surface active:cursor-grabbing"
        style={{ transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` }}
      />
      {drag &&
        fixed &&
        createPortal(
          <svg aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full">
            <line
              x1={fixed.x}
              y1={fixed.y}
              x2={drag.x}
              y2={drag.y}
              stroke="var(--brand)"
              strokeWidth={3}
              strokeDasharray="7 6"
              strokeLinecap="round"
            />
          </svg>,
          document.body,
        )}
    </>
  )
}

export type BundleEdgeT = Edge<
  { count: number; label: string; rtl: boolean; dimmed?: boolean },
  'bundle'
>

/**
 * Zoomed out: the links between two cards (sections or chapters) drawn as one line, thicker for
 * more links, with the count. Line and label keep their on-screen size at any zoom.
 */
export function BundleEdge({ id, source, target, data }: EdgeProps<BundleEdgeT>) {
  const s = rectOf(useInternalNode(source))
  const tg = rectOf(useInternalNode(target))
  const placed = useLabelPoint(source, target, data?.rtl ?? false, labelSize(data?.label ?? '').w)
  if (!s || !tg || !data) return null
  const { path, label: middle } = floatingPath(s, tg, data.rtl)
  const label = placed ?? middle
  const width = 2.5 + Math.min(data.count, 6) * 0.6
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={24}
        style={{ stroke: 'var(--brand)', strokeWidth: `calc(${width}px / var(--z))` }}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            'mynota-zoomtext nodrag nopan pointer-events-none absolute',
            data.dimmed && 'opacity-20',
          )}
          style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
        >
          <span
            dir="auto"
            className="zt-small block max-w-[calc(220px/var(--z))] truncate rounded-full border-[calc(2px/var(--z))] border-brand bg-surface px-[calc(8px/var(--z))] py-[calc(2px/var(--z))] font-bold text-ink"
          >
            {data.label}
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const edgeTypes = {
  branch: BranchEdge,
  bus: BusEdge,
  tree: TreeEdge,
  rail: RailEdge,
  step: StepEdge,
  relation: RelationEdge,
  bundle: BundleEdge,
}
