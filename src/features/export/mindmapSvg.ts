import React from 'react'
import { FONT_ARABIC, FONT_LATIN, FONT_MONO } from './studypdf/tokens'
import { CHAPTER_FILL, COLORS } from './studypdf/tokens'
import type { ChapterColor, NodeRow, NodeType, RelationRow } from '@/lib/database.types'

export const MIN_MAP_FONT_PT = 7

const BASE_TITLE_FONT_PX = 13.5
const BASE_TITLE_LINE_PX = 17
const NODE_PAD_X = 12
const NODE_PAD_Y = 8
const ICON_SIZE = 20
const DOT_RESERVE = 14
const COL_GAP = 54
const ROW_GAP = 14
const SECTION_GAP = 22
const PAD_OUTER = 18

export interface SvgNodeBox {
  id: string
  title: string
  lines: string[]
  level: NodeRow['level']
  type: NodeType | null
  importance: NodeRow['importance']
  color: ChapterColor
  dir: 'ltr' | 'rtl'
  col: number
  x: number
  y: number
  w: number
  h: number
}

export interface SvgTreeEdge {
  id: string
  d: string
  color: ChapterColor
}

export interface SvgRelationEdge {
  id: string
  d: string
  label: string
  labelX: number
  labelY: number
  labelW: number
  labelH: number
  bidirectional: boolean
}

export interface VectorMapModel {
  viewBoxW: number
  viewBoxH: number
  nodes: SvgNodeBox[]
  treeEdges: SvgTreeEdge[]
  relationEdges: SvgRelationEdge[]
  minRenderedFontPt: number
  light: boolean
}

export interface VectorMapPageData {
  id: string
  caption: string
  subtitle: string
  model: VectorMapModel
  /** Used in legend & tests */
  nodeCount: number
  relationCount: number
  isOverview: boolean
}

function resolveColorMap(nodes: Record<string, NodeRow>): Map<string, ChapterColor> {
  const palette: ChapterColor[] = ['yellow', 'coral', 'sky', 'mint', 'lavender', 'pink', 'orange', 'lime']
  const out = new Map<string, ChapterColor>()

  const roots = Object.values(nodes).filter((n) => !n.parent_id || !nodes[n.parent_id])
  let secIdx = 0
  const assign = (id: string, inherited: ChapterColor) => {
    const n = nodes[id]
    if (!n) return
    const own = n.color ?? inherited
    out.set(id, own)
    const kids = Object.values(nodes)
      .filter((k) => k.parent_id === id)
      .sort((a, b) => a.sort_order - b.sort_order)
    for (const k of kids) {
      let nextColor = own
      if ((k.level === 'chapter' || k.level === 'section') && !k.color) {
        nextColor = palette[secIdx % palette.length] ?? own
        secIdx++
      }
      assign(k.id, k.color ?? nextColor)
    }
  }
  for (const r of roots) {
    assign(r.id, r.color ?? 'mint')
  }
  return out
}

function isRtlText(s: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(s)
}

/**
 * Wraps title into balanced lines (preferred max 2 lines, widening first if needed,
 * never truncating with '...' so full node titles remain legible).
 */
export function wrapMapNodeTitle(title: string, maxCharsPerLine = 26): { lines: string[]; charsWide: number } {
  const clean = title.replace(/\s+/g, ' ').trim() || '—'
  if (clean.length <= maxCharsPerLine) {
    return { lines: [clean], charsWide: clean.length }
  }

  const tryWrap = (limit: number): string[] => {
    const words = clean.split(' ')
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      if (!cur) {
        cur = w
      } else if (cur.length + 1 + w.length <= limit) {
        cur += ` ${w}`
      } else {
        lines.push(cur)
        cur = w
      }
    }
    if (cur) lines.push(cur)
    return lines
  }

  // First try target width; if > 2 lines, widen gradually up to 36 chars to stay within 2 lines cleanly
  for (let limit = maxCharsPerLine; limit <= 36; limit += 4) {
    const lines = tryWrap(limit)
    if (lines.length <= 2) {
      return { lines, charsWide: Math.max(...lines.map((l) => l.length)) }
    }
  }

  // Long title fallback: keep every word with 3 lines at 34 chars wide (never truncate with '...')
  const lines = tryWrap(34)
  return { lines, charsWide: Math.max(...lines.map((l) => l.length)) }
}

