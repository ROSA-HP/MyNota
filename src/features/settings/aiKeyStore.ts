import { create } from 'zustand'
import { forgetSecret, registerSecret } from '@/ai/errors'
import type { AiProvider } from '@/lib/database.types'
import { localDb } from '@/lib/localdb'

export interface ActiveKey {
  provider: AiProvider
  apiKey: string
  model: string
  remembered: boolean
  testedAt: string
}

interface AiKeyState {
  userId: string | null
  key: ActiveKey | null
  loaded: boolean
  /** Loads the remembered key for this user (if any) from IndexedDB. */
  load: (userId: string) => Promise<void>
  /** Saves after a successful test. `remember=false` keeps it in memory for this tab only. */
  save: (key: ActiveKey) => Promise<void>
  setModel: (model: string) => Promise<void>
  remove: () => Promise<void>
  clearMemory: () => void
}

const idFor = (userId: string, provider: AiProvider) => `${userId}:${provider}`

/**
 * The student's AI key. Lives only in this store (memory) and, when remembered, in IndexedDB
 * on this device. It is never logged and never sent anywhere but the AI provider.
 */
export const useAiKey = create<AiKeyState>((set, get) => ({
  userId: null,
  key: null,
  loaded: false,

  load: async (userId) => {
    if (get().userId === userId && get().loaded) return
    set({ userId, loaded: false })
    let stored = null
    try {
      stored = await localDb.keys.get(idFor(userId, 'gemini'))
    } catch {
      /* IndexedDB unavailable (private mode): the key just isn't remembered */
    }
    if (get().userId !== userId) return
    if (stored) {
      registerSecret(stored.apiKey)
      set({
        key: {
          provider: stored.provider,
          apiKey: stored.apiKey,
          model: stored.model,
          remembered: true,
          testedAt: stored.testedAt,
        },
        loaded: true,
      })
    } else {
      set({ key: get().key?.remembered === false ? get().key : null, loaded: true })
    }
  },

  save: async (key) => {
    const userId = get().userId
    registerSecret(key.apiKey)
    set({ key })
    if (!userId) return
    const id = idFor(userId, key.provider)
    try {
      if (key.remembered) {
        await localDb.keys.put({
          id,
          provider: key.provider,
          apiKey: key.apiKey,
          model: key.model,
          testedAt: key.testedAt,
        })
      } else {
        await localDb.keys.delete(id)
      }
    } catch {
      /* storage blocked: the key stays in memory for this tab */
    }
  },

  setModel: async (model) => {
    const key = get().key
    if (!key) return
    await get().save({ ...key, model })
  },

  remove: async () => {
    const { userId, key } = get()
    if (key) forgetSecret(key.apiKey)
    set({ key: null })
    if (userId && key) {
      try {
        await localDb.keys.delete(idFor(userId, key.provider))
      } catch {
        /* ignore */
      }
    }
  },

  /** On sign-out: drop the in-memory copy. A remembered key stays on this device for next time. */
  clearMemory: () => {
    const key = get().key
    if (key) forgetSecret(key.apiKey)
    set({ key: null, userId: null, loaded: false })
  },
}))
