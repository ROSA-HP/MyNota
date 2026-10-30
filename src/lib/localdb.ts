import Dexie, { type EntityTable } from 'dexie'
import type { MapRow, NodeRow, RelationRow, SourceRow } from './database.types'
import type { AiProvider } from './database.types'

/**
 * The device-only database (IndexedDB). Holds the student's AI key and a cached copy of
 * maps for instant load and offline viewing. Nothing here is ever sent to Supabase.
 */
export interface StoredKey {
  /** `${userId}:${provider}` so two accounts on one browser never share a key. */
  id: string
  provider: AiProvider
  apiKey: string
  model: string
  testedAt: string
}

export interface CachedMap {
  mapId: string
  userId: string
  map: MapRow
  nodes: NodeRow[]
  relations: RelationRow[]
  sources: SourceRow[]
  cachedAt: string
}

class LocalDb extends Dexie {
  keys!: EntityTable<StoredKey, 'id'>
  maps!: EntityTable<CachedMap, 'mapId'>

  constructor() {
    super('mynota')
    this.version(1).stores({
      keys: 'id',
      maps: 'mapId, userId',
    })
  }
}

export const localDb = new LocalDb()
