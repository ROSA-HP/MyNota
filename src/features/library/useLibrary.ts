import { useCallback, useEffect, useState } from 'react'
import type { ChapterColor, MapRow, MapStatsRow, SubjectRow } from '@/lib/database.types'
import { MAP_COLUMNS, SUBJECT_COLUMNS, supabase } from '@/lib/supabase'

type LibraryState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready'
      maps: MapRow[]
      subjects: SubjectRow[]
      /** Card numbers by map id (missing while loading or if stats are unavailable). */
      stats: Record<string, MapStatsRow>
    }

async function fetchStats(ids: string[]): Promise<Record<string, MapStatsRow>> {
  if (!ids.length) return {}
  const out: Record<string, MapStatsRow> = {}
  // map_stats takes up to 200 maps per call.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.rpc('map_stats', { map_ids: ids.slice(i, i + 200) })
    if (error) return out // older database without the function: cards just show dates
    for (const row of data) out[row.map_id] = row
  }
  return out
}

async function fetchLibrary(): Promise<LibraryState> {
  const [maps, subjects] = await Promise.all([
    supabase.from('maps').select(MAP_COLUMNS).order('updated_at', { ascending: false }),
    supabase.from('subjects').select(SUBJECT_COLUMNS).order('sort_order'),
  ])
  if (maps.error || subjects.error) return { status: 'error' }
  const stats = await fetchStats(maps.data.map((m) => m.id)).catch(() => ({}))
  return { status: 'ready', maps: maps.data, subjects: subjects.data, stats }
}

/**
 * Maps the user owns or was invited to, their subjects and card numbers. RLS decides what
 * comes back. Subject changes are applied locally first, then saved; a failed save reloads.
 */
export function useLibrary() {
  const [state, setState] = useState<LibraryState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    void fetchLibrary().then((s) => !cancelled && setState(s))
    return () => {
      cancelled = true
    }
  }, [])

  const reload = useCallback(async () => {
    setState({ status: 'loading' })
    setState(await fetchLibrary())
  }, [])

  /** Applies a local change now and runs `save`; on failure, reloads and rethrows. */
  const optimistic = useCallback(
    async (
      change: (s: Extract<LibraryState, { status: 'ready' }>) => Partial<LibraryState>,
      save: () => PromiseLike<{ error: unknown }>,
    ) => {
      setState((s) => (s.status === 'ready' ? ({ ...s, ...change(s) } as LibraryState) : s))
      const { error } = await save()
      if (error) {
        setState(await fetchLibrary())
        throw error
      }
    },
    [],
  )

  const createSubject = useCallback(
    async (name: string, color: ChapterColor) => {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await optimistic(
        (s) => ({
          subjects: [
            ...s.subjects,
            {
              id,
              owner_id: '',
              name,
              color,
              sort_order: s.subjects.reduce((m, x) => Math.max(m, x.sort_order + 1), 0),
              created_at: now,
              updated_at: now,
            },
          ],
        }),
        () =>
          supabase.from('subjects').insert({
            id,
            name,
            color,
            sort_order: state.status === 'ready' ? state.subjects.length : 0,
          }),
      )
      return id
    },
    [optimistic, state],
  )

  const updateSubject = useCallback(
    (id: string, patch: { name?: string; color?: ChapterColor }) =>
      optimistic(
        (s) => ({ subjects: s.subjects.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),
        () => supabase.from('subjects').update(patch).eq('id', id),
      ),
    [optimistic],
  )

  /** Deletes a subject; its maps stay in the library without a subject. */
  const deleteSubject = useCallback(
    (id: string) =>
      optimistic(
        (s) => ({
          subjects: s.subjects.filter((x) => x.id !== id),
          maps: s.maps.map((m) => (m.subject_id === id ? { ...m, subject_id: null } : m)),
        }),
        () => supabase.from('subjects').delete().eq('id', id),
      ),
    [optimistic],
  )

  const moveMap = useCallback(
    (mapId: string, subjectId: string | null) =>
      optimistic(
        (s) => ({
          maps: s.maps.map((m) => (m.id === mapId ? { ...m, subject_id: subjectId } : m)),
        }),
        () => supabase.from('maps').update({ subject_id: subjectId }).eq('id', mapId),
      ),
    [optimistic],
  )

  return { state, reload, createSubject, updateSubject, deleteSubject, moveMap }
}
