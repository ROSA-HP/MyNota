import type { CardProgressRow, CardRow } from '@/lib/database.types'

/** How well a student knows a card or a block (the map's mastery dots). */
export type Mastery = 'new' | 'learning' | 'struggling' | 'mastered'

/** A card counts as mastered once it is in review with a memory that lasts three weeks. */
export const MASTERED_STABILITY_DAYS = 21

export function cardMastery(
  p: Pick<CardProgressRow, 'state' | 'stability' | 'lapses'> | undefined,
): Mastery {
  if (!p || p.state === 0) return 'new'
  if (p.state === 3 || (p.lapses >= 2 && p.stability < MASTERED_STABILITY_DAYS)) return 'struggling'
  if (p.state === 2 && p.stability >= MASTERED_STABILITY_DAYS) return 'mastered'
  return 'learning'
}

/** A block's dot: struggling wins, then all-new, then all-mastered; otherwise learning. */
export function blockMastery(levels: Mastery[]): Mastery | null {
  if (!levels.length) return null
  if (levels.includes('struggling')) return 'struggling'
  if (levels.every((l) => l === 'new')) return 'new'
  if (levels.every((l) => l === 'mastered')) return 'mastered'
  return 'learning'
}

/** Mastery per block id, from a map's cards and the student's progress. */
export function masteryByBlock(
  cards: CardRow[],
  progress: Record<string, CardProgressRow>,
): Record<string, Mastery> {
  const levels = new Map<string, Mastery[]>()
  for (const c of cards) {
    if (!c.node_id || c.suspended) continue
    const list = levels.get(c.node_id) ?? []
    list.push(cardMastery(progress[c.id]))
    levels.set(c.node_id, list)
  }
  const out: Record<string, Mastery> = {}
  for (const [id, l] of levels) {
    const m = blockMastery(l)
    if (m) out[id] = m
  }
  return out
}

export interface DeckCounts {
  total: number
  newCards: number
  due: number
  learning: number
  mastered: number
}

/** Counts like deck_stats(), computed on the device for a loaded deck (per chapter, …). */
export function deckCounts(
  cards: CardRow[],
  progress: Record<string, CardProgressRow>,
  now: Date = new Date(),
): DeckCounts {
  const out: DeckCounts = { total: 0, newCards: 0, due: 0, learning: 0, mastered: 0 }
  for (const c of cards) {
    if (c.suspended) continue
    out.total += 1
    const p = progress[c.id]
    if (!p || p.state === 0) {
      out.newCards += 1
      continue
    }
    if (new Date(p.due) <= now) out.due += 1
    if (cardMastery(p) === 'mastered') out.mastered += 1
    else out.learning += 1
  }
  return out
}