function estimateTextWidthPx(text: string, fontSize: number): number {
  let units = 0
  for (const ch of text) {
    if (ch === ' ') units += 0.34
    else if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(ch)) units += 0.64
    else if (/[WM@#%&]/.test(ch)) units += 0.78
    else if (/[ijlI1!.,:;'|]/.test(ch)) units += 0.34
    else units += 0.56
  }
  return units * fontSize
}

interface TreeSubItem {
  node: NodeRow
  children: TreeSubItem[]
  boxW: number
  boxH: number
  lines: string[]
  subtreeH: number
  x: number
  y: number
  col: number
  color: ChapterColor
}

function buildSubtree(
  nodeId: string,
  col: number,
  nodes: Record<string, NodeRow>,
  childrenMap: Map<string, NodeRow[]>,
  colorMap: Map<string, ChapterColor>,
  includeIds: Set<string>,
  maxDepth: number,
): TreeSubItem | null {
  const node = nodes[nodeId]
  if (!node || !includeIds.has(nodeId)) return null

  const maxChars = node.level === 'book' || col === 0 ? 28 : node.level === 'section' ? 26 : 24
  const wrapped = wrapMapNodeTitle(node.title, maxChars)
  const textW = Math.max(...wrapped.lines.map((l) => estimateTextWidthPx(l, BASE_TITLE_FONT_PX)), 64)
  const extraLeft = node.type ? ICON_SIZE + 8 : 0
  const extraRight = node.importance === 'core' || node.importance === 'extra' ? DOT_RESERVE : 4
  const boxW = Math.ceil(NODE_PAD_X * 2 + extraLeft + textW + extraRight)
  const boxH = Math.ceil(NODE_PAD_Y * 2 + Math.max(ICON_SIZE, wrapped.lines.length * BASE_TITLE_LINE_PX))

  const kids: TreeSubItem[] = []
  if (col < maxDepth) {
    const rawKids = childrenMap.get(nodeId) ?? []
    for (const k of rawKids) {
      const sub = buildSubtree(k.id, col + 1, nodes, childrenMap, colorMap, includeIds, maxDepth)
      if (sub) kids.push(sub)
    }
  }

  let subtreeH = boxH
  if (kids.length > 0) {
    const gap = col === 0 ? SECTION_GAP : ROW_GAP
    const sumKids = kids.reduce((acc, k) => acc + k.subtreeH, 0) + gap * (kids.length - 1)
    subtreeH = Math.max(boxH, sumKids)
  }

  return {
    node,
    children: kids,
    boxW,
    boxH,
    lines: wrapped.lines,
    subtreeH,
    x: 0,
    y: 0,
    col,
    color: colorMap.get(nodeId) ?? 'mint',
  }
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad = 4,
): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  )
}

function cubicPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  const uuu = uu * u
  const ttt = tt * t
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  }
}

