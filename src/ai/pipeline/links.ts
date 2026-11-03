import type { NodeRow, RelationRow } from '@/lib/database.types'
import type { CompactBlock } from '../prompts/links.v1'
import type { LinksResponse } from '../schemas/links'
import { makeRelation } from './convert'
import { vagueLabel } from './relations'

/**
 * Cross-links pass (docs/ai-pipeline.md › Passes 4): the model sees only a compact list of
 * blocks (short id, title, summary, place) and proposes links between different sections
 * (one chapter) or different chapters (whole book). Results become dashed suggestions.
 */
export type LinkScope = { kind: 'chapter'; chapterId: string } | { kind: 'book' }

export interface LinkCandidates {
  title: string
  blocks: CompactBlock[]
  /** Short prompt id → node id. */
  idMap: Map<string, string>
  /** Node id → the group a link must cross (section or chapter id). */
  groupOf: Map<string, string>
  groups: number
}

const IMPORTANCE_RANK = { core: 0, supporting: 1, extra: 2 } as const
/** Enough for a big chapter; keeps a whole-book request well inside free-tier limits. */
export const MAX_CANDIDATES = { chapter: 250, book: 400 } as const

function childrenOf(nodes: NodeRow[]) {
  const map = new Map<string | null, NodeRow[]>()
  for (const n of nodes) {
    const list = map.get(n.parent_id) ?? []
    list.push(n)
    map.set(n.parent_id, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order)
  return map
}

function descendants(kids: Map<string | null, NodeRow[]>, id: string): NodeRow[] {
  const out: NodeRow[] = []
  const walk = (pid: string) => {
    for (const c of kids.get(pid) ?? []) {
      out.push(c)
      walk(c.id)
    }
  }
  walk(id)
  return out
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * The blocks to send for a scope. A notes map is one "chapter" (its root). When there are
 * too many blocks, core blocks go first, then supporting, then extra.
 */
export function linkCandidates(
  all: Record<string, NodeRow>,
  rootId: string,
  scope: LinkScope,
): LinkCandidates {
  const kids = childrenOf(Object.values(all))
  const root = all[rootId]
  type Entry = { node: NodeRow; group: string; place: string }
  const entries: Entry[] = []
  let groups = 0
  let title = root?.title ?? ''
  if (scope.kind === 'chapter') {
    const chapter = all[scope.chapterId]
    title = chapter?.title ?? title
    for (const section of kids.get(scope.chapterId) ?? []) {
      const blocks = descendants(kids, section.id)
      if (blocks.length) groups += 1
      for (const b of blocks) entries.push({ node: b, group: section.id, place: section.title })
    }
  } else {
    for (const chapter of kids.get(rootId) ?? []) {
      let any = false
      for (const section of kids.get(chapter.id) ?? [])
        for (const b of descendants(kids, section.id)) {
          any = true
          entries.push({
            node: b,
            group: chapter.id,
            place: `${chapter.title} › ${section.title}`,
          })
        }
      if (any) groups += 1
    }
  }
  const limit = MAX_CANDIDATES[scope.kind]
  const kept =
    entries.length <= limit
      ? entries
      : entries
          .map((e, i) => ({ e, i }))
          .sort(
            (a, b) =>
              IMPORTANCE_RANK[a.e.node.importance] - IMPORTANCE_RANK[b.e.node.importance] ||
              a.i - b.i,
          )
          .slice(0, limit)
          .sort((a, b) => a.i - b.i)
          .map(({ e }) => e)
  const idMap = new Map<string, string>()
  const groupOf = new Map<string, string>()
  const blocks = kept.map((e, i) => {
    const id = `B${i + 1}`
    idMap.set(id, e.node.id)
    groupOf.set(e.node.id, e.group)
    return {
      id,
      title: clip(e.node.title, 80),
      summary: clip(e.node.summary, 120),
      group: e.group,
      place: clip(e.place, 120),
    }
  })
  return { title, blocks, idMap, groupOf, groups }
}

/**
 * How many links to ask for: few (owner, 2026-11-03: "use less arrows"): about one per ten
 * blocks in a chapter (1 to 5), about one per chapter for a book (2 to 8).
 */
export function maxLinksFor(scope: LinkScope['kind'], blocks: number, groups: number): number {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  return scope === 'chapter' ? clamp(Math.round(blocks / 10), 1, 5) : clamp(groups, 2, 8)
}

/** Whether a scope has anything to link across (at least two groups with blocks). */
export const canLink = (c: LinkCandidates): boolean => c.groups >= 2 && c.blocks.length >= 2

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * Turns the reply into suggested relations: drops unknown ids, self-links, links inside one
 * group, pairs that already have any relation (including dismissed suggestions) and repeats;
 * strong links first, at most `max`.
 */
export function toSuggestions(
  res: LinksResponse,
  ctx: {
    mapId: string
    candidates: LinkCandidates
    existing: RelationRow[]
    max: number
  },
): RelationRow[] {
  const taken = new Set(ctx.existing.map((r) => pairKey(r.from_node, r.to_node)))
  const out: RelationRow[] = []
  const sorted = [...res.links].sort(
    (a, b) => (a.confidence === 'high' ? 0 : 1) - (b.confidence === 'high' ? 0 : 1),
  )
  for (const link of sorted) {
    const from = ctx.candidates.idMap.get(link.from.toUpperCase())
    const to = ctx.candidates.idMap.get(link.to.toUpperCase())
    if (!from || !to || from === to) continue
    if (ctx.candidates.groupOf.get(from) === ctx.candidates.groupOf.get(to)) continue
    // A link has to say why (no "related", no empty label).
    if (vagueLabel(link.label)) continue
    const key = pairKey(from, to)
    if (taken.has(key)) continue
    taken.add(key)
    out.push(
      makeRelation({
        map_id: ctx.mapId,
        from_node: from,
        to_node: to,
        type: link.type,
        label: link.label.split(/\s+/).slice(0, 4).join(' '),
        status: 'suggested',
        confidence: link.confidence,
        origin: 'ai',
      }),
    )
    if (out.length >= ctx.max) break
  }
  return out
}
