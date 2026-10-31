import { create } from 'zustand'
import { newId } from '@/ai/pipeline/convert'
import type { CardProgressRow } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { useDeck } from './deckStore'
import { answerCard, type Rating } from './fsrs'
import { LEARN_AHEAD_MS } from './queue'

interface Answer {
  cardId: string
  rating: Rating
  /** Progress before the answer (undefined: the card was new to this student). */
  prev: CardProgressRow | undefined
  logId: string | null
  /** Where the card was taken from, so undo can put the queue back exactly. */
  queue: string[]
  later: Later[]
}

interface Later {
  id: string
  due: number
}

export interface SessionStart {
  mapId: string
  userId: string
  ids: string[]
  /** Practice: answers are counted but never change the schedule. */
  practice?: boolean
}

interface SessionState {
  mapId: string | null
  userId: string | null
  practice: boolean
  /** Cards still to show, in order. */
  queue: string[]
  /** Learning cards that come back in a few minutes. */
  later: Later[]
  current: string | null
  flipped: boolean
  shownAt: number
  startedAt: number
  finished: boolean
  history: Answer[]
  /** One write failed: answers may not all be saved. */
  saveFailed: boolean
  start: (s: SessionStart) => void
  flip: () => void
  answer: (rating: Rating) => void
  undo: () => void
  finish: () => void
  reset: () => void
}

/** Writes run one after another so an undo never overtakes the answer it undoes. */
let writes: Promise<void> = Promise.resolve()
function queueWrite(job: () => PromiseLike<{ error: unknown }>) {
  writes = writes.then(async () => {
    const { error } = await job()
    if (error) useSession.setState({ saveFailed: true })
  })
}

/** Resolves once every answer so far has been written (or failed). */
export const flushWrites = () => writes

function pickNext(queue: string[], later: Later[], now: number) {
  const sorted = [...later].sort((a, b) => a.due - b.due)
  const ready = sorted[0]
  if (ready && ready.due <= now) return { current: ready.id, queue, later: sorted.slice(1) }
  if (queue.length) return { current: queue[0] ?? null, queue: queue.slice(1), later: sorted }
  // Nothing else left: show learning cards a little early instead of making the student wait.
  if (ready && ready.due - now <= LEARN_AHEAD_MS)
    return { current: ready.id, queue, later: sorted.slice(1) }
  return { current: null, queue, later: sorted }
}

const idle = {
  mapId: null,
  userId: null,
  practice: false,
  queue: [],
  later: [],
  current: null,
  flipped: false,
  shownAt: 0,
  startedAt: 0,
  finished: false,
  history: [],
  saveFailed: false,
}

export const useSession = create<SessionState>((set, get) => ({
  ...idle,

  start: ({ mapId, userId, ids, practice = false }) => {
    const now = Date.now()
    const next = pickNext(ids, [], now)
    set({
      ...idle,
      mapId,
      userId,
      practice,
      ...next,
      later: [],
      startedAt: now,
      shownAt: now,
      finished: next.current === null,
    })
  },

  flip: () => {
    if (get().current) set({ flipped: true })
  },

  answer: (rating) => {
    const s = get()
    const id = s.current
    if (!id || !s.flipped || !s.mapId || !s.userId) return
    const nowDate = new Date()
    const now = nowDate.getTime()
    const prev = useDeck.getState().progress[id]
    let later = s.later
    let logId: string | null = null

    if (s.practice) {
      // Practice: a missed card comes round once more at the end; nothing is saved.
      if (rating === 1 && !s.history.some((h) => h.cardId === id && h.rating === 1))
        later = [...later, { id, due: now }]
    } else {
      const { next, log } = answerCard(prev, rating, nowDate)
      const row: CardProgressRow = {
        card_id: id,
        user_id: s.userId,
        map_id: s.mapId,
        ...next,
        updated_at: nowDate.toISOString(),
      }
      useDeck.getState().setProgress([row])
      const due = new Date(next.due).getTime()
      if (due - now < LEARN_AHEAD_MS + 60 * 60_000 && next.state !== 2)
        later = [...later, { id, due }]
      logId = newId()
      const mapId = s.mapId
      const { updated_at: _skip, ...insert } = row
      void _skip
      queueWrite(() =>
        supabase.from('card_progress').upsert(insert, { onConflict: 'card_id,user_id' }),
      )
      const reviewId = logId
      queueWrite(() =>
        supabase.from('review_logs').insert({
          id: reviewId,
          card_id: id,
          map_id: mapId,
          ...log,
          duration_ms: Math.min(3_600_000, Math.max(0, now - s.shownAt)),
        }),
      )
    }

    const nextPick = pickNext(s.queue, later, now)
    set({
      history: [...s.history, { cardId: id, rating, prev, logId, queue: s.queue, later: s.later }],
      ...nextPick,
      flipped: false,
      shownAt: now,
      finished: nextPick.current === null,
    })
  },

  undo: () => {
    const s = get()
    const last = s.history.at(-1)
    if (!last || !s.userId) return
    if (!s.practice) {
      const deck = useDeck.getState()
      deck.restoreProgress(last.cardId, last.prev)
      const userId = s.userId
      if (last.prev) {
        const { updated_at: _skip, ...back } = last.prev
        void _skip
        queueWrite(() =>
          supabase.from('card_progress').upsert(back, { onConflict: 'card_id,user_id' }),
        )
      } else {
        queueWrite(() =>
          supabase.from('card_progress').delete().eq('card_id', last.cardId).eq('user_id', userId),
        )
      }
      const logId = last.logId
      if (logId) queueWrite(() => supabase.from('review_logs').delete().eq('id', logId))
    }
    set({
      history: s.history.slice(0, -1),
      current: last.cardId,
      queue: last.queue,
      later: last.later,
      flipped: true,
      finished: false,
      shownAt: Date.now(),
    })
  },

  finish: () => set({ finished: true }),

  reset: () => set(idle),
}))