function layoutTreeToVectorModel(
  rootId: string,
  nodes: Record<string, NodeRow>,
  childrenMap: Map<string, NodeRow[]>,
  colorMap: Map<string, ChapterColor>,
  relations: RelationRow[],
  includeIds: Set<string>,
  maxDepth: number,
  slotSizePx: { w: number; h: number },
  opts: { light: boolean; links: boolean; labelResolver: (r: RelationRow) => string },
): VectorMapModel {
  const tree = buildSubtree(rootId, 0, nodes, childrenMap, colorMap, includeIds, maxDepth)
  if (!tree) {
    return {
      viewBoxW: slotSizePx.w,
      viewBoxH: slotSizePx.h,
      nodes: [],
      treeEdges: [],
      relationEdges: [],
      minRenderedFontPt: 10,
      light: opts.light,
    }
  }

  // Compute max width per column for clean LR column alignment & gutters
  const colMaxW = new Map<number, number>()
  const collectColW = (item: TreeSubItem) => {
    colMaxW.set(item.col, Math.max(colMaxW.get(item.col) ?? 0, item.boxW))
    for (const k of item.children) collectColW(k)
  }
  collectColW(tree)

  const colX = new Map<number, number>()
  let cursorX = PAD_OUTER
  const maxCol = Math.max(...Array.from(colMaxW.keys()), 0)
  for (let c = 0; c <= maxCol; c++) {
    colX.set(c, cursorX)
    cursorX += (colMaxW.get(c) ?? 120) + COL_GAP
  }
  const contentRight = cursorX - COL_GAP + PAD_OUTER

  // Assign X & Y top-down cleanly centering parents across their children band
  const flatNodes: SvgNodeBox[] = []
  const nodeById = new Map<string, SvgNodeBox>()
  const treeEdges: SvgTreeEdge[] = []

  const place = (item: TreeSubItem, bandTopY: number) => {
    item.x = colX.get(item.col) ?? PAD_OUTER
    item.y = bandTopY + (item.subtreeH - item.boxH) / 2

    const box: SvgNodeBox = {
      id: item.node.id,
      title: item.node.title,
      lines: item.lines,
      level: item.node.level,
      type: item.node.type,
      importance: item.node.importance,
      color: item.color,
      dir: isRtlText(item.node.title) ? 'rtl' : item.node.dir || 'ltr',
      col: item.col,
      x: item.x,
      y: item.y,
      w: item.boxW,
      h: item.boxH,
    }
    flatNodes.push(box)
    nodeById.set(box.id, box)

    if (item.children.length > 0) {
      const gap = item.col === 0 ? SECTION_GAP : ROW_GAP
      const sumKids = item.children.reduce((acc, k) => acc + k.subtreeH, 0) + gap * (item.children.length - 1)
      let childTop = bandTopY + Math.max(0, (item.subtreeH - sumKids) / 2)
      for (const k of item.children) {
        place(k, childTop)
        const px = item.x + item.boxW
        const py = item.y + item.boxH / 2
        const cx = k.x
        const cy = k.y + k.boxH / 2
        const mx = px + (cx - px) * 0.52
        treeEdges.push({
          id: `${item.node.id}->${k.node.id}`,
          d: `M ${px} ${py} C ${mx} ${py}, ${mx} ${cy}, ${cx} ${cy}`,
          color: k.color,
        })
        childTop += k.subtreeH + gap
      }
    }
  }
  place(tree, PAD_OUTER)

  let maxY = Math.max(...flatNodes.map((n) => n.y + n.h), 100) + PAD_OUTER
  let maxX = Math.max(contentRight, 200)

  // Relation curves routed through column gutters with pill collision solver
  const relationEdges: SvgRelationEdge[] = []
  const placedPills: Array<{ x: number; y: number; w: number; h: number }> = []

  if (opts.links) {
    const visibleRels = relations.filter(
      (r) => r.status !== 'suggested' && nodeById.has(r.from_node) && nodeById.has(r.to_node),
    )

    visibleRels.forEach((rel, idx) => {
      const src = nodeById.get(rel.from_node)
      const dst = nodeById.get(rel.to_node)
      if (!src || !dst) return
      const label = opts.labelResolver(rel).trim()

      // Route through gutter or outer arc if same column
      const sameCol = src.col === dst.col
      const laneOffset = ((idx % 4) - 1.5) * 14
      let p0: { x: number; y: number }
      let p1: { x: number; y: number }
      let p2: { x: number; y: number }
      let p3: { x: number; y: number }

      if (sameCol) {
        // Right-side or bottom gutter arc
        const srcRight = src.x + src.w
        const dstRight = dst.x + dst.w
        const gutterX = Math.max(srcRight, dstRight) + 26 + (idx % 3) * 12
        p0 = { x: srcRight, y: src.y + src.h / 2 }
        p3 = { x: dstRight, y: dst.y + dst.h / 2 }
        p1 = { x: gutterX, y: p0.y }
        p2 = { x: gutterX, y: p3.y }
        maxX = Math.max(maxX, gutterX + 70)
      } else {
        const goRight = src.x < dst.x
        const sx = goRight ? src.x + src.w : src.x
        const sy = src.y + src.h * 0.65
        const dx = goRight ? dst.x : dst.x + dst.w
        const dy = dst.y + dst.h * 0.35
        const midX = (sx + dx) / 2
        const curveBend = (Math.abs(sy - dy) < 20 ? 34 : 18) * (idx % 2 === 0 ? 1 : -1) + laneOffset
        p0 = { x: sx, y: sy }
        p3 = { x: dx, y: dy }
        p1 = { x: midX, y: sy + curveBend }
        p2 = { x: midX, y: dy + curveBend }
        maxY = Math.max(maxY, Math.max(p1.y, p2.y) + 28)
      }

      const d = `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} C ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}, ${p3.x.toFixed(1)} ${p3.y.toFixed(1)}`

      const pillH = 20
      const pillText = label || 'related'
      const pillW = Math.max(44, Math.ceil(pillText.length * 6.5 + 20))

      // Collision-free candidate search along curve and perpendicular offsets
      const tCandidates = [0.5, 0.38, 0.62, 0.28, 0.72]
      const dyCandidates = [0, -14, 14, -28, 28, -42, 42]
      let bestX = (p0.x + p3.x) / 2 - pillW / 2
      let bestY = (p0.y + p3.y) / 2 - pillH / 2
      let foundClean = false

      for (const dyOff of dyCandidates) {
        for (const t of tCandidates) {
          const pt = cubicPoint(p0, p1, p2, p3, t)
          const cand = { x: pt.x - pillW / 2, y: pt.y + dyOff - pillH / 2, w: pillW, h: pillH }
          const hitsNode = flatNodes.some((n) => rectsOverlap(cand, n, 4))
          const hitsPill = placedPills.some((p) => rectsOverlap(cand, p, 3))
          if (!hitsNode && !hitsPill) {
            bestX = cand.x
            bestY = cand.y
            foundClean = true
            break
          }
        }
        if (foundClean) break
      }

      placedPills.push({ x: bestX, y: bestY, w: pillW, h: pillH })
      maxX = Math.max(maxX, bestX + pillW + 12)
      maxY = Math.max(maxY, bestY + pillH + 12)

      relationEdges.push({
        id: rel.id,
        d,
        label,
        labelX: bestX,
        labelY: bestY,
        labelW: pillW,
        labelH: pillH,
        bidirectional: rel.direction === 'both',
      })
    })
  }

  const scale = Math.min(slotSizePx.w / maxX, slotSizePx.h / maxY)
  const renderedFontPx = BASE_TITLE_FONT_PX * scale
  const minRenderedFontPt = (renderedFontPx * 72) / 96

  return {
    viewBoxW: Math.ceil(maxX),
    viewBoxH: Math.ceil(maxY),
    nodes: flatNodes,
    treeEdges,
    relationEdges,
    minRenderedFontPt,
    light: opts.light,
  }
}

