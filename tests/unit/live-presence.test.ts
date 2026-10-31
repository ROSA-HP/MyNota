import { describe, expect, it } from 'vitest'
import { parseCursor, peopleFromPresence, personColor } from '@/features/workspace/live/presence'
import { editorOf, usePresence } from '@/features/workspace/live/presenceStore'

const ME = 'aaaaaaaaaaaaaaaa'
const TAB = 'bbbbbbbbbbbbbbbb'
const TAB2 = 'cccccccccccccccc'
const MONA = '1f0e7c3a-2b4d-4e6f-8a9b-0c1d2e3f4a5b'
const BLOCK = '9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70'

describe('presence', () => {
  it('lists the others, newest meta per tab, and ignores bad entries', () => {
    const here = peopleFromPresence(
      {
        [ME]: [{ u: MONA, e: null }],
        [TAB]: [
          { u: MONA, e: null },
          { u: MONA, e: BLOCK },
        ],
        [TAB2]: [{ u: 'not-a-uuid', e: null }],
        'bad key!': [{ u: MONA, e: null }],
        dddddddddddddddd: [{ u: MONA, e: '<script>' }], // bad block id: not editing
      },
      ME,
    )
    expect(here).toEqual([
      { session: TAB, userId: MONA, editing: BLOCK },
      { session: 'dddddddddddddddd', userId: MONA, editing: null },
    ])
    expect(editorOf(here, BLOCK)?.userId).toBe(MONA)
  })

  it('parses cursors and rejects nonsense', () => {
    expect(parseCursor({ s: TAB, x: 10.5, y: -4 })).toEqual({
      session: TAB,
      point: { x: 10.5, y: -4 },
    })
    expect(parseCursor({ s: TAB })).toEqual({ session: TAB, point: null })
    expect(parseCursor({ s: TAB, x: Infinity, y: 0 })).toBeNull()
    expect(parseCursor({ s: 'x', x: 1, y: 1 })).toBeNull()
    expect(parseCursor('hello')).toBeNull()
  })

  it('gives a person the same color everywhere', () => {
    expect(personColor(MONA)).toBe(personColor(MONA))
  })

  it('shows cursors only for tabs that are here, and drops idle ones', () => {
    const s = usePresence.getState()
    s.reset()
    s.moveCursor({ session: TAB, point: { x: 1, y: 2 } }, 0)
    expect(usePresence.getState().cursors).toEqual({}) // not in presence yet

    s.setHere([{ session: TAB, userId: MONA, editing: null }])
    s.moveCursor({ session: TAB, point: { x: 1, y: 2 } }, 1_000)
    expect(usePresence.getState().cursors[TAB]).toMatchObject({ x: 1, y: 2, userId: MONA })

    s.dropIdle(5_000)
    expect(usePresence.getState().cursors[TAB]).toBeDefined()
    s.dropIdle(60_000)
    expect(usePresence.getState().cursors[TAB]).toBeUndefined()

    s.moveCursor({ session: TAB, point: { x: 3, y: 4 } }, 61_000)
    s.setHere([]) // the tab left: its cursor goes too
    expect(usePresence.getState().cursors).toEqual({})
  })
})
