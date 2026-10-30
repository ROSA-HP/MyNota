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
  /** OpenAI-compatible endpoints only. */
  baseUrl?: string
  testedAt: string
}

/** Small per-user device settings, e.g. `${userId}:defaultProvider`. */
export interface DeviceSetting {
  id: string
  value: string
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
  settings!: EntityTable<DeviceSetting, 'id'>

  constructor() {
    super('mynota')
    this.version(1).stores({
      keys: 'id',
      maps: 'mapId, userId',
    })
    this.version(2).stores({
      keys: 'id',
      maps: 'mapId, userId',
      settings: 'id',
    })
  }
}

export const localDb = new LocalDb()
