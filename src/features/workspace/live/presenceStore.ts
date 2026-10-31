import { create } from 'zustand'
import type { MapPersonRow } from '@/lib/database.types'
import type { CursorMove, Here, PresenceLink } from './presence'

/** A cursor that has not moved for this long is hidden (its tab may be in the background). */
export const CURSOR_IDLE_MS = 15_000

export interface Cursor {
  userId: string
  x: number
  y: number
  at: number
}

/** Name and picture, from the database (`map_people`), by user id. */
export type PersonInfo = Pick<MapPersonRow, 'name' | 'username' | 'avatar_url'>

interface PresenceState {
  /** Other people's open tabs on this map. */
  here: Here[]
  cursors: Record<string, Cursor>
  people: Record<string, PersonInfo>
  link: PresenceLink | null
  setLink: (link: PresenceLink | null) => void
  setPeople: (people: Record<string, PersonInfo>) => void
  setHere: (here: Here[]) => void
  moveCursor: (move: CursorMove, now?: number) => void
  dropIdle: (now?: number) => void
  reset: () => void
}

export const usePresence = create<PresenceState>((set, get) => ({
  here: [],
  cursors: {},
  people: {},
  link: null,
  setLink: (link) => set({ link }),
  setPeople: (people) => set({ people }),
  setHere: (here) => {
    // Cursors of tabs that left go with them.
    const open = new Set(here.map((h) => h.session))
    const cursors = Object.fromEntries(
      Object.entries(get().cursors).filter(([session]) => open.has(session)),
    )
    set({ here, cursors })
  },
  moveCursor: (move, now = Date.now()) => {
    const who = get().here.find((h) => h.session === move.session)
    if (!who) return // not (yet) in presence: ignore
    const cursors = { ...get().cursors }
    if (move.point) cursors[move.session] = { userId: who.userId, ...move.point, at: now }
    else Reflect.deleteProperty(cursors, move.session)
    set({ cursors })
  },
  dropIdle: (now = Date.now()) => {
    const cursors = get().cursors
    const keep = Object.entries(cursors).filter(([, c]) => now - c.at < CURSOR_IDLE_MS)
    if (keep.length !== Object.keys(cursors).length) set({ cursors: Object.fromEntries(keep) })
  },
  reset: () => set({ here: [], cursors: {}, people: {}, link: null }),
}))

/** Who else is editing a block (first by tab order), or undefined. */
export function editorOf(here: Here[], nodeId: string): Here | undefined {
  return here.find((h) => h.editing === nodeId)
}
