import type { CardType, NodeRow } from '@/lib/database.types'

/**
 * Cards made from a map (docs/features.md › Flashcards): the AI's card ideas stored on a block
 * as `question` / `cloze` details, and, for blocks without them, one card from the block's type
 * (definition, vocabulary, formula, key fact, event). Each made card has a `source_key` so a
 * sync adds it once and never again (also after the student deletes it).
 */
export interface CardDraft {
  node_id: string
  type: CardType
  front: string
  back: string
  languages: string[]
  origin: 'auto' | 'ai'
  source_key: string
}

/** Short stable hash (FNV-1a, base 36) so a key survives reordering details. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

const MAX_PER_BLOCK = 6
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
/** Cloze text marks the hidden part as {{…}}. */
export const CLOZE = /\{\{(.+?)\}\}/

export function cardsForBlock(n: NodeRow): CardDraft[] {
  if (n.level !== 'block') return []
  const languages = n.lang ? [n.lang] : []
  const base = { node_id: n.id, languages }
  const out: CardDraft[] = []
  for (const d of n.details) {
    if (d.kind === 'question' && d.front.trim() && d.back.trim())
      out.push({
        ...base,
        type: 'basic',
        front: clip(d.front.trim(), 1000),
        back: clip(d.back.trim(), 2000),
        origin: 'ai',
        source_key: `q:${shortHash(d.front.trim())}`,
      })
    else if (d.kind === 'cloze' && CLOZE.test(d.text))
      out.push({
        ...base,
        type: 'cloze',
        front: clip(d.text.trim(), 1000),
        back: '',
        origin: 'ai',
        source_key: `c:${shortHash(d.text.trim())}`,
      })
  }
  if (out.length) return out.slice(0, MAX_PER_BLOCK)

  const title = n.title.trim()
  const summary = n.summary.trim()
  const firstText = n.details.find((d) => d.kind === 'text' || d.kind === 'bullet')
  const answer = summary || (firstText && 'text' in firstText ? firstText.text.trim() : '')
  if (!title) return []
  switch (n.type) {
    case 'vocabulary': {
      const vocab = n.details.filter((d) => d.kind === 'vocab')
      if (vocab.length)
        return vocab.slice(0, MAX_PER_BLOCK).map((v) => ({
          ...base,
          languages: [...new Set([v.lang ?? n.lang, ...languages].filter(Boolean) as string[])],
          type: 'vocab' as const,
          front: clip([v.article, v.term].filter(Boolean).join(' '), 1000),
          back: clip([v.meaning, v.plural ? `(${v.plural})` : ''].filter(Boolean).join(' '), 2000),
          origin: 'auto' as const,
          source_key: `v:${shortHash(v.term)}`,
        }))
      return answer
        ? [
            {
              ...base,
              type: 'vocab',
              front: title,
              back: clip(answer, 2000),
              origin: 'auto',
              source_key: 'type',
            },
          ]
        : []
    }
    case 'formula': {
      const formula = n.details.find((d) => d.kind === 'formula')
      const back = formula
        ? `$${formula.latex}$${formula.variables ? `\n${formula.variables}` : ''}`
        : answer
      return back
        ? [
            {
              ...base,
              type: 'basic',
              front: title,
              back: clip(back, 2000),
              origin: 'auto',
              source_key: 'type',
            },
          ]
        : []
    }
    case 'definition':
    case 'key_fact':
    case 'event':
      return answer
        ? [
            {
              ...base,
              type: 'basic',
              front: title,
              back: clip(answer, 2000),
              origin: 'auto',
              source_key: 'type',
            },
          ]
        : []
    default:
      return []
  }
}

/** Drafts for every block of a map that are not made yet (by node and source key). */
export function missingCards(
  nodes: NodeRow[],
  existing: Array<{ node_id: string | null; source_key: string | null }>,
): CardDraft[] {
  const have = new Set(
    existing.filter((c) => c.node_id && c.source_key).map((c) => `${c.node_id}|${c.source_key}`),
  )
  return nodes
    .flatMap((n) => cardsForBlock(n))
    .filter((d) => !have.has(`${d.node_id}|${d.source_key}`))
}
