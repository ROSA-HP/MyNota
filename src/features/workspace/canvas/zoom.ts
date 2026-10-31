import type { ChapterColor, NodeRow, RelationRow, SourceRow } from '@/lib/database.types'
import { childrenIndex } from './layout'

/**
 * Semantic zoom: the map keeps the same positions at every zoom, but what is drawn changes.
 * Zoomed far out a book shows chapter overviews; in between, section cards; close up, blocks.
 */
export type ZoomLevel = 'chapters' | 'sections' | 'blocks'

export const LEVEL_THRESHOLDS = {
  book: { chapters: 0.32, sections: 0.62 },
  notes: { sections: 0.45 },
} as const

export function levelFor(zoom: number, book: boolean): ZoomLevel {
  if (book) {
    if (zoom < LEVEL_THRESHOLDS.book.chapters) return 'chapters'
    if (zoom < LEVEL_THRESHOLDS.book.sections) return 'sections'
    return 'blocks'
  }
  return zoom < LEVEL_THRESHOLDS.notes.sections ? 'sections' : 'blocks'
}

/**
 * Where a chapter stands, from what is saved (so it survives closing the tab):
 * - waiting: has its paragraphs but no sections yet
 * - partial: has sections, but some have no blocks (a build stopped or failed half-way)
 * - built:   every section has blocks
 * - empty:   nothing to build (no saved paragraphs)
 */
export type ChapterProgress = 'waiting' | 'partial' | 'built' | 'empty'

export function chapterProgress(
  chapterId: string,
  nodes: Record<string, NodeRow>,
  hasSource: boolean,
): ChapterProgress {
  const all = Object.values(nodes)
  const sections = all.filter((n) => n.parent_id === chapterId)
  if (!sections.length) return hasSource ? 'waiting' : 'empty'
  const unfinished = sections.some(
    (sec) => sec.source.paragraphs.length > 0 && !all.some((n) => n.parent_id === sec.id),
  )
  return unfinished ? 'partial' : 'built'
}

/** The zoom the toolbar jumps to for each level (comfortably inside its band). */
export function zoomForLevel(level: ZoomLevel, book: boolean): number {
  if (level === 'chapters') return 0.24
  if (level === 'sections') return book ? 0.5 : 0.38
  return 0.85
}

export interface ChapterSummary {
  id: string
  title: string
  number: number
  color: ChapterColor | null
  /** Page range, e.g. "7–39", from the saved paragraphs. */
  pages: string | null
  paragraphs: number
  progress: ChapterProgress
  sections: Array<{ id: string; title: string; count: number }>
  blocks: number
  core: number
}

/** One summary per chapter of a book map, in reading order. */
export function chapterSummaries(
  nodes: Record<string, NodeRow>,
  sources: SourceRow[],
  rootId: string | null,
): ChapterSummary[] {
  if (!rootId) return []
  const kids = childrenIndex(Object.values(nodes))
  const descendants = (id: string): NodeRow[] => {
    const out: NodeRow[] = []
    const stack = [...(kids.get(id) ?? [])]
    for (let cur = stack.pop(); cur; cur = stack.pop()) {
      out.push(cur)
      stack.push(...(kids.get(cur.id) ?? []))
    }
    return out
  }
  return (kids.get(rootId) ?? []).map((ch, i) => {
    const source = sources.find((s) => s.chapter_node_id === ch.id)
    const pageNums = (source?.paragraphs ?? [])
      .map((p) => p.page)
      .filter((p): p is number => typeof p === 'number')
    const first = pageNums.length ? Math.min(...pageNums) : null
    const last = pageNums.length ? Math.max(...pageNums) : null
    const sections = (kids.get(ch.id) ?? []).map((sec) => ({
      id: sec.id,
      title: sec.title,
      count: descendants(sec.id).length,
    }))
    const blocks = sections.flatMap((sec) => descendants(sec.id))
    return {
      id: ch.id,
      title: ch.title,
      number: i + 1,
      color: ch.color,
      pages: first === null ? null : first === last ? String(first) : `${first}–${last}`,
      paragraphs: source?.paragraphs.length ?? 0,
      progress: chapterProgress(ch.id, nodes, Boolean(source?.paragraphs.length)),
      sections,
      blocks: blocks.length,
      core: blocks.filter((b) => b.importance === 'core').length,
    }
  })
}

export interface Bundle {
  id: string
  from: string
  to: string
  relations: RelationRow[]
}

/**
 * Links drawn when blocks are hidden: each relation is moved to the nearest visible ancestor of
 * its two ends, links that land inside one card are dropped, and links between the same two
 * cards are bundled into one (either direction).
 */
export function bundleRelations(
  relations: RelationRow[],
  visibleOf: (nodeId: string) => string | null,
): Bundle[] {
  const bundles = new Map<string, Bundle>()
  for (const r of relations) {
    if (r.status === 'suggested') continue
    const a = visibleOf(r.from_node)
    const b = visibleOf(r.to_node)
    if (!a || !b || a === b) continue
    const [from, to] = a < b ? [a, b] : [b, a]
    const id = `b:${from}:${to}`
    const bundle = bundles.get(id) ?? { id, from, to, relations: [] }
    bundle.relations.push(r)
    bundles.set(id, bundle)
  }
  return [...bundles.values()]
}

/** Walks up from a node to the first ancestor that `isShown` accepts (or the node itself). */
export function nearestShown(
  nodes: Record<string, NodeRow>,
  id: string,
  isShown: (n: NodeRow) => boolean,
): string | null {
  let cur = nodes[id]
  while (cur) {
    if (isShown(cur)) return cur.id
    cur = cur.parent_id ? nodes[cur.parent_id] : undefined
  }
  return null
}
