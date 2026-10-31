import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardProgressRow, CardRow } from '@/lib/database.types'

// Records every write the session makes instead of talking to Supabase.
const calls: string[] = []
vi.mock('@/lib/supabase', () => {
  const builder = (table: string) => ({
    upsert: (row: { card_id: string }) => {
      calls.push(`upsert ${table} ${row.card_id}`)
      return Promise.resolve({ error: null })
    },
    insert: (row: { card_id: string; rating: number }) => {
      calls.push(`insert ${table} ${row.card_id} ${row.rating}`)
      return Promise.resolve({ error: null })
    },
    delete: () => ({
      eq: (col: string) => {
        const done = Promise.resolve({ error: null })
        calls.push(`delete ${table} ${col}`)
        return Object.assign(done, { eq: () => done })
      },
    }),
  })
  return { supabase: { from: builder } }
})

const { answerCard, interval, previewDue } = await import('@/features/study/fsrs')
const { buildQueue, countToday, interleave } = await import('@/features/study/queue')
const { cardFaces, clozeParts } = await import('@/features/study/cardFace')
const { streak } = await import('@/features/study/limits')
const { describeNodes } = await import('@/features/study/outline')
const { useDeck } = await import('@/features/study/deckStore')
const { flushWrites, useSession } = await import('@/features/study/sessionStore')

const card = (id: string, node: string | null = 'b', extra: Partial<CardRow> = {}): CardRow => ({
  id,
  map_id: 'm',
  node_id: node,
  type: 'basic',
  front: `Q${id}`,
  back: `A${id}`,
  languages: [],
  origin: 'auto',
  source_key: 'type',
  suspended: false,
  created_by: null,
  created_at: '',
  updated_at: '',
  ...extra,
})
const now = new Date('2026-10-31T10:00:00Z')
const prog = (id: string, p: Partial<CardProgressRow>): CardProgressRow => ({
  card_id: id,
  user_id: 'u',
  map_id: 'm',
  due: now.toISOString(),
  stability: 3,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 3,
  learning_steps: 0,
  reps: 2,
  lapses: 0,
  state: 2,
  last_review: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
  updated_at: '',
  ...p,
})

describe('FSRS scheduling', () => {
  it('starts a new card with short steps and grows the gap with good answers', () => {
    const due = previewDue(undefined, now)
    expect(interval(now, due[1])).toEqual({ value: 1, unit: 'minute' })
    expect(interval(now, due[3])).toEqual({ value: 10, unit: 'minute' })
    expect(due[4].getTime()).toBeGreaterThan(due[3].getTime())

    const first = answerCard(undefined, 3, now)
    expect(first.log).toMatchObject({ rating: 3, state: 0, elapsed_days: 0 })
    expect(first.next.state).toBe(1)
    const later = new Date(now.getTime() + 10 * 60_000)
    const second = answerCard(first.next, 3, later)
    expect(second.next.state).toBe(2) // graduated to review
    expect(second.next.scheduled_days).toBeGreaterThanOrEqual(1)
    expect(second.next.last_review).toBe(later.toISOString())
  })

  it('a missed review lapses into relearning', () => {
    const r = answerCard(prog('c', {}), 1, now)
    expect(r.log).toMatchObject({ state: 2, elapsed_days: 3 })
    expect(r.next).toMatchObject({ state: 3, lapses: 1 })
  })

  it('reads intervals the way the buttons show them', () => {
    const at = (ms: number) => interval(now, new Date(now.getTime() + ms))
    expect(at(30_000)).toEqual({ value: 1, unit: 'minute' })
    expect(at(3 * 3_600_000)).toEqual({ value: 3, unit: 'hour' })
    expect(at(5 * 86_400_000)).toEqual({ value: 5, unit: 'day' })
    expect(at(65 * 86_400_000)).toEqual({ value: 2, unit: 'month' })
    expect(at(548 * 86_400_000)).toEqual({ value: 1.5, unit: 'year' })
  })
})

