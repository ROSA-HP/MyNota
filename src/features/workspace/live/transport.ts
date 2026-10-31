import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { fromBase64, toBase64 } from './codec'

/** One document as saved on the server: the merged state and the changes after it. */
export interface LoadedDoc {
  key: string
  state: Uint8Array | null
  updates: Uint8Array[]
  /** Number of the last saved change included. */
  upto: number
}

/** Where documents are saved (Postgres through doc_load / doc_push / doc_compact). */
export interface DocStore {
  load(mapId: string, keys: string[]): Promise<LoadedDoc[]>
  push(mapId: string, key: string, update: Uint8Array): Promise<number>
  compact(mapId: string, key: string, state: Uint8Array, upto: number): Promise<boolean>
}

/**
 * Messages on a map's document channel (`map:<id>`):
 * - `u`: a change to document `k`; `pull`: a change too large to send, load `k` from the server
 * - `sv`: "this is what I have" (a state vector per document), answered with `diff`; `back`
 *   marks the answer that asks in return, so two devices catch up on each other exactly once
 */
export type LiveMessage =
  | { t: 'u'; k: string; d: string }
  | { t: 'pull'; k: string }
  | { t: 'sv'; v: Record<string, string>; back?: boolean }
  | { t: 'diff'; v: Record<string, string> }

export type ChannelStatus = 'connecting' | 'live' | 'offline'

export interface LiveChannel {
  /** False when the channel is not joined (the message is dropped; saving covers it). */
  send(message: LiveMessage): boolean
  close(): void
}

export type ChannelFactory = (
  mapId: string,
  onMessage: (m: LiveMessage) => void,
  onStatus: (s: ChannelStatus) => void,
) => LiveChannel

export class LiveStoreError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
}

export const supabaseDocStore: DocStore = {
  async load(mapId, keys) {
    if (!keys.length) return []
    const { data, error } = await supabase.rpc('doc_load', { p_map: mapId, p_keys: keys })
    if (error) throw new LiveStoreError(error.message, error.code)
    return (data ?? []).map((r) => ({
      key: r.doc_key,
      state: r.state ? fromBase64(r.state) : null,
      updates: (r.updates ?? []).map(fromBase64),
      upto: Number(r.upto) || 0,
    }))
  },
  async push(mapId, key, update) {
    const { data, error } = await supabase.rpc('doc_push', {
      p_map: mapId,
      p_key: key,
      p_update: toBase64(update),
    })
    if (error) throw new LiveStoreError(error.message, error.code)
    return Number(data)
  },
  async compact(mapId, key, state, upto) {
    const { data, error } = await supabase.rpc('doc_compact', {
      p_map: mapId,
      p_key: key,
      p_state: toBase64(state),
      p_upto: upto,
    })
    if (error) throw new LiveStoreError(error.message, error.code)
    return data === true
  },
}

const isKeyMap = (v: unknown): v is Record<string, string> =>
  !!v &&
  typeof v === 'object' &&
  Object.entries(v).every(([k, d]) => k.length <= 64 && typeof d === 'string')

const isMessage = (m: unknown): m is LiveMessage => {
  if (!m || typeof m !== 'object') return false
  const o = m as Record<string, unknown>
  if (o.t === 'sv' || o.t === 'diff') return isKeyMap(o.v)
  if (typeof o.k !== 'string' || o.k.length > 64) return false
  return o.t === 'pull' || (o.t === 'u' && typeof o.d === 'string')
}

/** The map's private Realtime channel for document changes. */
export const openSupabaseChannel: ChannelFactory = (mapId, onMessage, onStatus) => {
  let joined = false
  let closed = false
  const channel: RealtimeChannel = supabase.channel(`map:${mapId}`, {
    config: { private: true, broadcast: { self: false, ack: false } },
  })
  channel.on('broadcast', { event: 'live' }, ({ payload }) => {
    if (isMessage(payload)) onMessage(payload)
  })
  onStatus('connecting')
  void supabase.realtime.setAuth().finally(() => {
    if (closed) return
    channel.subscribe((status) => {
      joined = status === 'SUBSCRIBED'
      if (!closed) onStatus(joined ? 'live' : 'offline')
    })
  })
  return {
    send(message) {
      if (!joined) return false
      void channel.send({ type: 'broadcast', event: 'live', payload: message })
      return true
    },
    close() {
      closed = true
      joined = false
      void supabase.removeChannel(channel)
    },
  }
}
