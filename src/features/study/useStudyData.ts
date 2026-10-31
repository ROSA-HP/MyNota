import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/authStore'
import type { StudyLimits } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { useDeck } from './deckStore'
import { DEFAULT_LIMITS, loadLimits, loadToday } from './limits'
import { describeNodes, type BlockPlace, type StudyNode } from './outline'
import type { TodayCounts } from './queue'

export type { BlockPlace, StudyNode }

export interface StudyData {
  title: string
  nodes: StudyNode[]
  /** Block id → its place in the map. */
  places: Map<string, BlockPlace>
  /** Node id → position in outline order, to study cards in the order of the map. */
  order: Map<string, number>
  limits: StudyLimits
  today: TodayCounts
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: StudyData }

/** Everything a study session needs: the map's outline, its deck, and today's limits. */
export function useStudyData(mapId: string): State {
  const userId = useAuth((s) => s.session?.user.id)
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!userId) return
    let alive = true
    void (async () => {
      const [map, nodes, limits, today] = await Promise.all([
        supabase.from('maps').select('title').eq('id', mapId).maybeSingle(),
        supabase
          .from('nodes')
          .select('id, parent_id, level, title, sort_order')
          .eq('map_id', mapId),
        loadLimits(userId).catch(() => DEFAULT_LIMITS),
        loadToday(userId).catch(() => ({ newDone: 0, reviewsDone: 0 })),
        useDeck.getState().load(mapId),
      ])
      if (!alive) return
      if (map.error || !map.data || nodes.error || useDeck.getState().status !== 'ready')
        return setState({ status: 'error' })
      const { order, places } = describeNodes(nodes.data)
      setState({
        status: 'ready',
        data: { title: map.data.title, nodes: nodes.data, places, order, limits, today },
      })
    })()
    return () => {
      alive = false
    }
  }, [mapId, userId])

  useEffect(() => () => useDeck.getState().reset(), [mapId])

  return state
}
