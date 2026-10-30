import { create } from 'zustand'
import { forgetSecret, registerSecret } from '@/ai/errors'
import { PROVIDERS } from '@/ai/providers'
import type { AiProvider } from '@/lib/database.types'
import { localDb } from '@/lib/localdb'

export interface ActiveKey {
  provider: AiProvider
  /** Empty for keyless local servers (OpenAI-compatible only). */
  apiKey: string
  model: string
  /** OpenAI-compatible endpoints only. */
  baseUrl?: string
  remembered: boolean
  testedAt: string
}

type Keys = Partial<Record<AiProvider, ActiveKey>>

interface AiKeyState {
  userId: string | null
  keys: Keys
  defaultProvider: AiProvider | null
  /** The key new maps use: the default provider's, else the first one set up. */
  key: ActiveKey | null
  loaded: boolean
  /** Loads remembered keys for this user from IndexedDB. */
  load: (userId: string) => Promise<void>
  /** Saves after a successful test. `remembered=false` keeps it in memory for this tab only. */
  save: (key: ActiveKey) => Promise<void>
  setModel: (provider: AiProvider, model: string) => Promise<void>
  setDefault: (provider: AiProvider) => Promise<void>
  remove: (provider: AiProvider) => Promise<void>
  clearMemory: () => void
}

const keyId = (userId: string, provider: AiProvider) => `${userId}:${provider}`
const defaultId = (userId: string) => `${userId}:defaultProvider`

export function pickKey(keys: Keys, preferred: AiProvider | null): ActiveKey | null {
  if (preferred && keys[preferred]) return keys[preferred] ?? null
  for (const p of PROVIDERS) if (keys[p]) return keys[p] ?? null
  return null
}

function isProvider(v: unknown): v is AiProvider {
  return typeof v === 'string' && (PROVIDERS as readonly string[]).includes(v)
}

/**
 * The student's AI keys, one per provider. They live only in this store (memory) and, when
 * remembered, in IndexedDB on this device. Never logged, never sent anywhere but the provider.
 */
export const useAiKey = create<AiKeyState>((set, get) => {
  const update = (keys: Keys, defaultProvider = get().defaultProvider) =>
    set({ keys, defaultProvider, key: pickKey(keys, defaultProvider) })

  return {
    userId: null,
    keys: {},
    defaultProvider: null,
    key: null,
    loaded: false,

    load: async (userId) => {
      if (get().userId === userId && get().loaded) return
      set({ userId, loaded: false })
      const keys: Keys = {}
      let preferred: AiProvider | null = null
      try {
        const stored = await localDb.keys.bulkGet(PROVIDERS.map((p) => keyId(userId, p)))
        for (const s of stored) {
          if (!s) continue
          if (s.apiKey) registerSecret(s.apiKey)
          keys[s.provider] = {
            provider: s.provider,
            apiKey: s.apiKey,
            model: s.model,
            baseUrl: s.baseUrl,
            remembered: true,
            testedAt: s.testedAt,
          }
        }
        const pref = await localDb.settings.get(defaultId(userId))
        if (isProvider(pref?.value)) preferred = pref.value
      } catch {
        /* IndexedDB unavailable (private mode): keys just aren't remembered */
      }
      if (get().userId !== userId) return
      // Keep tab-only keys entered before the load finished.
      for (const p of PROVIDERS) {
        const k = get().keys[p]
        if (k && !k.remembered) keys[p] = k
      }
      update(keys, preferred)
      set({ loaded: true })
    },

    save: async (key) => {
      const userId = get().userId
      if (key.apiKey) registerSecret(key.apiKey)
      const firstKey = Object.keys(get().keys).length === 0
      update({ ...get().keys, [key.provider]: key }, firstKey ? key.provider : undefined)
      if (!userId) return
      const id = keyId(userId, key.provider)
      try {
        if (key.remembered) {
          await localDb.keys.put({
            id,
            provider: key.provider,
            apiKey: key.apiKey,
            model: key.model,
            baseUrl: key.baseUrl,
            testedAt: key.testedAt,
          })
        } else {
          await localDb.keys.delete(id)
        }
        if (firstKey) await localDb.settings.put({ id: defaultId(userId), value: key.provider })
      } catch {
        /* storage blocked: the key stays in memory for this tab */
      }
    },

    setModel: async (provider, model) => {
      const key = get().keys[provider]
      if (key) await get().save({ ...key, model })
    },

    setDefault: async (provider) => {
      update(get().keys, provider)
      const userId = get().userId
      if (!userId) return
      try {
        await localDb.settings.put({ id: defaultId(userId), value: provider })
      } catch {
        /* ignore */
      }
    },

    remove: async (provider) => {
      const { userId, keys } = get()
      const key = keys[provider]
      if (key?.apiKey) forgetSecret(key.apiKey)
      const rest: Keys = Object.fromEntries(Object.entries(keys).filter(([p]) => p !== provider))
      update(rest)
      if (userId && key) {
        try {
          await localDb.keys.delete(keyId(userId, provider))
        } catch {
          /* ignore */
        }
      }
    },

    /** On sign-out: drop in-memory copies. Remembered keys stay on this device for next time. */
    clearMemory: () => {
      for (const k of Object.values(get().keys)) if (k?.apiKey) forgetSecret(k.apiKey)
      set({ keys: {}, key: null, defaultProvider: null, userId: null, loaded: false })
    },
  }
})

/** The key for a provider if set up on this device, else the default key. */
export function useKeyFor(provider: AiProvider | null | undefined): ActiveKey | null {
  return useAiKey((s) => {
    const own = provider ? s.keys[provider] : undefined
    return own ?? s.key
  })
}
