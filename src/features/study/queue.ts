import type { CardProgressRow, CardRow } from '@/lib/database.types'

/** How far ahead a learning card may be shown when nothing else is left (like Anki's 20 min). */
export const LEARN_AHEAD_MS = 20 * 60_000

export interface QueueInput {
  /** Cards in study order (outline order); suspended ones are skipped. */
  cards: CardRow[]
  progress: Record<string, CardProgressRow>
  now: Date
  /** Blocks in scope (a chapter); null for the whole map. Cards without a block count as whole-map. */
  scope: Set<string> | null
  /** New cards and reviews still allowed today. */
  newLeft: number
  reviewLeft: number
  /** Due cards only: no new cards. */
  dueOnly?: boolean
}

export interface Queue {
  ids: string[]
  newCount: number
  reviewCount: number
  learningCount: number
}

/**
 * Today's session: learning cards that are due, then reviews (oldest first) with new cards
 * spread evenly among them, within the daily limits.
 */
export function buildQueue(input: QueueInput): Queue {
  const { progress, now, scope } = input
  const due = now.getTime()
  const learning: CardRow[] = []
  const reviews: CardRow[] = []
  const fresh: CardRow[] = []
  for (const c of input.cards) {
    if (c.suspended) continue
    if (scope && (!c.node_id || !scope.has(c.node_id))) continue
    const p = progress[c.id]
    if (!p || p.state === 0) fresh.push(c)
    else if (new Date(p.due).getTime() > due) continue
    else if (p.state === 2) reviews.push(c)
    else learning.push(c)
  }
  const byDue = (a: CardRow, b: CardRow) =>
    new Date(progress[a.id]?.due ?? 0).getTime() - new Date(progress[b.id]?.due ?? 0).getTime()
  learning.sort(byDue)
  reviews.sort(byDue)
  const r = reviews.slice(0, Math.max(0, input.reviewLeft))
  const n = input.dueOnly ? [] : fresh.slice(0, Math.max(0, input.newLeft))
  return {
    ids: [...learning, ...interleave(r, n)].map((c) => c.id),
    newCount: n.length,
    reviewCount: r.length,
    learningCount: learning.length,
  }
}

/** Spreads b evenly through a, starting with a: [r n r r n r …]. */
export function interleave<T>(a: T[], b: T[]): T[] {
  if (!a.length) return [...b]
  if (!b.length) return [...a]
  const out: T[] = []
  const step = (a.length + 1) / (b.length + 1)
  let next = step
  let j = 0
  for (let i = 0; i < a.length; i++) {
    out.push(a[i] as T)
    while (j < b.length && i + 1 >= next) {
      out.push(b[j++] as T)
      next += step
    }
  }
  while (j < b.length) out.push(b[j++] as T)
  return out
}

export interface TodayCounts {
  newDone: number
  reviewsDone: number
}

/** What today's review logs already used of the daily limits (new cards seen, reviews done). */
export function countToday(logs: { card_id: string; state: number }[]): TodayCounts {
  const fresh = new Set<string>()
  let reviewsDone = 0
  for (const l of logs) {
    if (l.state === 0) fresh.add(l.card_id)
    else if (l.state === 2) reviewsDone += 1
  }
  return { newDone: fresh.size, reviewsDone }
}

/** Local midnight, as the start of "today" for the daily limits. */
export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}
