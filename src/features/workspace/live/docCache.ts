import { localDb } from '@/lib/localdb'

/** The device copy of a map's documents (offline use and changes not yet saved). */
export interface DocCache {
  load(userId: string, mapId: string): Promise<Map<string, Uint8Array>>
  save(userId: string, mapId: string, key: string, state: Uint8Array): Promise<void>
}

export const dexieDocCache: DocCache = {
  async load(userId, mapId) {
    try {
      const rows = await localDb.docs.where({ userId, mapId }).toArray()
      return new Map(rows.map((r) => [r.key, r.state]))
    } catch {
      return new Map() // storage unavailable: the copy is only an optimisation
    }
  },
  async save(userId, mapId, key, state) {
    try {
      await localDb.docs.put({
        id: `${userId}:${mapId}:${key}`,
        userId,
        mapId,
        key,
        state,
        savedAt: new Date().toISOString(),
      })
    } catch {
      /* storage full or blocked */
    }
  },
}
