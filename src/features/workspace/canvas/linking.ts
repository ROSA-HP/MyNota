import { PALETTE, makeNode, makeRelation } from '@/ai/pipeline/convert'
import type { NodeRow, RelationRow } from '@/lib/database.types'
import { useWorkspace } from '../workspaceStore'
import { useCanvasUi, type Anchor } from './canvasUi'

/** Dragging a block from the outline onto the canvas links it to the block under the drop. */
export const OUTLINE_DRAG_TYPE = 'application/x-mynota-node'

/** The map node under a screen point (not a chapter/section background region). */
export function nodeIdAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)
  const id = el?.closest<HTMLElement>('.react-flow__node')?.dataset.id ?? null
  return id && !id.startsWith('region:') ? id : null
}

/** A point just beside a node on screen, for popovers. */
export function anchorBeside(nodeId: string): Anchor {
  const el = document.querySelector<HTMLElement>(
    `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`,
  )
  const canvas = document.querySelector<HTMLElement>('.mynota-flow')?.getBoundingClientRect()
  const fallback = canvas
    ? { x: canvas.left + canvas.width / 2, y: canvas.top + canvas.height / 4 }
    : { x: window.innerWidth / 2, y: window.innerHeight / 4 }
  if (!el) return fallback
  const r = el.getBoundingClientRect()
  // Off-screen or hidden behind a panel: open the popover over the middle of the canvas.
  if (
    canvas &&
    (r.right < canvas.left ||
      r.left > canvas.right ||
      r.bottom < canvas.top ||
      r.top > canvas.bottom)
  )
    return fallback
  const rtl = document.documentElement.dir === 'rtl'
  const x = rtl ? r.left - 12 : r.right + 12
  return {
    x: canvas ? Math.min(Math.max(x, canvas.left + 40), canvas.right - 40) : x,
    y: r.top + r.height / 2,
  }
}

export function existingLink(a: string, b: string): RelationRow | undefined {
  // A dismissed suggestion does not count: linking that pair by hand makes a real link.
  return Object.values(useWorkspace.getState().relations).find(
    (r) =>
      r.status !== 'dismissed' &&
      ((r.from_node === a && r.to_node === b) || (r.from_node === b && r.to_node === a)),
  )
}

/**
 * Links two nodes and opens the inline picker on the new link. If they are already linked,
 * opens the picker on that link instead of making a duplicate.
 */
export function linkNodes(from: string, to: string, anchor: Anchor): void {
  const ws = useWorkspace.getState()
  const ui = useCanvasUi.getState()
  if (!ws.map || from === to || !ws.nodes[from] || !ws.nodes[to]) return
  const found = existingLink(from, to)
  if (found) {
    ws.selectRelation(found.id)
    ui.openPicker(found.id, anchor, false)
    return
  }
  const r = makeRelation({ map_id: ws.map.id, from_node: from, to_node: to })
  ws.addRelations([r])
  ws.selectRelation(r.id)
  ui.openPicker(r.id, anchor, true)
}

/** Links several sources to one target with the same kind; the picker edits the first link. */
export function linkMany(fromIds: string[], to: string, anchor: Anchor): void {
  const ws = useWorkspace.getState()
  if (!ws.map) return
  const sources = fromIds.filter((f) => f !== to && ws.nodes[f] && !existingLink(f, to))
  if (sources.length <= 1) {
    if (fromIds[0]) linkNodes(fromIds[0], to, anchor)
    return
  }
  const map = ws.map
  const rows = sources.map((f) => makeRelation({ map_id: map.id, from_node: f, to_node: to }))
  ws.addRelations(rows)
  const first = rows[0]
  if (!first) return
  ws.selectRelation(first.id)
  useCanvasUi.getState().openPicker(first.id, anchor, true)
  useCanvasUi.getState().clearMulti()
}

/** Where a new block linked from `from` goes: beside it (same parent), or inside a section. */
function parentForNewBlock(from: NodeRow, nodes: Record<string, NodeRow>): NodeRow | undefined {
  if (!from.parent_id) return from // the map title: a new section
  const parent = nodes[from.parent_id]
  if (parent && !parent.parent_id) return from // a section: a block inside it
  return parent
}

/** Makes a new block next to `from`, links it and opens the picker. Returns the new id. */
export function createLinkedBlock(from: string, title: string, anchor: Anchor): string | null {
  const ws = useWorkspace.getState()
  const source = ws.nodes[from]
  if (!ws.map || !source) return null
  const parent = parentForNewBlock(source, ws.nodes)
  if (!parent) return null
  const siblings = Object.values(ws.nodes).filter((n) => n.parent_id === parent.id)
  const isSection = parent.parent_id === null
  const node = makeNode({
    map_id: ws.map.id,
    parent_id: parent.id,
    sort_order: siblings.reduce((m, n) => Math.max(m, n.sort_order + 1), 0),
    level: isSection ? 'section' : 'block',
    title: title.trim().slice(0, 200) || 'New block',
    color: isSection ? (PALETTE[siblings.length % PALETTE.length] ?? 'yellow') : null,
    lang: source.lang,
    dir: source.dir,
  })
  ws.addNodes([node])
  if (parent.collapsed) ws.updateNode(parent.id, { collapsed: false })
  linkNodes(from, node.id, anchor)
  return node.id
}

/** Most used labels on this map, for one-tap reuse in the picker. */
export function recentLabels(exclude: string, limit = 4): string[] {
  const counts = new Map<string, number>()
  for (const r of Object.values(useWorkspace.getState().relations)) {
    if (r.status !== 'accepted') continue
    const l = r.label.trim()
    if (l && l !== exclude) counts.set(l, (counts.get(l) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([l]) => l)
}
