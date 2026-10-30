import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { PALETTE, makeNode } from '@/ai/pipeline/convert'
import type { NodeRow } from '@/lib/database.types'
import { useBuild } from '../buildStore'
import { useWorkspace } from '../workspaceStore'
import { useCanvasUi } from './canvasUi'
import { edgeTypes } from './edges'
import { childrenIndex, computeLayout, mirrorBox, type Box } from './layout'
import { nodeTypes } from './nodes'
import { FIT } from './fit'
import { chapterColor } from './visuals'

/** The section (top-level branch) a node belongs to, or null for the root. */
function sectionOf(
  nodes: Record<string, NodeRow>,
  rootId: string | null,
  id: string,
): NodeRow | null {
  let cur = nodes[id]
  while (cur?.parent_id && cur.parent_id !== rootId) cur = nodes[cur.parent_id]
  return cur && cur.parent_id === rootId ? cur : null
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
    },
    [t],
  )
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
  const { connecting, connectFrom, pick, cancelConnect, openMenu, askDelete } = useCanvasUi()
  const { fitView } = useReactFlow()
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({})

  const list = useMemo(() => Object.values(nodes), [nodes])
  const layout = useMemo(() => computeLayout(list), [list])
  const kids = useMemo(() => childrenIndex(list), [list])

  // Logical layout → screen: mirrored for Arabic so columns run right to left.
  const toScreen = useCallback(
    (b: Box) => (rtl ? mirrorBox(b, layout.width) : b),
    [rtl, layout.width],
  )

  const flowNodes = useMemo<Node[]>(() => {
    const out: Node[] = []
    for (const region of layout.regions) {
      const section = nodes[region.sectionId]
      const b = toScreen(region)
      out.push({
        id: `region:${region.sectionId}`,
        type: 'region',
        position: { x: b.x, y: b.y },
        width: b.w,
        height: b.h,
        data: {
          color: section?.color ?? null,
          failed: failedSections[region.sectionId]?.state === 'failed',
        },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      })
    }
    for (const n of list) {
      const box = layout.boxes[n.id]
      if (!box || layout.hidden.has(n.id)) continue
      const b = toScreen(box)
      const pos = drag[n.id] ?? { x: b.x, y: b.y }
      const common = {
        id: n.id,
        position: pos,
        width: box.w,
        height: box.h,
        selected: n.id === selectedId,
        draggable: canEdit,
        ariaLabel: n.title,
      }
      if (n.id === layout.rootId) {
        out.push({ ...common, type: 'root', data: { node: n, mapType: map?.type ?? null } })
      } else if (n.parent_id === layout.rootId) {
        out.push({
          ...common,
          type: 'section',
          data: { node: n, childCount: kids.get(n.id)?.length ?? 0 },
        })
      } else {
        const section = sectionOf(nodes, layout.rootId, n.id)
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
            color: section?.color ?? null,
            step,
            connectFrom: connectFrom === n.id,
            rtl,
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
    canEdit,
    map,
    kids,
    connectFrom,
    rtl,
    failedSections,
  ])

  const flowEdges = useMemo<Edge[]>(() => {
    const out: Edge[] = []
    const visible = (id: string) => Boolean(layout.boxes[id]) && !layout.hidden.has(id)
    for (const n of list) {
      if (!n.parent_id || !visible(n.id) || !visible(n.parent_id)) continue
      const parent = nodes[n.parent_id]
      if (n.parent_id === layout.rootId) {
        out.push({
          id: `h:${n.id}`,
          source: n.parent_id,
          target: n.id,
          type: 'branch',
          selectable: false,
          focusable: false,
        })
      } else if (parent?.branch_view === 'process' && parent.parent_id === layout.rootId) {
        const siblings = kids.get(parent.id) ?? []
        const i = siblings.findIndex((s) => s.id === n.id)
        const prev = siblings[i - 1]
        if (i === 0)
          out.push({
            id: `h:${n.id}`,
            source: parent.id,
            target: n.id,
            type: 'tree',
            data: { rtl },
            selectable: false,
            focusable: false,
          })
        else if (prev)
          out.push({
            id: `h:${n.id}`,
            source: prev.id,
            target: n.id,
            type: 'step',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: 'var(--line)',
              width: 16,
              height: 16,
            },
            selectable: false,
            focusable: false,
          })
      } else {
        out.push({
          id: `h:${n.id}`,
          source: n.parent_id,
          target: n.id,
          type: 'tree',
          data: { rtl },
          selectable: false,
          focusable: false,
        })
      }
    }
    for (const r of Object.values(relations)) {
      if (!visible(r.from_node) || !visible(r.to_node)) continue
      const color = r.status === 'suggested' ? 'var(--ink-muted)' : 'var(--brand)'
      out.push({
        id: `r:${r.id}`,
        source: r.from_node,
        target: r.to_node,
        type: 'relation',
        data: { relation: r, canEdit, selected: r.id === selectedRelationId, rtl },
        markerEnd:
          r.direction === 'backward'
            ? undefined
            : { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        markerStart:
          r.direction === 'backward' || r.direction === 'both'
            ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
            : undefined,
        zIndex: 1,
      })
    }
    return out
  }, [list, nodes, relations, layout, kids, rtl, canEdit, selectedRelationId])

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
  const visibleCount = flowNodes.length
  const autoFit = useRef(true)
  const fitted = useRef(0)
  useEffect(() => {
    if (!autoFit.current || visibleCount === fitted.current) return
    const first = fitted.current === 0
    fitted.current = visibleCount
    const id = setTimeout(() => void fitView({ ...FIT, duration: first ? 0 : 350 }), 60)
    return () => clearTimeout(id)
  }, [visibleCount, fitView])

  // Keyboard: Delete removes the selection, Esc cancels connecting / clears selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
        return
      if (e.key === 'Escape') {
        if (useCanvasUi.getState().connecting) cancelConnect()
        else select(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit) {
        const id = useWorkspace.getState().selectedId
        if (id && useWorkspace.getState().nodes[id]?.parent_id) {
          e.preventDefault()
          askDelete(id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, cancelConnect, select, askDelete])

  return (
    <div className="mynota-flow relative h-full w-full" aria-label={t('ws.canvas')}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          if (node.type === 'region') return
          if (connecting) pick(node.id)
          else select(node.id)
        }}
        onNodeContextMenu={(e, node) => {
          if (node.type === 'region') return
          e.preventDefault()
          select(node.id)
          openMenu(node.id, e.clientX, e.clientY)
        }}
        onPaneClick={() => {
          if (connecting) cancelConnect()
          select(null)
        }}
        nodesConnectable={false}
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
          if (event) autoFit.current = false // a real pan/zoom by the student, not ours
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
      </ReactFlow>
    </div>
  )
}
