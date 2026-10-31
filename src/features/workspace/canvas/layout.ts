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
  // Book maps: chapters are regions with a notebook tab on top, packed in rows.
  tabH: 44,
  chapterPad: 28,
  chapterGapX: 140,
  chapterGapY: 150,
  chapterTop: 210,
  waitingW: 520,
  waitingH: 300,
} as const

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Region extends Box {
  /** The section (notes maps) or chapter (book maps) this region belongs to. */
  sectionId: string
  kind: 'section' | 'chapter'
  /** Chapters only: false while a chapter has no sections yet (waiting to be built). */
  built: boolean
}

export interface LayoutResult {
  boxes: Record<string, Box>
  regions: Region[]
  /** A section's whole column (section card + its blocks), for the zoomed-out section view. */
  columns: Record<string, Box>
  width: number
  height: number
  rootId: string | null
  book: boolean
  /** Book maps: the chapter each node belongs to. */
  chapterOf: Record<string, string>
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

/** Width of a chapter tab, estimated from its title (layout stays pure: no text measuring). */
export const tabWidth = (title: string, max: number): number =>
  Math.min(max, Math.max(220, 86 + title.length * 10))

export function computeLayout(
  nodes: NodeRow[],
  opts: { useSavedPositions?: boolean } = {},
): LayoutResult {
  const S = SIZES
  const kids = childrenIndex(nodes)
  const root = findRoot(nodes)
  const boxes: Record<string, Box> = {}
  const columns: Record<string, Box> = {}
  const hidden = new Set<string>()
  const regions: Region[] = []
  const chapterOf: Record<string, string> = {}
  const empty: LayoutResult = {
    boxes,
    regions,
    columns,
    width: 0,
    height: 0,
    rootId: null,
    book: false,
    chapterOf,
    hidden,
  }
  if (!root) return empty
  const book = root.level === 'book'

  const hideSubtree = (id: string) => {
    for (const c of kids.get(id) ?? []) {
      hidden.add(c.id)
      hideSubtree(c.id)
    }
  }
  if (root.collapsed) hideSubtree(root.id)

  // Column width grows with the deepest indentation in that section.
  const depthOf = (id: string): number => {
    const c = kids.get(id) ?? []
    return c.length ? 1 + Math.max(...c.map((k) => depthOf(k.id))) : 0
  }

  /** Lays sections out as columns from (x0, top); returns the used width and bottom. */
  const placeColumns = (parentId: string, x0: number, top: number) => {
    let x = x0
    let bottom = top + S.sectionH
    for (const section of kids.get(parentId) ?? []) {
      const depth = section.collapsed ? 0 : depthOf(section.id)
      const colW = Math.max(S.sectionW, S.blockW + S.indent * depth) + S.regionPad * 2
      const sx = x + S.regionPad
      boxes[section.id] = { x: sx, y: top, w: S.sectionW, h: S.sectionH }
      let y = top + S.sectionH + S.blocksGap
      const place = (pid: string, level: number) => {
        for (const child of kids.get(pid) ?? []) {
          boxes[child.id] = { x: sx + S.indent * level, y, w: S.blockW, h: S.blockH }
          y += S.blockH + S.rowGap
          if (child.collapsed) hideSubtree(child.id)
          else place(child.id, level + 1)
        }
      }
      if (section.collapsed) hideSubtree(section.id)
      else place(section.id, 1)
      const colBottom = Math.max(y - S.rowGap, top + S.sectionH)
      columns[section.id] = { x: sx, y: top, w: colW - S.regionPad * 2, h: colBottom - top }
      bottom = Math.max(bottom, colBottom)
      x += colW + S.colGap
    }
    return { width: Math.max(0, x - S.colGap - x0), bottom }
  }

  let width: number
  let contentBottom: number
  const chapters = book && !root.collapsed ? (kids.get(root.id) ?? []) : []

  if (!book) {
    const r = root.collapsed
      ? { width: 0, bottom: S.sectionTop }
      : placeColumns(root.id, 0, S.sectionTop)
    width = Math.max(r.width, S.rootW)
    contentBottom = r.bottom
  } else {
    // Lay out every chapter on its own, then pack them into rows.
    interface Packed {
      id: string
      w: number
      h: number
      built: boolean
      title: string
      shift: (dx: number, dy: number) => void
    }
    const packed: Packed[] = []
    for (const ch of chapters) {
      const sectionIds = new Set<string>()
      const collect = (id: string) => {
        for (const c of kids.get(id) ?? []) {
          chapterOf[c.id] = ch.id
          sectionIds.add(c.id)
          collect(c.id)
        }
      }
      collect(ch.id)
      chapterOf[ch.id] = ch.id
      const built = (kids.get(ch.id)?.length ?? 0) > 0
      let w = S.waitingW
      let h = S.waitingH
      if (built && !ch.collapsed) {
        const r = placeColumns(ch.id, 0, 0)
        w = r.width + S.chapterPad * 2
        h = r.bottom + S.chapterPad * 2
      } else if (ch.collapsed) hideSubtree(ch.id)
      const ids = [...sectionIds]
      packed.push({
        id: ch.id,
        w,
        h,
        built,
        title: ch.title,
        shift: (dx, dy) => {
          for (const id of ids) {
            const b = boxes[id]
            if (b) boxes[id] = { ...b, x: b.x + dx, y: b.y + dy }
            const c = columns[id]
            if (c) columns[id] = { ...c, x: c.x + dx, y: c.y + dy }
          }
        },
      })
    }
    const widths = packed.map((p) => p.w).sort((a, b) => a - b)
    const median = widths[Math.floor(widths.length / 2)] ?? S.waitingW
    const rowLimit = Math.max(widths.at(-1) ?? 0, median * 3 + S.chapterGapX * 2)
    let x = 0
    let rowTop = S.chapterTop
    let rowH = 0
    let maxRight = 0
    for (const p of packed) {
      if (x > 0 && x + p.w > rowLimit) {
        rowTop += rowH + S.chapterGapY
        x = 0
        rowH = 0
      }
      // Region below its tab; content inside the region's padding.
      const regionY = rowTop + S.tabH
      p.shift(x + S.chapterPad, regionY + S.chapterPad)
      boxes[p.id] = { x, y: rowTop, w: tabWidth(p.title, p.w), h: S.tabH }
      regions.push({
        sectionId: p.id,
        kind: 'chapter',
        built: p.built,
        x,
        y: regionY,
        w: p.w,
        h: p.h,
      })
      x += p.w + S.chapterGapX
      rowH = Math.max(rowH, p.h + S.tabH)
      maxRight = Math.max(maxRight, x - S.chapterGapX)
    }
    width = Math.max(maxRight, S.rootW)
    contentBottom = rowTop + rowH
  }

  boxes[root.id] = { x: width / 2 - S.rootW / 2, y: 0, w: S.rootW, h: S.rootH }

  // Anything not reachable from the root (should not happen, but never lose a node).
  let orphanY = contentBottom + 60
  for (const n of nodes) {
    if (!boxes[n.id] && !hidden.has(n.id)) {
      boxes[n.id] = { x: 0, y: orphanY, w: S.blockW, h: S.blockH }
      orphanY += S.blockH + S.rowGap
    }
  }

  if (opts.useSavedPositions !== false) {
    for (const n of nodes) {
      const b = boxes[n.id]
      // Chapter tabs and the book title stay where the book layout puts them.
      if (b && n.position && n.level !== 'chapter' && n.level !== 'book')
        boxes[n.id] = { ...b, x: n.position.x, y: n.position.y }
    }
  }

  const wrap = (ids: string[], pad: number) => {
    const bs = ids.map((i) => boxes[i]).filter((b): b is Box => Boolean(b))
    const minX = Math.min(...bs.map((b) => b.x)) - pad
    const minY = Math.min(...bs.map((b) => b.y)) - pad
    const maxX = Math.max(...bs.map((b) => b.x + b.w)) + pad
    const maxY = Math.max(...bs.map((b) => b.y + b.h)) + pad
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }
  const visibleSubtree = (id: string) => {
    const ids = [id]
    const stack = [...(kids.get(id) ?? [])]
    for (let cur = stack.pop(); cur; cur = stack.pop()) {
      if (hidden.has(cur.id)) continue
      ids.push(cur.id)
      stack.push(...(kids.get(cur.id) ?? []))
    }
    return ids
  }

  if (!book) {
    // Regions wrap each section and its visible descendants (after saved positions apply).
    for (const section of root.collapsed ? [] : (kids.get(root.id) ?? []))
      regions.push({
        sectionId: section.id,
        kind: 'section',
        built: true,
        ...wrap(visibleSubtree(section.id), S.regionPad),
      })
  } else {
    // Built chapters' regions follow blocks the student dragged (never shrink below the tab).
    for (const r of regions) {
      if (!r.built) continue
      const inner = visibleSubtree(r.sectionId).filter((id) => id !== r.sectionId)
      if (!inner.length) continue
      const w = wrap(inner, S.chapterPad)
      const tab = boxes[r.sectionId]
      Object.assign(r, { ...w, w: Math.max(w.w, tab?.w ?? 0) })
      if (tab) boxes[r.sectionId] = { ...tab, x: w.x, y: w.y - S.tabH }
    }
  }

  const all = Object.values(boxes)
  const regionRight = Math.max(0, ...regions.map((r) => r.x + r.w))
  const regionBottom = Math.max(0, ...regions.map((r) => r.y + r.h))
  return {
    boxes,
    regions,
    columns,
    width: Math.max(width, regionRight, ...all.map((b) => b.x + b.w)),
    height: Math.max(regionBottom, ...all.map((b) => b.y + b.h)),
    rootId: root.id,
    book,
    chapterOf,
    hidden,
  }
}

/** Mirrors a logical box for right-to-left display around the layout width. */
export const mirrorBox = (b: Box, width: number): Box => ({ ...b, x: width - b.x - b.w })
