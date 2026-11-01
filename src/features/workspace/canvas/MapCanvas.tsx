import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motionMs } from '@/lib/motion'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  getBezierPath,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useStore,
  useStoreApi,
  type ConnectionLineComponentProps,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { PALETTE, makeNode } from '@/ai/pipeline/convert'
import type { NodeRow } from '@/lib/database.types'
import { matchesQuery, nodeSearchText } from '@/lib/searchText'
import { useBuild } from '../buildStore'
import { LiveCursors } from '../live/LivePresence'
import { useWorkspace } from '../workspaceStore'
import { useCanvasUi } from './canvasUi'
import { focusGroupOf } from './focus'
import { OUTLINE_DRAG_TYPE, anchorBeside, createLinkedBlock, linkNodes, nodeIdAt } from './linking'
import { edgeTypes } from './edges'
import { childrenIndex, computeLayout, mirrorBox, type Box } from './layout'
import { nodeTypes } from './nodes'
import {
  bundleRelations,
  chapterSummaries,
  levelFor,
  nearestShown,
  type ChapterSummary,
} from './zoom'
import { FIT } from './fit'
import { chapterColor, relationColor } from './visuals'
import { cn } from '@/lib/cn'

/** Dashed line that follows the pointer while dragging a new link. */
function LinkLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  })
  return (
    <path
      d={path}
      fill="none"
      stroke="var(--brand)"
      strokeWidth={3}
      strokeDasharray="7 6"
      strokeLinecap="round"
    />
  )
}

/** Client coordinates of a mouse or touch event. */
function pointOf(e: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('changedTouches' in e) {
    const t = e.changedTouches[0]
    return { x: t?.clientX ?? 0, y: t?.clientY ?? 0 }
  }
  return { x: e.clientX, y: e.clientY }
}

/**
 * Whether a node is a section card: a child of the map title, or in a book, a child of a
 * chapter (which is a child of the book title).
 */
function isSectionOf(nodes: Record<string, NodeRow>, rootId: string | null, book: boolean) {
  return (n: NodeRow): boolean => {
    if (!n.parent_id || !rootId) return false
    if (!book) return n.parent_id === rootId
    return n.parent_id !== rootId && nodes[n.parent_id]?.parent_id === rootId
  }
}

/** The section a node belongs to (itself if it is one), or null for the title and chapters. */
function sectionOf(
  nodes: Record<string, NodeRow>,
  isSection: (n: NodeRow) => boolean,
  id: string,
): NodeRow | null {
  let cur = nodes[id]
  while (cur && !isSection(cur)) cur = cur.parent_id ? nodes[cur.parent_id] : undefined
  return cur ?? null
}

/** Adds a child (a section under the map title, a block anywhere else) and selects it. */
export function useAddChild() {
  const { t } = useTranslation()
  return useCallback(
    (parentId: string) => {
      const ws = useWorkspace.getState()
      const parent = ws.nodes[parentId]
      if (!parent || !ws.map) return
      const siblings = Object.values(ws.nodes).filter((n) => n.parent_id === parentId)
      const isSection = parent.parent_id === null
      const node = makeNode({
        map_id: ws.map.id,
        parent_id: parentId,
        sort_order: siblings.reduce((m, n) => Math.max(m, n.sort_order + 1), 0),
        level: isSection ? 'section' : 'block',
        title: isSection ? t('ws.newSection') : t('ws.newBlock'),
        color: isSection ? (PALETTE[siblings.length % PALETTE.length] ?? 'yellow') : null,
        lang: parent.lang,
        dir: parent.dir,
      })
      ws.addNodes([node])
      if (parent.collapsed) ws.updateNode(parent.id, { collapsed: false })
      ws.select(node.id)
      // A new block needs a title: open it in the panel straight away.
      useCanvasUi.getState().setPanelOpen(true, 'edit')
    },
    [t],
  )
}

