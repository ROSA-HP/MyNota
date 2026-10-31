import { useCallback, useEffect, useState } from 'react'
import type { MapPersonRow } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

/** Who is on a map (owner, members, and for the owner the pending invites). */
export function usePeople(mapId: string | null) {
  const [people, setPeople] = useState<MapPersonRow[] | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!mapId) return
    let alive = true
    void supabase.rpc('map_people', { p_map: mapId }).then(({ data, error }) => {
      // Before the Phase 5 migration (or offline) the list just stays empty.
      if (alive) setPeople(error ? [] : data)
    })
    return () => {
      alive = false
    }
  }, [mapId, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { people, reload }
}
