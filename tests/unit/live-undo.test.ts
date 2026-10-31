import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { makeNode } from '@/ai/pipeline/convert'
import {
  LOCAL,
  REMOTE,
  SEED,
  patchNode,
  putNode,
  readNode,
  removeNode,
} from '@/features/workspace/live/mapDoc'
import { MapUndo, UNDO_GROUP_MS } from '@/features/workspace/live/undo'

const MAP = '9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70'

/** Two devices of two people, each change sent to the other at once. */
function pair() {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE) Y.applyUpdate(b, u, REMOTE)
  })
  b.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE) Y.applyUpdate(a, u, REMOTE)
  })
  return { a, b }
}

function clock() {
  let t = 1_000
  return { now: () => t, tick: (ms = UNDO_GROUP_MS + 1) => (t += ms) }
}

describe('MapUndo', () => {
  it('undoes and redoes only this device’s own changes', () => {
    const { a, b } = pair()
    const c = clock()
    const undo = new MapUndo(undefined, c.now)
    undo.track('book', a)
    const n = makeNode({ map_id: MAP, level: 'chapter', title: 'Cells' })
    a.transact(() => putNode(a, n), SEED) // converted map: not undoable
    expect(undo.canUndo).toBe(false)

    a.transact(() => patchNode(a, n.id, { title: 'Mine' }), LOCAL)
    c.tick()
    b.transact(() => patchNode(b, n.id, { summary: 'Theirs' }), LOCAL)
    expect(readNode(a, n.id, MAP)?.summary).toBe('Theirs')

    expect(undo.undo()).toBe(true)
    expect(readNode(a, n.id, MAP)?.title).toBe('Cells')
    expect(readNode(a, n.id, MAP)?.summary).toBe('Theirs') // the other person's change stays
    expect(readNode(b, n.id, MAP)?.title).toBe('Cells') // and the undo reaches them
    expect(undo.canUndo).toBe(false)

    expect(undo.redo()).toBe(true)
    expect(readNode(a, n.id, MAP)?.title).toBe('Mine')
  })

  it('does not overwrite a field someone else changed after us', () => {
    const { a, b } = pair()
    const c = clock()
    const undo = new MapUndo(undefined, c.now)
    undo.track('book', a)
    const n = makeNode({ map_id: MAP, level: 'chapter', title: 'Cells' })
    a.transact(() => putNode(a, n), SEED)
    a.transact(() => patchNode(a, n.id, { title: 'Mine' }), LOCAL)
    b.transact(() => patchNode(b, n.id, { title: 'Theirs' }), LOCAL)
    undo.undo()
    expect(readNode(a, n.id, MAP)?.title).toBe('Theirs')
    expect(readNode(b, n.id, MAP)?.title).toBe('Theirs')
  })

  it('groups quick changes into one step, across documents', () => {
    const book = new Y.Doc()
    const chapter = new Y.Doc()
    const c = clock()
    const undo = new MapUndo(undefined, c.now)
    undo.track('book', book)
    undo.track('ch', chapter)
    const ch = makeNode({ map_id: MAP, level: 'chapter', title: 'Cells' })
    const sec = makeNode({ map_id: MAP, level: 'section', title: 'Membrane', parent_id: ch.id })
    book.transact(() => putNode(book, ch), SEED)
    chapter.transact(() => putNode(chapter, sec), SEED)

    // Deleting a chapter: one step that touches both documents.
    book.transact(() => removeNode(book, ch.id), LOCAL)
    c.tick(10)
    chapter.transact(() => removeNode(chapter, sec.id), LOCAL)
    expect(readNode(book, ch.id, MAP)).toBeNull()

    undo.undo()
    expect(readNode(book, ch.id, MAP)?.title).toBe('Cells')
    expect(readNode(chapter, sec.id, MAP)?.title).toBe('Membrane')
    expect(undo.canUndo).toBe(false)
    expect(undo.canRedo).toBe(true)
  })

  it('typing letter by letter is one step; a pause starts the next', () => {
    const doc = new Y.Doc()
    const c = clock()
    const undo = new MapUndo(undefined, c.now)
    undo.track('book', doc)
    const n = makeNode({ map_id: MAP, level: 'chapter', title: '' })
    doc.transact(() => putNode(doc, n), SEED)
    for (const t of ['O', 'Os', 'Osm']) {
      doc.transact(() => patchNode(doc, n.id, { title: t }), LOCAL)
      c.tick(100)
    }
    c.tick()
    doc.transact(() => patchNode(doc, n.id, { title: 'Osmosis' }), LOCAL)

    undo.undo()
    expect(readNode(doc, n.id, MAP)?.title).toBe('Osm')
    undo.undo()
    expect(readNode(doc, n.id, MAP)?.title).toBe('')
  })

  it('a new change clears redo in every document', () => {
    const one = new Y.Doc()
    const two = new Y.Doc()
    const c = clock()
    const states: Array<[boolean, boolean]> = []
    const undo = new MapUndo((u, r) => states.push([u, r]), c.now)
    undo.track('one', one)
    undo.track('two', two)
    const x = makeNode({ map_id: MAP, level: 'chapter', title: 'x' })
    const y = makeNode({ map_id: MAP, level: 'chapter', title: 'y' })
    one.transact(() => putNode(one, x), SEED)
    two.transact(() => putNode(two, y), SEED)
    one.transact(() => patchNode(one, x.id, { title: 'x2' }), LOCAL)
    undo.undo()
    expect(undo.canRedo).toBe(true)
    c.tick()
    two.transact(() => patchNode(two, y.id, { title: 'y2' }), LOCAL)
    expect(undo.canRedo).toBe(false)
    expect(undo.redo()).toBe(false)
    expect(readNode(one, x.id, MAP)?.title).toBe('x')
    expect(states.at(-1)).toEqual([true, false])
  })
})
