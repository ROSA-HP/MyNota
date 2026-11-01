import type { CardRow } from '@/lib/database.types'

/** A piece of card text: plain, a cloze gap, or a formula (LaTeX, typeset with KaTeX). */
export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'gap'; text: string }
  | { kind: 'formula'; latex: string }

export interface Faces {
  front: Part[]
  back: Part[]
  /** For cloze cards: the whole sentence with the gaps filled in (shown on the answer side). */
  filled?: Part[]
  reversed: boolean
}

const FORMULA = /^\$([\s\S]+)\$$/

function plain(text: string): Part[] {
  const m = FORMULA.exec(text.trim())
  return m?.[1] ? [{ kind: 'formula', latex: m[1].trim() }] : [{ kind: 'text', text }]
}

/** Splits "Osmosis moves {{water}} across" into text and gap parts. */
export function clozeParts(text: string): Part[] {
  const out: Part[] = []
  let last = 0
  for (const m of text.matchAll(/\{\{(.+?)\}\}/g)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) })
    out.push({ kind: 'gap', text: (m[1] ?? '').split('::')[0] ?? '' })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

/**
 * What the two sides show. Reversed and vocabulary cards switch direction every other review,
 * so both directions get practised with one schedule.
 */
export function cardFaces(card: Pick<CardRow, 'type' | 'front' | 'back'>, reps = 0): Faces {
  if (card.type === 'cloze') {
    const parts = clozeParts(card.front)
    return {
      front: parts,
      back: card.back ? plain(card.back) : [],
      filled: parts,
      reversed: false,
    }
  }
  const reversed = (card.type === 'reversed' || card.type === 'vocab') && reps % 2 === 1
  return reversed
    ? { front: plain(card.back), back: plain(card.front), reversed }
    : { front: plain(card.front), back: plain(card.back), reversed }
}
