import type { DetailBlock, NodeRow } from '@/lib/database.types'

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
  blockW: 240,
  blockH: 66,
  indent: 32,
  /** Top-level blocks in grouped columns sit this far in, right of their rail line. */
  groupIndent: 22,
  subColGap: 26,
  /** A section's blocks spread into more columns past about this height each. */
  columnTarget: 480,
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

/** Lines a text needs at about `perLine` characters a line (words wrap, so a little slack). */
function linesFor(text: string, perLine: number, max: number): number {
  const n = text.trim().length
  return n ? Math.min(max, Math.ceil(n / (perLine * 0.88))) : 0
}

/** What a block card shows (title, summary, first formula, badges) and its height. */
export interface BlockCardShape {
  titleLines: number
  summaryLines: number
  formula: string | null
  badges: boolean
  h: number
}

/**
 * The card a block gets on the canvas. The height follows the content, so the summary is
 * always visible and a formula shows itself instead of only its name. Estimated from text
 * length (deterministic, no measuring): the card clamps its text to these line counts.
 */
export function blockCard(
  n: Pick<NodeRow, 'title' | 'summary' | 'details' | 'importance' | 'ai_added'>,
): BlockCardShape {
  const titleLines = Math.max(1, linesFor(n.title, 22, 2))
  // Short cards: the summary shows at most two lines (the rest is in the side panel).
  const summaryLines = linesFor(n.summary, 36, 2)
  const f = n.details.find((d) => d.kind === 'formula')
  const formula = f && f.kind === 'formula' && f.latex.trim() ? f.latex : null
  const badges = n.importance !== 'supporting' || n.ai_added
  const h =
    10 +
    4 + // padding, border
    Math.max(28, titleLines * 18) +
    (summaryLines ? 6 + summaryLines * 16 : 0) +
    (formula ? 8 + 52 : 0) +
    (badges ? 8 + 18 : 0) +
    10
  return { titleLines, summaryLines, formula, badges, h: Math.max(SIZES.blockH, h) }
}

/** Estimated height of one detail in a card's list (canvas/DetailList.tsx, compact). */
export function detailHeight(d: DetailBlock): number {
  const lines = (s: string | undefined, per = 33) => linesFor(s ?? '', per, 40)
  switch (d.kind) {
    case 'bullet':
    case 'text':
    case 'cloze':
      return lines(d.text) * 17
    case 'formula':
      return 16 + 58 + lines(d.variables, 36) * 16
    case 'example':
      return 8 + (lines(d.text, 30) + lines(d.translation, 30)) * 17
    case 'vocab':
      return lines(`${d.term} — ${d.meaning}`) * 17
    case 'question':
      return 12 + (lines(d.front, 30) + 1) * 17
  }
}

/** Expanded cards stop growing here; longer details scroll inside the card. */
export const EXPANDED_MAX_H = 560

/**
 * The selected block opens in place (canvas step 2): full title and summary, every detail,
 * and a row with Open / Edit. Height follows the content up to EXPANDED_MAX_H.
 */