function countDescendants(kids: Map<string | null, NodeRow[]>, id: string): number {
  let count = 0
  const stack = [...(kids.get(id) ?? [])]
  for (let cur = stack.pop(); cur; cur = stack.pop()) {
    count += 1
    stack.push(...(kids.get(cur.id) ?? []))
  }
  return count
}

export function MapCanvas() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === 'rtl'
  const nodes = useWorkspace((s) => s.nodes)
  const relations = useWorkspace((s) => s.relations)
  const map = useWorkspace((s) => s.map)
  const selectedId = useWorkspace((s) => s.selectedId)
  const selectedRelationId = useWorkspace((s) => s.selectedRelationId)
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const select = useWorkspace((s) => s.select)
  const updateNode = useWorkspace((s) => s.updateNode)
  const failedSections = useBuild((s) => s.sections)
  const { connecting, connectFrom, multi, pick, cancelConnect, openMenu, askDelete } = useCanvasUi()
  const spotlight = useCanvasUi((s) => s.spotlight)
  const focusId = useCanvasUi((s) => s.focusId)
  const { fitView } = useReactFlow()
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({})
  // While a link is being dragged: the block under the pointer, highlighted as the drop target.
  const [linking, setLinking] = useState(false)
  const [linkTarget, setLinkTarget] = useState<string | null>(null)

  const sources = useWorkspace((s) => s.sources)
  const list = useMemo(() => Object.values(nodes), [nodes])
  // The selected block opens in place (canvas step 2); the layout makes room for it.
  const expandedId = selectedId && nodes[selectedId]?.level === 'block' ? selectedId : null
  const layout = useMemo(() => computeLayout(list, { expandedId }), [list, expandedId])
  const kids = useMemo(() => childrenIndex(list), [list])
  const { book, rootId } = layout
  const isSection = useMemo(() => isSectionOf(nodes, rootId, book), [nodes, rootId, book])

  // Semantic zoom: re-render only when the level changes; the exact zoom goes to a CSS variable.
  const level = useStore((s) => levelFor(s.transform[2], book))
  const store = useStoreApi()
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const set = (z: number) => wrapRef.current?.style.setProperty('--z', z.toFixed(3))
    set(store.getState().transform[2])
    return store.subscribe((s) => set(s.transform[2]))
  }, [store])

  const chapters = useMemo(
    () => (book ? chapterSummaries(nodes, sources, rootId) : []),
    [book, nodes, sources, rootId],
  )
  const chapterById = useMemo(() => {
    const m = new Map<string, ChapterSummary>()
    for (const c of chapters) m.set(c.id, c)
    return m
  }, [chapters])
  /** Book maps: sections and blocks take their chapter's color. */
  const colorOf = useCallback(
    (n: NodeRow, section: NodeRow | null) => {
      if (book) {
        const ch = layout.chapterOf[n.id]
        return ch ? (nodes[ch]?.color ?? null) : null
      }
      return section?.color ?? null
    },
    [book, layout.chapterOf, nodes],
  )

  // Logical layout → screen: mirrored for Arabic so columns run right to left.
  const toScreen = useCallback(
    (b: Box) => (rtl ? mirrorBox(b, layout.width) : b),
    [rtl, layout.width],
  )

  // Book maps: a chapter's live document loads when the chapter is on screen at the sections or
  // blocks level (Phase 6.5). Checked a moment after the view stops changing.
  useEffect(() => {
    if (!book) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const check = () => {
      timer = null
      const { transform, width, height } = store.getState()
      const [tx, ty, z] = transform
      if (!width || !height || levelFor(z, book) === 'chapters') return
      const x0 = -tx / z
      const y0 = -ty / z
      const x1 = x0 + width / z
      const y1 = y0 + height / z
      const ids = layout.regions
        .filter((r) => r.kind === 'chapter')
        .filter((r) => {
          const b = toScreen(r)
          return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0
        })
        .map((r) => r.sectionId)
      if (ids.length) useWorkspace.getState().showChapters(ids)
    }
    const schedule = () => {
      if (!timer) timer = setTimeout(check, 250)
    }
    schedule()
    const unsubscribe = store.subscribe(schedule)
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [book, store, layout.regions, toScreen])

  /** The focus unit a node belongs to: its chapter (book) or its section (notes map). */
  const groupOf = useCallback((id: string) => focusGroupOf(nodes, id), [nodes])
  const cover = useCanvasUi((s) => s.cover)
  const revealed = useCanvasUi((s) => s.revealed)
  // Live filter (outline search box): matches and the path above them stay bright.
  const filter = useCanvasUi((s) => s.filter.trim())
  const filterHits = useMemo(() => {
    if (!filter) return null
    const hit = new Set<string>()
    for (const n of list) {
      if (!matchesQuery(nodeSearchText(n), filter)) continue
      let cur: NodeRow | undefined = n
      while (cur && !hit.has(cur.id)) {
        hit.add(cur.id)
        cur = cur.parent_id ? nodes[cur.parent_id] : undefined
      }
    }
    return hit
  }, [filter, list, nodes])
  const outside = useCallback(
    (id: string) =>
      (focusId !== null && groupOf(id) !== focusId) || (filterHits !== null && !filterHits.has(id)),
    [focusId, groupOf, filterHits],
  )

  const flowNodes = useMemo<Node[]>(() => {
    const out: Node[] = []
    for (const region of layout.regions) {
      const b = toScreen(region)
      const base = {
        id: `region:${region.sectionId}`,
        position: { x: b.x, y: b.y },
        width: b.w,
        height: b.h,
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      }
      const chapter = chapterById.get(region.sectionId)
      const regionDim = outside(region.sectionId)
      if (region.kind === 'chapter' && chapter) {
        out.push({
          ...base,
          className: cn(regionDim && 'is-dimmed'),
          type: 'chapterRegion',
          data: { chapter, level },
        })
        continue
      }
      out.push({
        ...base,
        className: cn(regionDim && 'is-dimmed'),
        type: 'region',
        data: {
          color: nodes[region.sectionId]?.color ?? null,
          failed: failedSections[region.sectionId]?.state === 'failed',
        },
      })
    }
    for (const n of list) {
      const box = layout.boxes[n.id]
      if (!box || layout.hidden.has(n.id)) continue
      const isRoot = n.id === rootId
      const isChapter = book && !isRoot && n.parent_id === rootId
      const section = isRoot || isChapter ? null : sectionOf(nodes, isSection, n.id)
      const isSectionCard = section?.id === n.id
      // What each zoom level shows: chapter overviews / section cards / everything.
      if (level === 'chapters' && !isRoot) continue
      if (level === 'sections' && !isRoot && !isChapter && !isSectionCard) continue
      const b = toScreen(box)
      const pos = drag[n.id] ?? { x: b.x, y: b.y }
      const marked = connectFrom === n.id || multi.includes(n.id) || spotlight.includes(n.id)
      const common = {
        id: n.id,
        position: pos,
        width: box.w,
        height: box.h,
        className: cn(
          marked && 'is-marked',
          linkTarget === n.id && 'is-link-target',
          !isRoot && outside(n.id) && 'is-dimmed',
        ),
        selected: n.id === selectedId,
        draggable: canEdit && level === 'blocks' && !isChapter,
        ariaLabel:
          cover && n.level === 'block' && n.id !== selectedId && !revealed.includes(n.id)
            ? t('ws.studyView.covered')
            : n.title,
      }
      if (isRoot) {
        out.push({ ...common, type: 'root', data: { node: n, mapType: map?.type ?? null } })
      } else if (isChapter) {
        const chapter = chapterById.get(n.id)
        if (chapter) out.push({ ...common, type: 'chapterTab', data: { chapter } })
      } else if (isSectionCard) {
        const column = layout.columns[n.id]
        const children = kids.get(n.id) ?? []
        const expanded = level === 'sections' && column
        // Zoomed out, the card grows to cover its whole column (same place, more to read).
        const eb = expanded
          ? toScreen({ x: column.x, y: column.y, w: column.w, h: column.h })
          : null
        out.push({
          ...common,
          ...(eb && { position: { x: eb.x, y: eb.y }, width: eb.w, height: eb.h }),
          type: 'section',
          data: {
            node: n,
            childCount: book ? countDescendants(kids, n.id) : children.length,
            color: book ? colorOf(n, section) : undefined,
            expanded: expanded ? { blockTitles: children.slice(0, 12).map((c) => c.title) } : null,
          },
        })
      } else {
        const siblings = kids.get(n.parent_id) ?? []
        const step =
          section?.branch_view === 'process' && n.parent_id === section.id
            ? siblings.findIndex((s) => s.id === n.id) + 1
            : null
        out.push({
          ...common,
          type: 'block',
          data: {
            node: n,
            color: colorOf(n, section),
            step,
            connectFrom: connectFrom === n.id,
            rtl,
            expanded: n.id === expandedId && level === 'blocks',
          },
        })
      }
    }
    return out
  }, [
    layout,
    list,
    nodes,
    toScreen,
    drag,
    selectedId,
    expandedId,
    canEdit,
    map,
    kids,
    connectFrom,
    multi,
    linkTarget,
    rtl,
    failedSections,
    level,
    book,
    rootId,
    isSection,
    chapterById,
    colorOf,
    spotlight,
    outside,
    cover,
    revealed,
    t,
  ])

  const flowEdges = useMemo<Edge[]>(() => {
    const out: Edge[] = []
    const shown = new Set(flowNodes.map((n) => n.id))
    // Focus mode: a line touching a dimmed card is dimmed with it.
    const dimmed = new Set(
      flowNodes.filter((n) => n.className?.includes('is-dimmed')).map((n) => n.id),
    )
    const dim = (edges: Edge[]) =>
      dimmed.size
        ? edges.map((e) =>
            dimmed.has(e.source) || dimmed.has(e.target)
              ? { ...e, className: cn(e.className, 'is-dimmed'), data: { ...e.data, dimmed: true } }
              : e,
          )
        : edges
    // Tree lines take the color of the section they belong to and end in an arrowhead.
    const tint = (id: string) => {
      const n = nodes[id]
      if (!n) return 'var(--line)'
      return chapterColor(colorOf(n, isSection(n) ? n : sectionOf(nodes, isSection, id))).strong
    }
    const arrow = (color: string) => ({
      type: MarkerType.ArrowClosed,
      color,
      width: 14,
      height: 14,
    })
    const branch = (source: string, target: string): Edge => ({
      id: `h:${target}`,
      source,
      target,
      type: 'branch',
      data: { color: tint(target) },
      markerEnd: arrow(tint(target)),
      selectable: false,
      focusable: false,
    })
    const relationsList = Object.values(relations).filter((r) => r.status !== 'dismissed')

    if (level !== 'blocks') {
      // Zoomed out: the tree as title → sections (or chapter tab → sections), and links bundled
      // between the cards that are still drawn.
      if (level === 'sections')
        for (const n of list)
          if (n.parent_id && shown.has(n.id) && shown.has(n.parent_id) && isSection(n))
            out.push(branch(n.parent_id, n.id))
      const visibleOf =
        level === 'chapters'
          ? (id: string) => {
              const ch = layout.chapterOf[id]
              return ch ? `region:${ch}` : null
            }
          : (id: string) => {
              const v = nearestShown(nodes, id, (n) => shown.has(n.id) && n.id !== rootId)
              return v && shown.has(v) ? v : null
            }
      for (const bundle of bundleRelations(relationsList, visibleOf)) {
        if (!shown.has(bundle.from) || !shown.has(bundle.to)) continue
        const only = bundle.relations.length === 1 ? bundle.relations[0] : undefined
        out.push({
          id: bundle.id,
          source: bundle.from,
          target: bundle.to,
          type: 'bundle',
          data: {
            count: bundle.relations.length,
            label: only
              ? only.label || t(`ws.relations.${only.type}`)
              : t('ws.bundle', { count: bundle.relations.length }),
            rtl,
          },
          focusable: false,
          zIndex: 0, // under the cards (they stay clickable), above the regions
        })
      }
      return dim(out)
    }

    const visible = (id: string) => shown.has(id)
    for (const n of list) {
      if (!n.parent_id || !visible(n.id) || !visible(n.parent_id)) continue
      const parent = nodes[n.parent_id]
      if (n.parent_id === rootId) {
        // Books: chapters sit in their own regions; no lines from the book title.
        if (!book) out.push(branch(n.parent_id, n.id))
      } else if (book && isSection(n)) {
        out.push(branch(n.parent_id, n.id))
      } else if (parent?.branch_view === 'process' && isSection(parent)) {
        const siblings = kids.get(parent.id) ?? []
        const i = siblings.findIndex((s) => s.id === n.id)
        const prev = siblings[i - 1]
        if (i === 0)
          out.push({
            id: `h:${n.id}`,
            source: parent.id,
            target: n.id,
            type: 'tree',
            data: { rtl, color: tint(n.id) },
            markerEnd: arrow(tint(n.id)),
            selectable: false,
            focusable: false,
          })
        else if (prev)
          out.push({
            id: `h:${n.id}`,
            source: prev.id,
            target: n.id,
            type: 'step',
            data: { color: tint(n.id) },
            markerEnd: arrow(tint(n.id)),
            selectable: false,
            focusable: false,
          })
      } else {
        out.push({
          id: `h:${n.id}`,
          source: n.parent_id,
          target: n.id,
          // Grouped columns: top-level blocks hang from their section's rail.
          type: layout.railed.has(n.id) ? 'rail' : 'tree',
          data: { rtl, color: tint(n.id) },
          markerEnd: arrow(tint(n.id)),
          selectable: false,
          focusable: false,
        })
      }
    }
    for (const r of relationsList) {
      if (!visible(r.from_node) || !visible(r.to_node)) continue
      const color = relationColor(r)
      out.push({
        id: `r:${r.id}`,
        source: r.from_node,
        target: r.to_node,
        type: 'relation',
        className: r.status === 'suggested' ? 'is-suggested' : undefined,
        data: { relation: r, canEdit, selected: r.id === selectedRelationId, rtl },
        markerEnd:
          r.direction === 'backward'
            ? undefined
            : { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        markerStart:
          r.direction === 'backward' || r.direction === 'both'
            ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
            : undefined,
        zIndex: 0, // links pass under blocks so a block stays clickable; labels stay on top
      })
    }
    return dim(out)
  }, [
    flowNodes,
    list,
    nodes,
    relations,
    layout,
    kids,
    rtl,
    canEdit,
    selectedRelationId,
    level,
    book,
    rootId,
    colorOf,
    isSection,
    t,
  ])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type !== 'position') continue
        if (c.dragging && c.position) {
          const p = c.position
          setDrag((d) => ({ ...d, [c.id]: p }))
        } else if (c.dragging === false) {
          setDrag((d) => {
            const p = d[c.id]
            const box = layout.boxes[c.id]
            if (p && box) {
              const logicalX = rtl ? layout.width - p.x - box.w : p.x
              updateNode(c.id, { position: { x: Math.round(logicalX), y: Math.round(p.y) } })
            }
            const next = { ...d }
            Reflect.deleteProperty(next, c.id)
            return next
          })
        }
      }
    },
    [layout, rtl, updateNode],
  )

  // Keep the whole map in view while it grows (the AI adds sections, then blocks), until the
  // student pans or zooms themselves.
  const visibleCount = list.length - layout.hidden.size
  const mapId = map?.id
  const fitted = useRef(0)
  useEffect(() => {
    useCanvasUi.getState().lockView(false)
    useCanvasUi.getState().setFocus(null)
    useCanvasUi.getState().setCover(false)
    useCanvasUi.getState().setFilter('')
    fitted.current = 0
  }, [mapId])
  useEffect(() => {
    if (useCanvasUi.getState().viewLocked || visibleCount === fitted.current) return
    const first = fitted.current === 0
    fitted.current = visibleCount
    const id = setTimeout(() => void fitView({ ...FIT, duration: first ? 0 : motionMs(350) }), 60)
    return () => clearTimeout(id)
  }, [visibleCount, fitView])

  // Keyboard: L links the selection (search), Delete removes a block or link, Esc backs out,
  // Ctrl/Cmd+Z undoes this person's own changes (Shift+Z or Y redoes).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      // Inside a text field the browser undoes the typing itself.
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
        return
      const ui = useCanvasUi.getState()
      const ws = useWorkspace.getState()
      if ((e.ctrlKey || e.metaKey) && !e.altKey && canEdit) {
        // Latin letter, or the key's position on Arabic and other layouts.
        const k = /^[a-z]$/i.test(e.key)
          ? e.key.toLowerCase()
          : e.code.replace(/^Key/, '').toLowerCase()
        if (k === 'z' || k === 'y') {
          e.preventDefault()
          if (k === 'y' || e.shiftKey) ws.redo()
          else ws.undo()
        }
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (ui.picker || ui.search) return // the popover handles its own keys
      if (e.key === 'Escape') {
        if (ui.connecting) cancelConnect()
        else if (ui.multi.length) ui.clearMulti()
        else if (ui.panelOpen) ui.setPanelOpen(false)
        else select(null)
      } else if (e.key === 'Enter' && ws.selectedId && ws.nodes[ws.selectedId]?.level === 'block') {
        // Enter opens the selected block in the details panel.
        e.preventDefault()
        ui.setPanelOpen(true, 'read')
      } else if ((e.key === 'l' || e.key === 'L') && canEdit) {
        const sources = ui.multi.length ? ui.multi : ws.selectedId ? [ws.selectedId] : []
        e.preventDefault()
        if (sources[0]) ui.openSearch(sources, anchorBeside(sources[0]))
        else ui.startConnect()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit) {
        if (ws.selectedRelationId) {
          e.preventDefault()
          ws.deleteRelation(ws.selectedRelationId)
          return
        }
        const id = ws.selectedId
        if (id && ws.nodes[id]?.parent_id) {
          e.preventDefault()
          askDelete(id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, cancelConnect, select, askDelete])

  // Dragging a new link: highlight the block under the pointer.
  useEffect(() => {
    if (!linking) return
    let frame = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setLinkTarget(nodeIdAt(e.clientX, e.clientY)))
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      setLinkTarget(null)
    }
  }, [linking])

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      setLinking(false)
      const from = state.fromNode?.id
      if (!from) return
      const point = pointOf(event)
      const over =
        state.toNode && !state.toNode.id.startsWith('region:')
          ? state.toNode.id
          : nodeIdAt(point.x, point.y)
      if (over === from) return
      if (over) linkNodes(from, over, point)
      else createLinkedBlock(from, t('ws.newBlock'), point)
    },
    [t],
  )

  return (
    <div
      ref={wrapRef}
      data-zoom-level={level}
      className={cn('mynota-flow relative h-full w-full', linking && 'is-linking')}
      aria-label={t('ws.canvas')}
      onDragOver={(e) => {
        if (canEdit && e.dataTransfer.types.includes(OUTLINE_DRAG_TYPE)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'link'
          setLinkTarget(nodeIdAt(e.clientX, e.clientY))
        }
      }}
      onDragLeave={() => setLinkTarget(null)}
      onDrop={(e) => {
        const from = e.dataTransfer.getData(OUTLINE_DRAG_TYPE)
        setLinkTarget(null)
        if (!canEdit || !from) return
        e.preventDefault()
        const to = nodeIdAt(e.clientX, e.clientY)
        if (to && to !== from) linkNodes(from, to, { x: e.clientX, y: e.clientY })
      }}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(e, node) => {
          if (node.type === 'chapterRegion' && level === 'chapters') {
            // Zoomed all the way out: a chapter opens by zooming into it.
            useCanvasUi.getState().lockView()
            void fitView({
              nodes: [{ id: node.id }],
              ...FIT,
              maxZoom: 0.9,
              duration: motionMs(450),
            })
            return
          }
          if (node.type === 'region' || node.type === 'chapterRegion') return
          const ui = useCanvasUi.getState()
          if (connecting) {
            const pair = pick(node.id)
            if (pair) linkNodes(pair.from, pair.to, anchorBeside(pair.to))
          } else if (e.shiftKey && canEdit && node.type !== 'root') {
            // Shift-click gathers several blocks to link them all at once (press L).
            const current = useWorkspace.getState().selectedId
            if (!ui.multi.length && current && current !== node.id && nodes[current]?.parent_id)
              ui.toggleMulti(current)
            ui.toggleMulti(node.id)
          } else {
            ui.clearMulti()
            if (ui.cover) ui.reveal(node.id)
            select(node.id)
          }
        }}
        onNodeDoubleClick={(_, node) => {
          // Double-click: straight to the details panel.
          if (node.type !== 'block' || connecting) return
          select(node.id)
          useCanvasUi.getState().setPanelOpen(true, 'read')
        }}
        onNodeContextMenu={(e, node) => {
          if (node.type === 'region' || node.type === 'chapterRegion') return
          e.preventDefault()
          select(node.id)
          openMenu(node.id, e.clientX, e.clientY)
        }}
        onEdgeClick={(_, edge) => {
          // A bundle of links: zoom in on the two cards so the single links show.
          if (edge.type !== 'bundle') return
          useCanvasUi.getState().lockView()
          void fitView({
            nodes: [{ id: edge.source }, { id: edge.target }],
            ...FIT,
            minZoom: 0.7,
            duration: motionMs(450),
          })
        }}
        onPaneClick={() => {
          if (connecting) cancelConnect()
          useCanvasUi.getState().clearMulti()
          useCanvasUi.getState().setSpotlight([])
          useCanvasUi.getState().setPanelOpen(false)
          select(null)
        }}
        nodesConnectable={canEdit}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={36}
        connectionLineComponent={LinkLine}
        isValidConnection={(c) => c.source !== c.target && !c.target.startsWith('region:')}
        onConnectStart={() => setLinking(true)}
        onConnectEnd={onConnectEnd}
        elementsSelectable
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        minZoom={0.15}
        maxZoom={2}
        zoomOnDoubleClick={false}
        panOnScroll
        proOptions={{ hideAttribution: true }}
        onMoveStart={(event) => {
          if (event) useCanvasUi.getState().lockView() // a real pan/zoom by the student, not ours
        }}
        fitView
        fitViewOptions={FIT}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="var(--dot)" />
        <MiniMap
          ariaLabel={t('ws.minimap')}
          pannable
          zoomable
          nodeBorderRadius={4}
          nodeColor={(n) =>
            n.type === 'region'
              ? chapterColor((n.data as { color?: NodeRow['color'] }).color).fill
              : n.type === 'chapterRegion'
                ? chapterColor((n.data as { chapter: ChapterSummary }).chapter.color).fill
                : n.type === 'root'
                  ? 'var(--brand)'
                  : 'var(--surface)'
          }
          nodeStrokeColor="var(--line)"
          maskColor="color-mix(in srgb, var(--paper) 55%, transparent)"
          position={rtl ? 'bottom-left' : 'bottom-right'}
          className="hidden md:block"
          style={{ width: 150, height: 100 }}
        />
        <LiveCursors />
      </ReactFlow>
    </div>
  )
}
