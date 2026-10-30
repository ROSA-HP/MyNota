import type { ChapterColor, DetailBlock, NodeRow, RelationRow } from '@/lib/database.types'
import { toDetailBlock, type DetailsResponse } from '../schemas/details'
import type { OutlineResponse } from '../schemas/outline'

export const PALETTE: ChapterColor[] = [
  'yellow',
  'coral',
  'sky',
  'mint',
  'lavender',
  'pink',
  'orange',
  'lime',
]

const now = () => new Date().toISOString()
export const newId = (): string => crypto.randomUUID()
export const dirFor = (lang: string | null): 'ltr' | 'rtl' => (lang === 'ar' ? 'rtl' : 'ltr')

export function makeNode(
  p: Pick<NodeRow, 'map_id' | 'level' | 'title'> & Partial<NodeRow>,
): NodeRow {
  const t = now()
  return {
    id: newId(),
    parent_id: null,
    sort_order: 0,
    summary: '',
    type: null,
    icon: null,
    color: null,
    importance: 'supporting',
    details: [],
    lang: null,
    dir: 'ltr',
    branch_view: 'tree',
    position: null,
    size: null,
    collapsed: false,
    source: { paragraphs: [] },
    ai_added: false,
    ai_added_reason: null,
    origin: 'user',
    created_by: null,
    created_at: t,
    updated_at: t,
    ...p,
  }
}

export function makeRelation(
  p: Pick<RelationRow, 'map_id' | 'from_node' | 'to_node'> & Partial<RelationRow>,
): RelationRow {
  const t = now()
  return {
    id: newId(),
    type: 'related',
    label: '',
    direction: 'forward',
    status: 'accepted',
    origin: 'user',
    created_by: null,
    created_at: t,
    updated_at: t,
    ...p,
  }
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)

interface Ctx {
  mapId: string
  lang: string | null
}

/** One section node per outline section, colored from the chapter palette in order. */
export function sectionNodes(outline: OutlineResponse, ctx: Ctx & { rootId: string }): NodeRow[] {
  return outline.sections.map((s, i) =>
    makeNode({
      map_id: ctx.mapId,
      parent_id: ctx.rootId,
      sort_order: i,
      level: 'section',
      title: s.title,
      summary: s.summary,
      color: PALETTE[i % PALETTE.length] ?? 'yellow',
      branch_view: s.shape,
      lang: ctx.lang,
      dir: dirFor(ctx.lang),
      source: { paragraphs: range(s.paragraphs.from, s.paragraphs.to) },
      origin: 'ai',
    }),
  )
}

/** Compact outline for the details prompt ("for orientation only"). */
export function outlineText(outline: OutlineResponse): string {
  return outline.sections
    .map((s, i) => {
      const head = `${i + 1}. ${s.title} (P${s.paragraphs.from}-P${s.paragraphs.to}, ${s.shape}): ${s.summary}`
      const subs = s.subsections.map(
        (sub) => `   - ${sub.title} (P${sub.paragraphs.from}-P${sub.paragraphs.to})`,
      )
      return [head, ...subs].join('\n')
    })
    .join('\n')
}

/**
 * Turns one details reply into nodes under `section`. Block keys become UUIDs; flashcard
 * candidates are kept on their block as `question` details (cards arrive in Phase 4);
 * in-section relations are accepted links.
 */
export function blockNodes(
  res: DetailsResponse,
  ctx: Ctx & { section: NodeRow },
): { nodes: NodeRow[]; relations: RelationRow[] } {
  const ids = new Map(res.blocks.map((b) => [b.key, newId()]))
  const cards = new Map<string, DetailBlock[]>()
  for (const f of res.flashcards) {
    const list = cards.get(f.block) ?? []
    list.push({ kind: 'question', front: f.front, back: f.back })
    cards.set(f.block, list)
  }

  const siblingIndex = new Map<string, number>()
  const nodes = res.blocks.map((b) => {
    const parentId = b.parent ? (ids.get(b.parent) ?? ctx.section.id) : ctx.section.id
    const order = siblingIndex.get(parentId) ?? 0
    siblingIndex.set(parentId, order + 1)
    return makeNode({
      id: ids.get(b.key) ?? newId(),
      map_id: ctx.mapId,
      parent_id: parentId,
      sort_order: order,
      level: 'block',
      title: b.title,
      summary: b.summary,
      type: b.type,
      importance: b.importance,
      details: [...b.details.map(toDetailBlock), ...(cards.get(b.key) ?? [])],
      lang: ctx.lang,
      dir: dirFor(ctx.lang),
      source: { paragraphs: [...new Set(b.source)].sort((x, y) => x - y) },
      ai_added: b.added,
      ai_added_reason: b.added ? (b.added_reason ?? null) : null,
      origin: 'ai',
    })
  })

  // Parents must be inserted before children: order nodes by depth.
  const depth = (key: string, seen = new Set<string>()): number => {
    const parent = res.blocks.find((b) => b.key === key)?.parent
    if (!parent || seen.has(parent)) return 0
    seen.add(parent)
    return 1 + depth(parent, seen)
  }
  const keyOf = new Map(res.blocks.map((b) => [ids.get(b.key), b.key]))
  nodes.sort((a, b) => depth(keyOf.get(a.id) ?? '') - depth(keyOf.get(b.id) ?? ''))

  const relations = res.relations.flatMap((r) => {
    const from = ids.get(r.from)
    const to = ids.get(r.to)
    return from && to && from !== to
      ? [
          makeRelation({
            map_id: ctx.mapId,
            from_node: from,
            to_node: to,
            type: r.type,
            label: r.label,
            status: 'accepted',
            origin: 'ai',
          }),
        ]
      : []
  })

  return { nodes, relations }
}
