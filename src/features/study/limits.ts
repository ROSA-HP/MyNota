import type { StudyLimits } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { countToday, startOfToday, type TodayCounts } from './queue'

/** Used until the student changes them in Settings (or before the Phase 4 migration). */
export const DEFAULT_LIMITS: StudyLimits = { daily_new_limit: 10, daily_review_limit: 100 }

export async function loadLimits(userId: string): Promise<StudyLimits> {
  const { data, error } = await supabase
    .from('profiles')
    .select('daily_new_limit, daily_review_limit')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return DEFAULT_LIMITS
  return {
    daily_new_limit: data.daily_new_limit ?? DEFAULT_LIMITS.daily_new_limit,
    daily_review_limit: data.daily_review_limit ?? DEFAULT_LIMITS.daily_review_limit,
  }
}

/** What the student already studied today, across all maps (the limits are per day, not per map). */
export async function loadToday(userId: string, now = new Date()): Promise<TodayCounts> {
  const { data, error } = await supabase
    .from('review_logs')
    .select('card_id, state')
    .eq('user_id', userId)
    .gte('reviewed_at', startOfToday(now).toISOString())
  if (error) return { newDone: 0, reviewsDone: 0 }
  return countToday(data)
}

/** Days in a row with at least one review, ending today (or yesterday, if today has none yet). */
export function streak(days: { day: string; reviews: number }[], today: string): number {
  const studied = new Set(days.filter((d) => d.reviews > 0).map((d) => d.day))
  const cursor = new Date(`${today}T12:00:00Z`)
  if (!studied.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1)
  let n = 0
  while (studied.has(cursor.toISOString().slice(0, 10))) {
    n += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return n
}
