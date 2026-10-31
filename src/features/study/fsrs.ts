import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs'
import type { CardProgressRow } from '@/lib/database.types'

/** The four answers, in button order: Again, Hard, Good, Easy. */
export const GRADES = [1, 2, 3, 4] as const satisfies readonly Grade[]
export type Rating = (typeof GRADES)[number]

/** The FSRS fields MyNota keeps per card and student. */
export type Memory = Pick<
  CardProgressRow,
  | 'due'
  | 'stability'
  | 'difficulty'
  | 'elapsed_days'
  | 'scheduled_days'
  | 'learning_steps'
  | 'reps'
  | 'lapses'
  | 'state'
  | 'last_review'
>

// Default FSRS-5 weights, 90% retention, short learning steps (1 min, 10 min), and a little fuzz
// so cards learned together do not all come back on the same day.
const scheduler = fsrs(
  generatorParameters({ request_retention: 0.9, enable_fuzz: true, enable_short_term: true }),
)

const DAY_MS = 86_400_000

function toCard(m: Memory | undefined, now: Date): Card {
  if (!m) return createEmptyCard(now)
  return {
    due: new Date(m.due),
    stability: m.stability,
    difficulty: m.difficulty,
    elapsed_days: m.elapsed_days,
    scheduled_days: m.scheduled_days,
    learning_steps: m.learning_steps,
    reps: m.reps,
    lapses: m.lapses,
    state: m.state,
    last_review: m.last_review ? new Date(m.last_review) : undefined,
  }
}

function fromCard(c: Card): Memory {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: Math.max(0, Math.round(c.elapsed_days)),
    scheduled_days: Math.max(0, Math.round(c.scheduled_days)),
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as Memory['state'],
    last_review: c.last_review ? c.last_review.toISOString() : null,
  }
}

/** When the card would come back for each answer (shown under the buttons). */
export function previewDue(m: Memory | undefined, now: Date): Record<Rating, Date> {
  const preview = scheduler.repeat(toCard(m, now), now)
  return {
    1: preview[1].card.due,
    2: preview[2].card.due,
    3: preview[3].card.due,
    4: preview[4].card.due,
  }
}

export interface Answered {
  next: Memory
  /** What goes into review_logs: the state before this answer and the days involved. */
  log: { rating: Rating; state: Memory['state']; elapsed_days: number; scheduled_days: number }
}

/** Schedules one answer. */
export function answerCard(m: Memory | undefined, rating: Rating, now: Date): Answered {
  const before = toCard(m, now)
  const { card } = scheduler.next(before, now, rating)
  const elapsed = before.last_review
    ? Math.max(0, Math.floor((now.getTime() - before.last_review.getTime()) / DAY_MS))
    : 0
  return {
    next: fromCard(card),
    log: {
      rating,
      state: before.state as Memory['state'],
      elapsed_days: elapsed,
      scheduled_days: Math.max(0, Math.round(card.scheduled_days)),
    },
  }
}

export type IntervalUnit = 'minute' | 'hour' | 'day' | 'month' | 'year'

/** A short "come back in" span: 1 min, 3 h, 5 d, 2 mo, 1.5 y. */
export function interval(from: Date, to: Date): { value: number; unit: IntervalUnit } {
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000))
  if (minutes < 60) return { value: minutes, unit: 'minute' }
  const hours = minutes / 60
  if (hours < 24) return { value: Math.round(hours), unit: 'hour' }
  const days = hours / 24
  if (days < 30) return { value: Math.round(days), unit: 'day' }
  if (days < 365) return { value: Math.round(days / 30), unit: 'month' }
  return { value: Math.round((days / 365) * 10) / 10, unit: 'year' }
}
