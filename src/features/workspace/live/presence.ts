import type { RealtimeChannel } from '@supabase/supabase-js'
import { z } from 'zod'
import type { ChapterColor } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

/**
 * Who is on the map right now (Phase 6.4), over the private channel `map:<id>:people`.
 *
 * Presence carries only ids: the user id and the block being edited. Names and pictures come
 * from `map_people()` (the database), never from what another device claims. Cursors are
 * broadcast in map coordinates, at most ~12 times a second while the pointer moves (the free
 * Realtime plan allows 100 messages a second for the whole project).
 */

/** One open map tab of another person. */
export interface Here {
  /** One per tab, so two tabs of one person are two cursors. */
  session: string
  userId: string
  /** The block this person has selected for editing, if any. */
  editing: string | null
}

export interface CursorMove {
  session: string
  /** Null when the pointer left the map. */
  point: { x: number; y: number } | null
}

const PERSON_COLORS: ChapterColor[] = [
  'coral',
  'sky',
  'mint',
  'lavender',
  'pink',
  'orange',
  'lime',
  'yellow',
]

/** A person's color for their cursor and editing highlight (the same on every device). */
export function personColor(userId: string): ChapterColor {
  let h = 0
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PERSON_COLORS[h % PERSON_COLORS.length] ?? 'coral'
}

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const session = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)

const metaSchema = z.object({ u: uuid, e: uuid.nullable().catch(null) })

const cursorSchema = z.object({
  s: session,
  x: z.number().finite().min(-1e7).max(1e7).optional(),
  y: z.number().finite().min(-1e7).max(1e7).optional(),
})

/**
 * The people in a presence state (Supabase: key → list of metas), without this tab.
 * Entries that do not look right are ignored.
 */
export function peopleFromPresence(state: Record<string, unknown[]>, mySession: string): Here[] {
  const out: Here[] = []
  for (const [key, metas] of Object.entries(state)) {
    if (key === mySession || !session.safeParse(key).success) continue
    // Supabase keeps one meta per track() call; the last is the newest.
    const meta = metaSchema.safeParse(metas.at(-1))
    if (meta.success) out.push({ session: key, userId: meta.data.u, editing: meta.data.e })
  }
  return out.sort((a, b) => a.session.localeCompare(b.session))
}

export function parseCursor(payload: unknown): CursorMove | null {
  const r = cursorSchema.safeParse(payload)
  if (!r.success) return null
  const { s, x, y } = r.data
  return { session: s, point: x === undefined || y === undefined ? null : { x, y } }
}

export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const CURSOR_EVERY_MS = 80

export interface PresenceHandlers {
  onPeople(people: Here[]): void
  onCursor(move: CursorMove): void
}

export interface PresenceLink {
  readonly session: string
  setEditing(nodeId: string | null): void
  /** Map coordinates of the pointer, or null when it left the map. */
  moveCursor(point: { x: number; y: number } | null): void
  close(): void
}

export function openPresence(mapId: string, userId: string, h: PresenceHandlers): PresenceLink {
  const me = newSessionId()
  let joined = false
  let closed = false
  let editing: string | null = null
  let lastSent = 0
  let pending: { x: number; y: number } | null | undefined
  let timer: ReturnType<typeof setTimeout> | null = null

  const channel: RealtimeChannel = supabase.channel(`map:${mapId}:people`, {
    config: { private: true, presence: { key: me }, broadcast: { self: false, ack: false } },
  })
  channel.on('presence', { event: 'sync' }, () => {
    h.onPeople(peopleFromPresence(channel.presenceState() as Record<string, unknown[]>, me))
  })
  channel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
    const move = parseCursor(payload)
    if (move && move.session !== me) h.onCursor(move)
  })

  const track = () => {
    if (joined && !closed) void channel.track({ u: userId, e: editing })
  }

  const sendCursor = () => {
    timer = null
    if (!joined || closed || pending === undefined) return
    const p = pending
    pending = undefined
    lastSent = Date.now()
    void channel.send({
      type: 'broadcast',
      event: 'cursor',
      payload: p ? { s: me, x: Math.round(p.x), y: Math.round(p.y) } : { s: me },
    })
  }

  void supabase.realtime.setAuth().finally(() => {
    if (closed) return
    channel.subscribe((status) => {
      joined = status === 'SUBSCRIBED'
      if (joined) track()
    })
  })

  return {
    session: me,
    setEditing(nodeId) {
      if (nodeId === editing) return
      editing = nodeId
      track()
    },
    moveCursor(point) {
      pending = point
      if (timer) return
      timer = setTimeout(sendCursor, Math.max(0, CURSOR_EVERY_MS - (Date.now() - lastSent)))
    },
    close() {
      closed = true
      joined = false
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    },
  }
}
