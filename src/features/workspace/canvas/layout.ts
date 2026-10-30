import type { NodeRow } from '@/lib/database.types'

/**
 * Top-down map layout (docs/design-system.md): the map title on top, top-level sections as
 * columns below it, and each section's blocks stacked under it, indented by depth.
 * Pure and deterministic, so "Tidy up" always gives the same picture.
 * Positions are logical (left-to-right); the canvas mirrors them for Arabic UI.
 */
export const SIZES = {
  rootW: 200,
  rootH: 64,
  sectionW: 190,
  sectionH: 58,
  blockW: 210,
  blockH: 66,
  indent: 32,
  rowGap: 14,
  colGap: 28,
  regionPad: 18,
  sectionTop: 128,
  blocksGap: 30,
} as const

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Region extends Box {
  sectionId: string
}

export interface LayoutResult {
  boxes: Record<string, Box>
  regions: Region[]
  width: number
  height: number
  rootId: string | null
  /** Nodes hidden because an ancestor is collapsed. */
  hidden: Set<string>
}

export function childrenIndex(nodes: NodeRow[]): Map<string | null, NodeRow[]> {
  const map = new Map<string | null, NodeRow[]>()
  for (const n of nodes) {
    const list = map.get(n.parent_id) ?? []
    list.push(n)
    map.set(n.parent_id, list)
  }
  for (const list of map.values())
    list.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  return map
}

export function findRoot(nodes: NodeRow[]): NodeRow | undefined {
  const roots = nodes.filter((n) => n.parent_id === null)
  return roots.find((n) => n.level === 'chapter' || n.level === 'book') ?? roots[0]
}

export function computeLayout(
  nodes: NodeRow[],
  opts: { useSavedPositions?: boolean } = {},
): LayoutResult {
  const S = SIZES
  const kids = childrenIndex(nodes)
  const root = findRoot(nodes)
  const boxes: Record<string, Box> = {}
  const hidden = new Set<string>()
  const regions: Region[] = []
  if (!root) return { boxes, regions, width: 0, height: 0, rootId: null, hidden }

  const hideSubtree = (id: string) => {
    for (const c of kids.get(id) ?? []) {
      hidden.add(c.id)
      hideSubtree(c.id)
    }
  }

  const sections = kids.get(root.id) ?? []
  if (root.collapsed) hideSubtree(root.id)

  // Column width grows with the deepest indentation in that section.
  const depthOf = (id: string): number => {
    const c = kids.get(id) ?? []
    return c.length ? 1 + Math.max(...c.map((k) => depthOf(k.id))) : 0
  }

  let x = 0
  let maxBottom = S.sectionTop + S.sectionH
  for (const section of root.collapsed ? [] : sections) {
    const depth = section.collapsed ? 0 : depthOf(section.id)
    const colW = Math.max(S.sectionW, S.blockW + S.indent * depth) + S.regionPad * 2
    const sx = x + S.regionPad
    boxes[section.id] = { x: sx, y: S.sectionTop, w: S.sectionW, h: S.sectionH }

    let y = S.sectionTop + S.sectionH + S.blocksGap
    const place = (parentId: string, level: number) => {
      for (const child of kids.get(parentId) ?? []) {
        boxes[child.id] = { x: sx + S.indent * level, y, w: S.blockW, h: S.blockH }
        y += S.blockH + S.rowGap
        if (child.collapsed) hideSubtree(child.id)
        else place(child.id, level + 1)
      }
    }
    if (section.collapsed) hideSubtree(section.id)
    else place(section.id, 1)

    const bottom = Math.max(y - S.rowGap, S.sectionTop + S.sectionH)
    maxBottom = Math.max(maxBottom, bottom)
    x += colW + S.colGap
  }

  const width = Math.max(x - S.colGap, S.rootW)
  boxes[root.id] = { x: width / 2 - S.rootW / 2, y: 0, w: S.rootW, h: S.rootH }

  // Anything not reachable from the root (should not happen, but never lose a node).
  let orphanY = maxBottom + 60
  for (const n of nodes) {
    if (!boxes[n.id] && !hidden.has(n.id)) {
      boxes[n.id] = { x: 0, y: orphanY, w: S.blockW, h: S.blockH }
      orphanY += S.blockH + S.rowGap
    }
  }

  if (opts.useSavedPositions !== false) {
    for (const n of nodes) {
      const b = boxes[n.id]
      if (b && n.position) boxes[n.id] = { ...b, x: n.position.x, y: n.position.y }
    }
  }

  // Regions wrap each section and its visible descendants (after saved positions apply).
  for (const section of root.collapsed ? [] : sections) {
    const ids = [section.id]
    const stack = [...(kids.get(section.id) ?? [])]
    for (let cur = stack.pop(); cur; cur = stack.pop()) {
      if (hidden.has(cur.id)) continue
      ids.push(cur.id)
      stack.push(...(kids.get(cur.id) ?? []))
    }
    const bs = ids.map((i) => boxes[i]).filter((b): b is Box => Boolean(b))
    const minX = Math.min(...bs.map((b) => b.x)) - S.regionPad
    const minY = Math.min(...bs.map((b) => b.y)) - S.regionPad
    const maxX = Math.max(...bs.map((b) => b.x + b.w)) + S.regionPad
    const maxY = Math.max(...bs.map((b) => b.y + b.h)) + S.regionPad
    regions.push({ sectionId: section.id, x: minX, y: minY, w: maxX - minX, h: maxY - minY })
  }

  const all = Object.values(boxes)
  return {
    boxes,
    regions,
    width: Math.max(width, ...all.map((b) => b.x + b.w)),
    height: Math.max(...all.map((b) => b.y + b.h)),
    rootId: root.id,
    hidden,
  }
}

/** Mirrors a logical box for right-to-left display around the layout width. */
export const mirrorBox = (b: Box, width: number): Box => ({ ...b, x: width - b.x - b.w })
