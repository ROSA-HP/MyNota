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
  /** The role the server last confirmed, so editing can continue offline (Phase 6). */
  role?: 'owner' | 'editor' | 'viewer'
  nodes: NodeRow[]
  relations: RelationRow[]
  sources: SourceRow[]
  cachedAt: string
}

/** A map's live (Yjs) document as last seen on this device, including changes not yet saved. */
export interface CachedDoc {
  /** `${userId}:${mapId}:${docKey}` */
  id: string
  userId: string
  mapId: string
  key: string
  state: Uint8Array
  savedAt: string
}

class LocalDb extends Dexie {
  keys!: EntityTable<StoredKey, 'id'>
  maps!: EntityTable<CachedMap, 'mapId'>
  settings!: EntityTable<DeviceSetting, 'id'>
  files!: EntityTable<StoredFile, 'id'>
  docs!: EntityTable<CachedDoc, 'id'>

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
    this.version(4).stores({
      keys: 'id',
      maps: 'mapId, userId',
      settings: 'id',
      files: 'id, userId, mapId',
      docs: 'id, [userId+mapId]',
    })
  }
}

export const localDb = new LocalDb()

/**
 * Removes everything this device keeps for one account: AI keys, cached maps and live
 * documents, uploaded files and device settings (after deleting the account, Phase 7.5).
 */
export async function forgetAccountOnDevice(userId: string): Promise<void> {
  const mine = (id: string) => id.startsWith(`${userId}:`)
  await localDb.transaction(
    'rw',
    [localDb.keys, localDb.maps, localDb.settings, localDb.files, localDb.docs],
    async () => {
      await localDb.keys.filter((k) => mine(k.id)).delete()
      await localDb.settings.filter((s) => mine(s.id)).delete()
      await localDb.maps.where('userId').equals(userId).delete()
      await localDb.files.where('userId').equals(userId).delete()
      await localDb.docs.filter((d) => d.userId === userId).delete()
    },
  )
}