export function buildVectorMindMapPages(input: {
  nodes: Record<string, NodeRow>
  relations: Record<string, RelationRow>
  rootId: string
  scopeNodeId?: string
  title: string
  slotSizePx: { w: number; h: number }
  light: boolean
  links: boolean
  relationLabel: (r: RelationRow) => string
}): VectorMapPageData[] {
  const { nodes, relations, rootId, scopeNodeId, title, slotSizePx, light, links, relationLabel } = input
  const activeRootId = scopeNodeId && nodes[scopeNodeId] ? scopeNodeId : rootId
  const rootNode = nodes[activeRootId]
  if (!rootNode) return []

  const childrenMap = new Map<string, NodeRow[]>()
  for (const n of Object.values(nodes)) {
    if (n.parent_id && nodes[n.parent_id]) {
      const list = childrenMap.get(n.parent_id) ?? []
      list.push(n)
      childrenMap.set(n.parent_id, list)
    }
  }
  for (const list of childrenMap.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order)
  }

  // Collapse a single redundant chapter under root when its title duplicates the root/map title
  const rawTop = childrenMap.get(activeRootId) ?? []
  if (rawTop.length === 1 && rawTop[0]?.level === 'chapter') {
    const redundantChapter = rawTop[0]
    const normRoot = rootNode.title.trim().toLowerCase()
    const normDoc = title.trim().toLowerCase()
    const normCh = redundantChapter.title.trim().toLowerCase()
    if (normCh === normRoot || normCh === normDoc) {
      const chKids = childrenMap.get(redundantChapter.id) ?? []
      if (chKids.length > 0) {
        childrenMap.set(activeRootId, chKids)
      }
    }
  }

  const colorMap = resolveColorMap(nodes)
  const relList = Object.values(relations)
  const allIds = new Set(Object.keys(nodes))

  // 1. Try single horizontal LR landscape page containing full tree
  const fullModel = layoutTreeToVectorModel(
    activeRootId,
    nodes,
    childrenMap,
    colorMap,
    relList,
    allIds,
    6,
    slotSizePx,
    { light, links, labelResolver: relationLabel },
  )

  if (fullModel.minRenderedFontPt >= MIN_MAP_FONT_PT || (childrenMap.get(activeRootId)?.length ?? 0) <= 1) {
    return [
      {
        id: `map-${activeRootId}`,
        caption: title,
        subtitle: rootNode.title,
        model: fullModel,
        nodeCount: fullModel.nodes.length,
        relationCount: fullModel.relationEdges.length,
        isOverview: false,
      },
    ]
  }

  // 2. Tree is too dense for >= 7pt on one page -> emit Overview (Root + level 1/2 branches) + chunked detail pages (2-3 sections each)
  const pages: VectorMapPageData[] = []
  const topBranches = childrenMap.get(activeRootId) ?? []

  // Collect section-level nodes cleanly (handle book->chapter->section as well as root->section)
  const sectionNodes: NodeRow[] = []
  for (const b of topBranches) {
    if (b.level === 'chapter') {
      const chKids = childrenMap.get(b.id) ?? []
      if (chKids.length > 0) sectionNodes.push(...chKids)
      else sectionNodes.push(b)
    } else {
      sectionNodes.push(b)
    }
  }

  // Overview page: Root + top branches (maxDepth = 1 or 2 for chapters->sections)
  const overviewIds = new Set<string>([activeRootId])
  for (const b of topBranches) {
    overviewIds.add(b.id)
    if (b.level === 'chapter') {
      for (const s of childrenMap.get(b.id) ?? []) overviewIds.add(s.id)
    }
  }
  const overviewModel = layoutTreeToVectorModel(
    activeRootId,
    nodes,
    childrenMap,
    colorMap,
    relList,
    overviewIds,
    2,
    slotSizePx,
    { light, links, labelResolver: relationLabel },
  )

  pages.push({
    id: `map-overview-${activeRootId}`,
    caption: `${title} · Overview`,
    subtitle: `${sectionNodes.length} Sections`,
    model: overviewModel,
    nodeCount: overviewModel.nodes.length,
    relationCount: overviewModel.relationEdges.length,
    isOverview: true,
  })

  // Group 2-3 sections per continuation landscape page; shrink chunk if still below MIN_MAP_FONT_PX
  let cursor = 0
  let partIdx = 1
  const collectSubtreeIds = (id: string, target: Set<string>) => {
    target.add(id)
    for (const k of childrenMap.get(id) ?? []) collectSubtreeIds(k.id, target)
  }

  while (cursor < sectionNodes.length) {
    let take = Math.min(3, sectionNodes.length - cursor)
    let chosenModel: VectorMapModel | null = null

    while (take >= 1) {
      const chunk = sectionNodes.slice(cursor, cursor + take)
      const chunkIds = new Set<string>([activeRootId])
      for (const sec of chunk) {
        if (sec.parent_id && sec.parent_id !== activeRootId) chunkIds.add(sec.parent_id)
        collectSubtreeIds(sec.id, chunkIds)
      }
      const candidate = layoutTreeToVectorModel(
        activeRootId,
        nodes,
        childrenMap,
        colorMap,
        relList,
        chunkIds,
        6,
        slotSizePx,
        { light, links, labelResolver: relationLabel },
      )
      chosenModel = candidate
      if (candidate.minRenderedFontPt >= MIN_MAP_FONT_PT || take === 1) {
        break
      }
      take--
    }

    const chunk = sectionNodes.slice(cursor, cursor + Math.max(1, take))
    if (chosenModel) {
      pages.push({
        id: `map-part-${partIdx}`,
        caption: `${title} · Part ${partIdx}`,
        subtitle: chunk.map((s) => s.title).join(' · '),
        model: chosenModel,
        nodeCount: chosenModel.nodes.length,
        relationCount: chosenModel.relationEdges.length,
        isOverview: false,
      })
    }
    cursor += Math.max(1, take)
    partIdx++
  }

  return pages
}

