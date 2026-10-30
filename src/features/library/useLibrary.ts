import { useCallback, useEffect, useState } from 'react'
import type { MapRow, SubjectRow } from '@/lib/database.types'
import { MAP_COLUMNS, SUBJECT_COLUMNS, supabase } from '@/lib/supabase'

type LibraryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; maps: MapRow[]; subjects: SubjectRow[] }

async function fetchLibrary(): Promise<LibraryState> {
  const [maps, subjects] = await Promise.all([
    supabase.from('maps').select(MAP_COLUMNS).order('updated_at', { ascending: false }),
    supabase.from('subjects').select(SUBJECT_COLUMNS).order('sort_order'),
  ])
  if (maps.error || subjects.error) return { status: 'error' }
  return { status: 'ready', maps: maps.data, subjects: subjects.data }
}

/** Maps the user owns or was invited to, plus their subjects. RLS decides what comes back. */
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

  return { state, reload }
}