describe('the daily queue', () => {
  const cards = [
    card('n1'),
    card('n2'),
    card('n3'),
    card('r1'),
    card('r2'),
    card('l1'),
    card('later'),
    card('gone', 'b', { suspended: true }),
    card('other', 'x'),
  ]
  const progress = {
    r1: prog('r1', { due: '2026-10-30T00:00:00Z' }),
    r2: prog('r2', { due: '2026-10-29T00:00:00Z' }),
    l1: prog('l1', { state: 1, due: '2026-10-31T09:59:00Z' }),
    later: prog('later', { due: '2026-11-05T00:00:00Z' }),
  }

  it('learning first, then oldest reviews with new cards spread through them', () => {
    const q = buildQueue({ cards, progress, now, scope: new Set(['b']), newLeft: 2, reviewLeft: 9 })
    expect(q.ids).toEqual(['l1', 'r2', 'n1', 'r1', 'n2'])
    expect(q).toMatchObject({ newCount: 2, reviewCount: 2, learningCount: 1 })
  })

  it('keeps to the limits, due-only and scope', () => {
    expect(
      buildQueue({ cards, progress, now, scope: null, newLeft: 0, reviewLeft: 1 }).ids,
    ).toEqual(['l1', 'r2'])
    expect(
      buildQueue({ cards, progress, now, scope: null, newLeft: 5, reviewLeft: 5, dueOnly: true })
        .ids,
    ).toEqual(['l1', 'r2', 'r1'])
    expect(
      buildQueue({ cards, progress, now, scope: new Set(['x']), newLeft: 5, reviewLeft: 5 }).ids,
    ).toEqual(['other'])
    expect(
      buildQueue({ cards, progress, now, scope: null, newLeft: -3, reviewLeft: -1 }).ids,
    ).toEqual(['l1'])
  })

  it('interleaves evenly and counts what today used', () => {
    expect(interleave<number | string>([1, 2, 3, 4], ['a', 'b'])).toEqual([1, 2, 'a', 3, 4, 'b'])
    expect(interleave([], ['a'])).toEqual(['a'])
    expect(
      countToday([
        { card_id: 'a', state: 0 },
        { card_id: 'a', state: 1 },
        { card_id: 'b', state: 0 },
        { card_id: 'c', state: 2 },
        { card_id: 'd', state: 3 },
      ]),
    ).toEqual({ newDone: 2, reviewsDone: 1 })
  })

  it('counts a streak that may end yesterday', () => {
    const days = [
      { day: '2026-10-28', reviews: 4 },
      { day: '2026-10-29', reviews: 0 },
      { day: '2026-10-30', reviews: 2 },
      { day: '2026-10-31', reviews: 9 },
    ]
    expect(streak(days, '2026-10-31')).toBe(2)
    expect(streak(days.slice(0, 3), '2026-10-31')).toBe(1)
    expect(streak([], '2026-10-31')).toBe(0)
  })
})

describe('card faces', () => {
  it('hides cloze gaps and switches reversed cards every other review', () => {
    expect(clozeParts('A {{b}} c {{d::hint}}')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'gap', text: 'b' },
      { kind: 'text', text: ' c ' },
      { kind: 'gap', text: 'd' },
    ])
    const rev = card('v', 'b', { type: 'vocab', front: 'die Zelle', back: 'cell' })
    expect(cardFaces(rev, 0).front).toEqual([{ kind: 'text', text: 'die Zelle' }])
    expect(cardFaces(rev, 1)).toMatchObject({ reversed: true, front: [{ text: 'cell' }] })
    expect(cardFaces(card('f', 'b', { back: '$E=mc^2$' })).back).toEqual([
      { kind: 'formula', latex: 'E=mc^2' },
    ])
  })

  it('places blocks under their chapter in outline order', () => {
    const { order, places } = describeNodes([
      { id: 'root', parent_id: null, level: 'book', title: 'Bio', sort_order: 0 },
      { id: 'c2', parent_id: 'root', level: 'chapter', title: 'Transport', sort_order: 2 },
      { id: 'c1', parent_id: 'root', level: 'chapter', title: 'Cells', sort_order: 1 },
      { id: 's', parent_id: 'c2', level: 'section', title: 'Pumps', sort_order: 0 },
      { id: 'b', parent_id: 's', level: 'block', title: 'Na/K pump', sort_order: 0 },
      { id: 'a', parent_id: 'c1', level: 'block', title: 'Membrane', sort_order: 0 },
    ])
    expect(places.get('b')).toEqual({
      title: 'Na/K pump',
      chapter: { n: 2, title: 'Transport' },
      section: 'Pumps',
    })
    expect((order.get('a') ?? 0) < (order.get('b') ?? 0)).toBe(true)
  })
})

describe('a study session', () => {
  beforeEach(() => {
    calls.length = 0
    useDeck.setState({
      mapId: 'm',
      status: 'ready',
      cards: { a: card('a'), b: card('b') },
      progress: {},
    })
  })

  it('saves each answer, brings missed cards back, and undoes the last one', async () => {
    const s = useSession.getState()
    s.start({ mapId: 'm', userId: 'u', ids: ['a', 'b'] })
    expect(useSession.getState().current).toBe('a')
    s.answer(3) // not flipped yet: ignored
    expect(useSession.getState().history).toHaveLength(0)

    s.flip()
    s.answer(1) // Again: back in a minute
    expect(useDeck.getState().progress.a?.state).toBe(1)
    expect(useSession.getState().current).toBe('b')
    expect(useSession.getState().later.map((l) => l.id)).toEqual(['a'])

    s.flip()
    s.answer(4) // Easy: straight to review
    // Only the learning card is left: it is shown a little early instead of ending the session.
    expect(useSession.getState().current).toBe('a')

    s.undo()
    expect(useSession.getState()).toMatchObject({ current: 'b', flipped: true, finished: false })
    expect(useDeck.getState().progress.b).toBeUndefined()

    await flushWrites()
    expect(calls).toEqual([
      'upsert card_progress a',
      'insert review_logs a 1',
      'upsert card_progress b',
      'insert review_logs b 4',
      'delete card_progress card_id',
      'delete review_logs id',
    ])
  })

  it('practice changes nothing and shows a missed card once more', async () => {
    const s = useSession.getState()
    s.start({ mapId: 'm', userId: 'u', ids: ['a'], practice: true })
    s.flip()
    s.answer(1)
    expect(useSession.getState().current).toBe('a')
    s.flip()
    s.answer(1)
    expect(useSession.getState().finished).toBe(true)
    await flushWrites()
    expect(calls).toEqual([])
    expect(useDeck.getState().progress).toEqual({})
  })
})