function renderTypeIconGlyph(type: NodeType, cx: number, cy: number): React.ReactNode {
  const stroke = COLORS.ink
  switch (type) {
    case 'formula':
      return React.createElement(
        'text',
        {
          x: cx,
          y: cy + 4,
          textAnchor: 'middle',
          fontSize: 11,
          fontWeight: 700,
          fontFamily: FONT_MONO,
          fill: stroke,
        },
        'Σ',
      )
    case 'definition':
      return React.createElement('path', {
        d: `M ${cx - 4} ${cy - 4} H ${cx + 4} M ${cx - 4} ${cy} H ${cx + 4} M ${cx - 4} ${cy + 4} H ${cx + 1}`,
        stroke,
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        fill: 'none',
      })
    case 'warning':
      return React.createElement('path', {
        d: `M ${cx} ${cy - 5} L ${cx + 5} ${cy + 4} H ${cx - 5} Z`,
        stroke,
        strokeWidth: 1.5,
        strokeLinejoin: 'round',
        fill: 'none',
      })
    case 'key_fact':
      return React.createElement('polygon', {
        points: `${cx},${cy - 5} ${cx + 4.5},${cy} ${cx},${cy + 5} ${cx - 4.5},${cy}`,
        stroke,
        strokeWidth: 1.4,
        fill: 'none',
      })
    default:
      return React.createElement('circle', {
        cx,
        cy,
        r: 4,
        stroke,
        strokeWidth: 1.6,
        fill: 'none',
      })
  }
}

