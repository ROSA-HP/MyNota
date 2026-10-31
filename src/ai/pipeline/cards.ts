import type { CardBlock } from '@/ai/prompts/cards.v1'
import type { CardsResponse } from '@/ai/schemas/cards'
import { CLOZE, shortHash, type CardDraft } from '@/features/study/autoCards'
import type { CardRow, DetailBlock, NodeRow } from '@/lib/database.types'
import { normalizeForSearch } from '@/lib/searchText'

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** A detail line as plain text for the prompt. */
export function detailText(d: DetailBlock): string {
  switch (d.kind) {
    case 'text':
    case 'bullet':
    case 'example':
    case 'cloze':
      return d.text
    case 'vocab':
      return [d.article, d.term, d.meaning && `= ${d.meaning}`].filter(Boolean).join(' ')
    case 'formula':
      return `$${d.latex}$${d.variables ? ` (${d.variables})` : ''}`
    case 'question':
      return `Q: ${d.front} A: ${d.back}`
  }
}

export interface CardsContext {
  blocks: CardBlock[]
  /** Short id → block node id. */
  idMap: Map<string, string>
  /** Normalized fronts already in the deck (all blocks in scope), to drop repeats. */
  seen: Set<string>
}

/** The blocks in scope, with their details and existing cards, as the prompt shows them. */
export function cardsContext(
  blocks: NodeRow[],
  cards: Pick<CardRow, 'node_id' | 'front' | 'suspended'>[],
  maxBlocks = 80,
): CardsContext {
  const byNode = new Map<string, string[]>()
  const seen = new Set<string>()
  for (const c of cards) {
    seen.add(normalizeForSearch(c.front))
    if (!c.node_id || c.suspended) continue
    byNode.set(c.node_id, [...(byNode.get(c.node_id) ?? []), c.front])
  }
  const idMap = new Map<string, string>()
  const list: CardBlock[] = blocks.slice(0, maxBlocks).map((b, i) => {
    const id = `B${i + 1}`
    idMap.set(id, b.id)
    return {
      id,
      title: clip(b.title, 100),
      summary: clip(b.summary, 160),
      details: b.details
        .map(detailText)
        .filter(Boolean)
        .slice(0, 8)
        .map((d) => clip(d, 160)),
      existing: (byNode.get(b.id) ?? []).slice(0, 6).map((f) => clip(f, 100)),
    }
  })
  return { blocks: list, idMap, seen }
}

/** Turns the reply into new cards: known blocks only, real cloze gaps, no repeats. */
export function toCardDrafts(
  res: CardsResponse,
  ctx: CardsContext,
  language: string | null,
  limit: number,
): CardDraft[] {
  const out: CardDraft[] = []
  const seen = new Set(ctx.seen)
  for (const c of res.cards) {
    const nodeId = ctx.idMap.get(c.block.toUpperCase())
    if (!nodeId) continue
    if (c.type === 'cloze' && !CLOZE.test(c.front)) continue
    if (c.type === 'basic' && !c.back) continue
    const key = normalizeForSearch(c.front)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      node_id: nodeId,
      type: c.type,
      front: c.front,
      back: c.type === 'cloze' ? '' : c.back,
      languages: language ? [language] : [],
      origin: 'ai',
      source_key: `g:${shortHash(c.front)}`,
    })
    if (out.length >= limit) break
  }
  return out
}