export function expandedCard(
  n: Pick<NodeRow, 'title' | 'summary' | 'details' | 'importance' | 'ai_added'>,
): { titleLines: number; summaryLines: number; h: number } {
  const titleLines = Math.max(1, linesFor(n.title, 22, 3))
  const summaryLines = linesFor(n.summary, 36, 8)
  const details = n.details.reduce((sum, d) => sum + detailHeight(d) + 6, 0)
  const badges = n.importance !== 'supporting' || n.ai_added
  const h =
    10 +
    4 + // padding, border
    Math.max(28, titleLines * 18) +
    (summaryLines ? 6 + summaryLines * 16 : 0) +
    (details ? 10 + details : 0) +
    (badges ? 8 + 18 : 0) +
    8 +
    32 + // Open / Edit
    10
  return { titleLines, summaryLines, h: Math.min(EXPANDED_MAX_H, Math.max(SIZES.blockH, h)) }
}

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
  /** Top-level blocks in grouped columns: joined to their section by a rail (RailEdge). */
  railed: Set<string>
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
  opts: { useSavedPositions?: boolean; expandedId?: string | null } = {},
): LayoutResult {
  const S = SIZES
  const kids = childrenIndex(nodes)
  const root = findRoot(nodes)
  const boxes: Record<string, Box> = {}
  const columns: Record<string, Box> = {}
  const hidden = new Set<string>()
  const railed = new Set<string>()
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
    railed,
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

  /** Heights used to decide columns: the closed card, so opening a card never reshuffles. */
  const stableH = (n: NodeRow) => blockCard(n).h
  const realH = (n: NodeRow) => (n.id === opts.expandedId ? expandedCard(n).h : blockCard(n).h)
  /** A block and its visible sub-blocks, with their depth under it. */
  const subtreeOf = (n: NodeRow, depth = 0): Array<[NodeRow, number]> => {
    const out: Array<[NodeRow, number]> = [[n, depth]]
    if (n.collapsed) hideSubtree(n.id)
    else for (const c of kids.get(n.id) ?? []) out.push(...subtreeOf(c, depth + 1))
    return out
  }

  /**
   * Lays sections out side by side from (x0, top); returns the used width and bottom.
   * Inside a section (canvas step 3, "grouped columns"): each top-level block with its
   * sub-blocks is a group; groups are spread over up to 4 columns under the section card,
   * which sits centred above them and joins them with a rail (RailEdge). Process and timeline
   * sections stay one column, because their order matters.
   */
  const placeColumns = (parentId: string, x0: number, top: number) => {
    let x = x0
    let bottom = top + S.sectionH
    for (const section of kids.get(parentId) ?? []) {
      const sx = x + S.regionPad
      const blocksTop = top + S.sectionH + S.blocksGap
      if (section.collapsed) hideSubtree(section.id)
      const groups = (section.collapsed ? [] : (kids.get(section.id) ?? [])).map((g) => {
        const items = subtreeOf(g)
        return {
          items,
          h: items.reduce((s, [n]) => s + stableH(n) + S.rowGap, 0),
          depth: Math.max(...items.map(([, d]) => d)),
        }
      })
      const ordered = section.branch_view === 'process' || section.branch_view === 'timeline'
      const total = groups.reduce((s, g) => s + g.h, 0)
      const nested = groups.filter((g) => g.items.length > 1).length
      const want = ordered
        ? 1
        : Math.min(
            4,
            groups.length,
            Math.max(1, nested >= 2 ? nested : Math.ceil(total / S.columnTarget)),
          )
      const cols = balancedColumns(groups, want)
      const grouped = !ordered
      const lead = grouped ? S.groupIndent : S.indent
      const widths = cols.map(
        (col) => S.blockW + lead + S.indent * Math.max(0, ...col.map((g) => g.depth)),
      )
      const contentW = Math.max(
        S.sectionW,
        widths.reduce((s, w) => s + w, 0) + S.subColGap * (widths.length - 1),
      )
      // One column: the section card stays at the top left, over its tree line.
      const cardX = grouped && cols.length > 1 ? sx + (contentW - S.sectionW) / 2 : sx
      boxes[section.id] = { x: cardX, y: top, w: S.sectionW, h: S.sectionH }
      let colBottom = top + S.sectionH
      let cx = sx
      cols.forEach((col, i) => {
        let y = blocksTop
        for (const g of col)
          for (const [n, depth] of g.items) {
            const h = realH(n)
            boxes[n.id] = { x: cx + lead + S.indent * depth, y, w: S.blockW, h }
            if (grouped && depth === 0) railed.add(n.id)
            y += h + S.rowGap
          }
        colBottom = Math.max(colBottom, y - S.rowGap)
        cx += (widths[i] ?? 0) + S.subColGap
      })
      columns[section.id] = { x: sx, y: top, w: contentW, h: colBottom - top }
      bottom = Math.max(bottom, colBottom)
      x += contentW + S.regionPad * 2 + S.colGap
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
      const h = blockCard(n).h
      boxes[n.id] = { x: 0, y: orphanY, w: S.blockW, h }
      orphanY += h + S.rowGap
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
    railed,
  }
}

/**
 * Splits groups (kept in reading order) into at most `k` columns so the tallest column is as
 * short as possible (classic linear partition; a section has few groups, so this is instant).
 */
export function balancedColumns<T extends { h: number }>(groups: T[], k: number): T[][] {
  const n = groups.length
  if (n === 0) return [[]]
  const cols = Math.max(1, Math.min(k, n))
  const prefix = [0]
  for (const g of groups) prefix.push((prefix.at(-1) ?? 0) + g.h)
  const sum = (a: number, b: number) => (prefix[b] ?? 0) - (prefix[a] ?? 0)
  // best[j][i]: smallest tallest column for the first i groups in j columns; cut[j][i]: where.
  const best = Array.from({ length: cols + 1 }, () => new Array<number>(n + 1).fill(Infinity))
  const cut = Array.from({ length: cols + 1 }, () => new Array<number>(n + 1).fill(0))
  ;(best[0] as number[])[0] = 0
  for (let j = 1; j <= cols; j++)
    for (let i = 1; i <= n; i++)
      for (let p = j - 1; p < i; p++) {
        const v = Math.max((best[j - 1] as number[])[p] ?? Infinity, sum(p, i))
        if (v < ((best[j] as number[])[i] ?? Infinity)) {
          ;(best[j] as number[])[i] = v
          ;(cut[j] as number[])[i] = p
        }
      }
  const out: T[][] = []
  let i = n
  for (let j = cols; j >= 1; j--) {
    const p = (cut[j] as number[])[i] ?? 0
    out.unshift(groups.slice(p, i))
    i = p
  }
  return out.filter((c) => c.length)
}

/** Mirrors a logical box for right-to-left display around the layout width. */
export const mirrorBox = (b: Box, width: number): Box => ({ ...b, x: width - b.x - b.w })

/**
 * Reading order (owner, 2026-11-03: "numbered reading order"): sections 1, 2, 3 (in a book,
 * within their chapter), their blocks 1.1, 1.2, sub-blocks 1.2.1, in the order the map shows
 * them. Folded or hidden blocks keep their number.
 */
export function readingNumbers(nodes: NodeRow[]): Record<string, string> {
  const kids = childrenIndex(nodes)
  const root = findRoot(nodes)
  const out: Record<string, string> = {}
  if (!root) return out
  const walk = (id: string, prefix: string) => {
    ;(kids.get(id) ?? []).forEach((c, i) => {
      const n = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
      out[c.id] = n
      walk(c.id, n)
    })
  }
  if (root.level === 'book') for (const chapter of kids.get(root.id) ?? []) walk(chapter.id, '')
  else walk(root.id, '')
  return out
}
