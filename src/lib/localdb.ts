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

/** An uploaded book or set of photos, kept only on this device (for page previews). */
export interface StoredFile {
  /** `${userId}:${sha256}` */
  id: string
  userId: string
  hash: string
  name: string
  type: string
  size: number
  /** One blob for a PDF, one per page for photos. */
  blobs: Blob[]
  mapId: string | null
  savedAt: string
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
  files!: EntityTable<StoredFile, 'id'>

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
    this.version(3).stores({
      keys: 'id',
      maps: 'mapId, userId',
      settings: 'id',
      files: 'id, userId, mapId',
    })
  }
}

export const localDb = new LocalDb()