export function VectorMapSvg({
  model,
  width,
  height,
}: {
  model: VectorMapModel
  width: number | string
  height: number | string
}) {
  const fontCss = `
    .mynota-svg-title { font-family: ${FONT_LATIN}; font-weight: 700; fill: ${COLORS.ink}; }
    .mynota-svg-title-rtl { font-family: ${FONT_ARABIC}; font-weight: 700; fill: ${COLORS.ink}; }
    .mynota-svg-rel { font-family: ${FONT_MONO}; font-size: 9.5px; font-weight: 700; fill: ${COLORS.ink}; }
  `

  return React.createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width,
      height,
      viewBox: `0 0 ${model.viewBoxW} ${model.viewBoxH}`,
      preserveAspectRatio: 'xMidYMid meet',
      'data-vector-map': 'true',
      'data-min-font-pt': model.minRenderedFontPt.toFixed(2),
      style: { display: 'block', width, height },
    },
    React.createElement(
      'defs',
      null,
      React.createElement('style', null, fontCss),
      React.createElement(
        'marker',
        {
          id: 'mynota-rel-arrow',
          viewBox: '0 0 10 10',
          refX: 8,
          refY: 5,
          markerWidth: 6,
          markerHeight: 6,
          orient: 'auto-start-reverse',
        },
        React.createElement('path', { d: 'M 0 1.5 L 9 5 L 0 8.5 z', fill: COLORS.surgicalTeal }),
      ),
    ),

    // Hierarchy Bezier edges
    model.treeEdges.map((edge) =>
      React.createElement('path', {
        key: edge.id,
        d: edge.d,
        fill: 'none',
        stroke: COLORS.ink,
        strokeWidth: 2,
        strokeLinecap: 'round',
      }),
    ),

    // Relation dashed curves (drawn beneath labels, above tree edges)
    model.relationEdges.map((rel) =>
      React.createElement('path', {
        key: `${rel.id}-path`,
        d: rel.d,
        fill: 'none',
        stroke: COLORS.surgicalTeal,
        strokeWidth: 1.6,
        strokeDasharray: '5 4',
        markerEnd: 'url(#mynota-rel-arrow)',
        markerStart: rel.bidirectional ? 'url(#mynota-rel-arrow)' : undefined,
      }),
    ),

    // Nodes (TITLE ONLY + type icon + Core dot)
    model.nodes.map((node) => {
      const nodeType = node.type
      const isRoot = node.level === 'book' || node.col === 0
      const fill = model.light
        ? isRoot
          ? COLORS.bioSlate
          : COLORS.white
        : isRoot
          ? COLORS.cyanGlow
          : node.level === 'section' || node.level === 'chapter'
            ? CHAPTER_FILL[node.color]
            : COLORS.white
      const headerBand = CHAPTER_FILL[node.color]
      const hasIcon = nodeType !== null
      const iconCenterX = node.x + NODE_PAD_X + ICON_SIZE / 2
      const iconCenterY = node.y + node.h / 2
      const textLeft = node.x + NODE_PAD_X + (hasIcon ? ICON_SIZE + 8 : 0)
      const textRight = node.x + node.w - NODE_PAD_X - (node.importance === 'core' || node.importance === 'extra' ? DOT_RESERVE : 0)
      const textX = node.dir === 'rtl' ? (textLeft + textRight) / 2 : textLeft
      const textAnchor = node.dir === 'rtl' ? 'middle' : 'start'
      const totalTextH = node.lines.length * BASE_TITLE_LINE_PX
      const firstLineY = node.y + (node.h - totalTextH) / 2 + BASE_TITLE_FONT_PX - 1

      return React.createElement(
        'g',
        { key: node.id, 'data-svg-node': node.id },
        // Neo-brutalist offset shadow
        React.createElement('rect', {
          x: node.x + 2.5,
          y: node.y + 2.5,
          width: node.w,
          height: node.h,
          rx: 9,
          fill: COLORS.ink,
        }),
        // Main card rect
        React.createElement('rect', {
          x: node.x,
          y: node.y,
          width: node.w,
          height: node.h,
          rx: 9,
          fill,
          stroke: COLORS.ink,
          strokeWidth: 2,
        }),
        // Subtle left color accent bar on white block cards
        (node.level === 'block' || model.light) &&
          React.createElement('rect', {
            x: node.x + 2,
            y: node.y + 3,
            width: 4,
            height: Math.max(8, node.h - 6),
            rx: 2,
            fill: headerBand,
          }),
        // Small type icon circle
        nodeType !== null &&
          React.createElement(
            'g',
            null,
            React.createElement('circle', {
              cx: iconCenterX,
              cy: iconCenterY,
              r: ICON_SIZE / 2,
              fill: nodeType === 'warning' ? COLORS.softPeach : COLORS.mintFrost,
              stroke: COLORS.ink,
              strokeWidth: 1.5,
            }),
            renderTypeIconGlyph(nodeType, iconCenterX, iconCenterY),
          ),
        // Wrapped node title (1-3 lines, never truncated)
        node.lines.map((line, lineIdx) =>
          React.createElement(
            'text',
            {
              key: lineIdx,
              x: textX,
              y: firstLineY + lineIdx * BASE_TITLE_LINE_PX,
              textAnchor,
              fontSize: BASE_TITLE_FONT_PX,
              className: node.dir === 'rtl' ? 'mynota-svg-title-rtl' : 'mynota-svg-title',
              direction: node.dir,
            },
            line,
          ),
        ),
        // Core / Extra dot
        node.importance === 'core' &&
          React.createElement('circle', {
            cx: node.x + node.w - 11,
            cy: node.y + 11,
            r: 4,
            fill: COLORS.ink,
          }),
        node.importance === 'extra' &&
          React.createElement('circle', {
            cx: node.x + node.w - 11,
            cy: node.y + 11,
            r: 3.5,
            fill: COLORS.white,
            stroke: COLORS.ink,
            strokeWidth: 1.5,
            strokeDasharray: '2 1.5',
          }),
      )
    }),

    // Collision-checked relation pill labels on top
    model.relationEdges.map((rel) =>
      rel.label
        ? React.createElement(
            'g',
            { key: `${rel.id}-pill`, 'data-svg-rel-pill': rel.id },
            React.createElement('rect', {
              x: rel.labelX,
              y: rel.labelY,
              width: rel.labelW,
              height: rel.labelH,
              rx: 9,
              fill: COLORS.mintFrost,
              stroke: COLORS.surgicalTeal,
              strokeWidth: 1.5,
            }),
            React.createElement(
              'text',
              {
                x: rel.labelX + rel.labelW / 2,
                y: rel.labelY + rel.labelH / 2 + 3.2,
                textAnchor: 'middle',
                className: 'mynota-svg-rel',
              },
              rel.label,
            ),
          )
        : null,
    ),
  )
}
