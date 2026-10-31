import { useEffect } from 'react'
import { useWorkspace } from '@/features/workspace/workspaceStore'
import { useDeck } from './deckStore'

/** How long blocks must stay unchanged before their cards are made (the map grows in bursts). */
const SYNC_DELAY_MS = 2000

/**
 * Keeps the open map's deck loaded and, for editors, makes the cards its blocks call for:
 * after a build, a merge, or when an older map is opened for the first time since Phase 4.
 */
export function useDeckSync(mapId: string | undefined) {
  const status = useWorkspace((s) => s.status)
  const fromCache = useWorkspace((s) => s.fromCache)
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const nodes = useWorkspace((s) => s.nodes)
  const deckStatus = useDeck((s) => s.status)
  const deckMap = useDeck((s) => s.mapId)

  useEffect(() => {
    if (!mapId || status !== 'ready' || fromCache) return
    void useDeck.getState().load(mapId)
  }, [mapId, status, fromCache])

  useEffect(() => () => useDeck.getState().reset(), [mapId])

  useEffect(() => {
    if (!canEdit || deckStatus !== 'ready' || deckMap !== mapId || fromCache) return
    const id = setTimeout(() => {
      useDeck
        .getState()
        .syncMade(Object.values(useWorkspace.getState().nodes))
        .catch(() => undefined) // cards are made again on the next change or visit
    }, SYNC_DELAY_MS)
    return () => clearTimeout(id)
  }, [nodes, canEdit, deckStatus, deckMap, mapId, fromCache])
}
