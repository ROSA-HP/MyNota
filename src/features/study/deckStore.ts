import { create } from 'zustand'
import { newId } from '@/ai/pipeline/convert'
import type { CardProgressRow, CardRow, NodeRow } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { missingCards } from './autoCards'

export const CARD_COLUMNS =
  'id, map_id, node_id, type, front, back, languages, origin, source_key, suspended, created_by, created_at, updated_at'
export const PROGRESS_COLUMNS =
  'card_id, user_id, map_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, updated_at'

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface DeckState {
  mapId: string | null
  status: Status
  /** All cards of the map, suspended ones included (they keep made cards from coming back). */
  cards: Record<string, CardRow>
  /** The student's own progress, by card id. */
  progress: Record<string, CardProgressRow>
  load: (mapId: string) => Promise<void>
  /** Makes the cards that the map's blocks call for and that do not exist yet. Editors only. */
  syncMade: (nodes: NodeRow[]) => Promise<number>
  addCard: (card: Pick<CardRow, 'type' | 'front' | 'back'> & Partial<CardRow>) => Promise<CardRow>
  updateCard: (
    id: string,
    patch: Partial<Pick<CardRow, 'type' | 'front' | 'back'>>,
  ) => Promise<void>
  /** Manual cards are deleted; made cards are hidden so a sync never makes them again. */
  removeCard: (id: string) => Promise<void>
  setProgress: (rows: CardProgressRow[]) => void
  /** Puts one card's progress back as it was (undefined: the card was new). */
  restoreProgress: (cardId: string, prev: CardProgressRow | undefined) => void
  reset: () => void
}

let syncing: Promise<number> | null = null

export const useDeck = create<DeckState>((set, get) => ({
  mapId: null,
  status: 'idle',
  cards: {},
  progress: {},

  load: async (mapId) => {
    if (get().mapId !== mapId) set({ mapId, status: 'loading', cards: {}, progress: {} })
    const [cards, progress] = await Promise.all([
      supabase.from('cards').select(CARD_COLUMNS).eq('map_id', mapId),
      supabase.from('card_progress').select(PROGRESS_COLUMNS).eq('map_id', mapId),
    ])
    if (get().mapId !== mapId) return
    // Without the Phase 4 migration the tables do not exist yet: the map still works.
    if (cards.error || progress.error) return set({ status: 'error' })
    set({
      status: 'ready',
      cards: Object.fromEntries(cards.data.map((c) => [c.id, c])),
      progress: Object.fromEntries(progress.data.map((p) => [p.card_id, p])),
    })
  },

  syncMade: async (nodes) => {
    if (syncing) await syncing.catch(() => 0)
    const { mapId, status } = get()
    if (!mapId || status !== 'ready') return 0
    const drafts = missingCards(
      nodes.filter((n) => n.map_id === mapId),
      Object.values(get().cards),
    )
    if (!drafts.length) return 0
    const now = new Date().toISOString()
    const rows: CardRow[] = drafts.map((d) => ({
      ...d,
      id: newId(),
      map_id: mapId,
      suspended: false,
      created_by: null,
      created_at: now,
      updated_at: now,
    }))
    syncing = (async () => {
      let added = 0
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100)
        const { error } = await supabase.from('cards').insert(
          chunk.map((r) => ({
            id: r.id,
            map_id: r.map_id,
            node_id: r.node_id,
            type: r.type,
            front: r.front,
            back: r.back,
            languages: r.languages,
            origin: r.origin,
            source_key: r.source_key,
          })),
        )
        // 23505: made by someone else meanwhile (or another tab); reload picks theirs up.
        if (error && error.code !== '23505') throw error
        if (!error) {
          added += chunk.length
          if (get().mapId === mapId)
            set({ cards: { ...get().cards, ...Object.fromEntries(chunk.map((c) => [c.id, c])) } })
        }
      }
      return added
    })()
    try {
      return await syncing
    } finally {
      syncing = null
    }
  },

  addCard: async (card) => {
    const { mapId } = get()
    if (!mapId) throw new Error('no deck')
    const now = new Date().toISOString()
    const row: CardRow = {
      id: newId(),
      map_id: mapId,
      node_id: null,
      languages: [],
      origin: 'manual',
      source_key: null,
      suspended: false,
      created_by: null,
      created_at: now,
      updated_at: now,
      ...card,
    }
    const { error } = await supabase.from('cards').insert({
      id: row.id,
      map_id: row.map_id,
      node_id: row.node_id,
      type: row.type,
      front: row.front,
      back: row.back,
      languages: row.languages,
      origin: row.origin,
      source_key: row.source_key,
    })
    if (error) throw error
    set({ cards: { ...get().cards, [row.id]: row } })
    return row
  },

  updateCard: async (id, patch) => {
    const cur = get().cards[id]
    if (!cur) return
    set({ cards: { ...get().cards, [id]: { ...cur, ...patch } } })
    const { error } = await supabase.from('cards').update(patch).eq('id', id)
    if (error) {
      set({ cards: { ...get().cards, [id]: cur } })
      throw error
    }
  },

  removeCard: async (id) => {
    const cur = get().cards[id]
    if (!cur) return
    const made = cur.source_key !== null
    const next = { ...get().cards }
    if (made) next[id] = { ...cur, suspended: true }
    else Reflect.deleteProperty(next, id)
    set({ cards: next })
    const { error } = made
      ? await supabase.from('cards').update({ suspended: true }).eq('id', id)
      : await supabase.from('cards').delete().eq('id', id)
    if (error) {
      set({ cards: { ...get().cards, [id]: cur } })
      throw error
    }
  },

  setProgress: (rows) =>
    set({
      progress: {
        ...get().progress,
        ...Object.fromEntries(
          rows.filter((p) => p.map_id === get().mapId).map((p) => [p.card_id, p]),
        ),
      },
    }),

  restoreProgress: (cardId, prev) => {
    const next = { ...get().progress }
    if (prev) next[cardId] = prev
    else Reflect.deleteProperty(next, cardId)
    set({ progress: next })
  },

  reset: () => set({ mapId: null, status: 'idle', cards: {}, progress: {} }),
}))
