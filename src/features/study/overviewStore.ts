import { create } from 'zustand'
import type { DeckStatsRow, MapRow, StudyLimits, SubjectRow } from '@/lib/database.types'
import { MAP_COLUMNS, SUBJECT_COLUMNS, supabase } from '@/lib/supabase'
import { DEFAULT_LIMITS, loadLimits, loadToday } from './limits'
import type { TodayCounts } from './queue'

export interface Overview {
  maps: MapRow[]
  subjects: SubjectRow[]
  /** Card numbers by map id (maps without cards are missing). */
  decks: Record<string, DeckStatsRow>
  /** Reviews per local day, oldest first (last 60 days). */
  activity: { day: string; reviews: number }[]
  limits: StudyLimits
  today: TodayCounts
  /** False before the Phase 4 migration: Home still shows maps, without study numbers. */
  studyReady: boolean
}

interface OverviewState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: Overview | null
  loadedAt: number
  /** Reloads unless the last load is fresher than `maxAgeMs`. */
  load: (userId: string, maxAgeMs?: number) => Promise<void>
}

let inflight: Promise<void> | null = null

async function fetchOverview(userId: string): Promise<Overview | null> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [maps, subjects, decks, activity, limits, today] = await Promise.all([
    supabase.from('maps').select(MAP_COLUMNS).order('updated_at', { ascending: false }),
    supabase.from('subjects').select(SUBJECT_COLUMNS).order('sort_order'),
    supabase.rpc('deck_stats', { map_ids: null }),
    supabase.rpc('study_activity', { days: 60, tz }),
    loadLimits(userId).catch(() => DEFAULT_LIMITS),
    loadToday(userId).catch(() => ({ newDone: 0, reviewsDone: 0 })),
  ])
  if (maps.error || subjects.error) return null
  return {
    maps: maps.data,
    subjects: subjects.data,
    decks: Object.fromEntries((decks.data ?? []).map((d) => [d.map_id, d])),
    activity: activity.data ?? [],
    limits,
    today,
    studyReady: !decks.error,
  }
}

/** Maps, card numbers and study activity for Home, Flashcards and the sidebar badge. */
export const useOverview = create<OverviewState>((set, get) => ({
  status: 'idle',
  data: null,
  loadedAt: 0,
  load: async (userId, maxAgeMs = 0) => {
    if (inflight) return inflight
    if (get().data && Date.now() - get().loadedAt < maxAgeMs) return
    if (!get().data) set({ status: 'loading' })
    inflight = (async () => {
      const data = await fetchOverview(userId).catch(() => null)
      set(data ? { status: 'ready', data, loadedAt: Date.now() } : { status: 'error' })
    })()
    try {
      await inflight
    } finally {
      inflight = null
    }
  },
}))

export interface DueToday {
  /** Reviews (and learning cards) due now, within today's review limit. */
  reviews: number
  /** New cards that can still be started today. */
  fresh: number
  /** About how long that takes. */
  minutes: number
}

/** What today's limits leave to study across all maps. */
export function dueToday(o: Pick<Overview, 'decks' | 'limits' | 'today'>): DueToday {
  let due = 0
  let fresh = 0
  for (const d of Object.values(o.decks)) {
    due += d.due
    fresh += d.new_cards
  }
  const reviews = Math.min(due, Math.max(0, o.limits.daily_review_limit - o.today.reviewsDone))
  const newLeft = Math.min(fresh, Math.max(0, o.limits.daily_new_limit - o.today.newDone))
  // About 8 s per review and 20 s per new card.
  const minutes = Math.ceil((reviews * 8 + newLeft * 20) / 60)
  return { reviews, fresh: newLeft, minutes }
}
