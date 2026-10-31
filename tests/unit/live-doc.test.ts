import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { makeNode, makeRelation } from '@/ai/pipeline/convert'
import type { NodeRow, RelationRow } from '@/lib/database.types'
import {
  BOOK_DOC,
  LOCAL,
  REMOTE,
  changedIds,
  docKeyOfNode,
  findOrphans,
  isEmptyDoc,
  patchNode,
  putNode,
  putRelation,
  readDoc,
  readNode,
  removeNode,
  seedDoc,
  splitRows,
} from '@/features/workspace/live/mapDoc'
import { parseNode, parseRelation } from '@/features/workspace/live/rows'

const MAP = '9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70'

function bookFixture() {
  const book = makeNode({ map_id: MAP, level: 'book', title: 'Biology' })
  const ch1 = makeNode({
    map_id: MAP,
    level: 'chapter',
    title: 'Cells',
    parent_id: book.id,
    color: 'mint',
  })
  const ch2 = makeNode({
    map_id: MAP,
    level: 'chapter',
    title: 'Genes',
    parent_id: book.id,
    sort_order: 1,
  })
  const sec = makeNode({ map_id: MAP, level: 'section', title: 'Membrane', parent_id: ch1.id })
  const b1 = makeNode({
    map_id: MAP,
    level: 'block',
    title: 'Osmosis',
    parent_id: sec.id,
    type: 'concept',
  })
  const b2 = makeNode({ map_id: MAP, level: 'block', title: 'Diffusion', parent_id: sec.id })
  const b3 = makeNode({ map_id: MAP, level: 'block', title: 'Child', parent_id: b2.id }) // nested block
  const sec2 = makeNode({ map_id: MAP, level: 'section', title: 'DNA', parent_id: ch2.id })
  const b4 = makeNode({ map_id: MAP, level: 'block', title: 'Helix', parent_id: sec2.id })
  const inside = makeRelation({
    map_id: MAP,
    from_node: b1.id,
    to_node: b2.id,
    type: 'contrasts_with',
  })
  const across = makeRelation({ map_id: MAP, from_node: b1.id, to_node: b4.id, type: 'related' })
  return {
    book,
    ch1,
    ch2,
    sec,
    b1,
    b2,
    b3,
    sec2,
    b4,
    inside,
    across,
    nodes: [book, ch1, ch2, sec, b1, b2, b3, sec2, b4],
    relations: [inside, across],
  }
}

/** Two devices that exchange every change (like the Realtime channel). */
function pair() {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on(
    'update',
    (u: Uint8Array, origin: unknown) => origin !== REMOTE && Y.applyUpdate(b, u, REMOTE),
  )
  b.on(
    'update',
    (u: Uint8Array, origin: unknown) => origin !== REMOTE && Y.applyUpdate(a, u, REMOTE),
  )
  return { a, b }
}

/** Syncs two documents that were apart (offline), the way reconnecting does. */
function reconnect(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), REMOTE)
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), REMOTE)
}

const sortById = <T extends { id: string }>(rows: T[]) =>
  [...rows].sort((x, y) => x.id.localeCompare(y.id))
const titles = (doc: Y.Doc) =>
  Object.fromEntries(readDoc(doc, MAP).nodes.map((n) => [n.id, n.title]))

describe('which document a row belongs to', () => {
  it('book and chapters in the book document, the rest with their chapter, links by their blocks', () => {
    const f = bookFixture()
    const split = splitRows({ nodes: f.nodes, relations: f.relations })
    expect([...split.keys()].sort()).toEqual([BOOK_DOC, f.ch1.id, f.ch2.id].sort())
    expect(
      split
        .get(BOOK_DOC)
        ?.nodes.map((n) => n.title)
        .sort(),
    ).toEqual(['Biology', 'Cells', 'Genes'])
    expect(
      split
        .get(f.ch1.id)
        ?.nodes.map((n) => n.title)
        .sort(),
    ).toEqual(['Child', 'Diffusion', 'Membrane', 'Osmosis'])
    expect(
      split
        .get(f.ch2.id)
        ?.nodes.map((n) => n.title)
        .sort(),
    ).toEqual(['DNA', 'Helix'])
    expect(split.get(f.ch1.id)?.relations.map((r) => r.id)).toEqual([f.inside.id])
    expect(split.get(BOOK_DOC)?.relations.map((r) => r.id)).toEqual([f.across.id])
  })

  it("a notes map's root chapter sits in the book document, its content in its own", () => {
    const root = makeNode({ map_id: MAP, level: 'chapter', title: 'Notes' })
    const sec = makeNode({ map_id: MAP, level: 'section', title: 'S', parent_id: root.id })
    const lookup = (id: string) => [root, sec].find((n) => n.id === id)
    expect(docKeyOfNode(root, lookup)).toBe(BOOK_DOC)
    expect(docKeyOfNode(sec, lookup)).toBe(root.id)
    expect(docKeyOfNode({ ...sec, parent_id: crypto.randomUUID() }, lookup)).toBeNull()
  })
})

describe('turning a saved map into documents', () => {
  it('reads back exactly the saved rows', () => {
    const f = bookFixture()
    const docs = new Map<string, Y.Doc>()
    for (const [key, rows] of splitRows({ nodes: f.nodes, relations: f.relations })) {
      const doc = new Y.Doc()
      seedDoc(doc, rows)
      docs.set(key, doc)
    }
    const all = [...docs.values()].map((d) => readDoc(d, MAP))
    expect(sortById(all.flatMap((r) => r.nodes))).toEqual(sortById(f.nodes))
    expect(sortById(all.flatMap((r) => r.relations))).toEqual(sortById(f.relations))
  })

  it('two devices converting the same map at once end up with one copy, not two', () => {
    const f = bookFixture()
    const rows = splitRows({ nodes: f.nodes, relations: f.relations }).get(f.ch1.id)!
    // Yjs breaks ties by random client ids, so repeat to cover both orders.
    for (let i = 0; i < 40; i++) {
      const a = new Y.Doc()
      const b = new Y.Doc()
      seedDoc(a, rows)
      seedDoc(b, rows)
      patchNode(a, f.b1.id, { title: 'Osmosis (edited)' }) // someone starts editing right away
      patchNode(b, f.b2.id, { summary: 'Edited on B' })
      reconnect(a, b)
      expect(readDoc(a, MAP).nodes).toHaveLength(4)
      expect(titles(a)).toEqual(titles(b))
      expect(readNode(b, f.b1.id, MAP)?.title).toBe('Osmosis (edited)')
      expect(readNode(a, f.b2.id, MAP)?.summary).toBe('Edited on B')
    }
  })

  it('converting different copies of a map merges them field by field (no broken document)', () => {
    const f = bookFixture()
    for (let i = 0; i < 20; i++) {
      const a = new Y.Doc()
      const b = new Y.Doc()
      seedDoc(a, { nodes: [f.sec, f.b1], relations: [] })
      seedDoc(b, { nodes: [f.sec, { ...f.b1, title: 'Newer' }], relations: [] })
      reconnect(a, b)
      expect(readDoc(a, MAP).nodes).toHaveLength(2)
      expect(titles(a)).toEqual(titles(b))
    }
  })
})

describe('two people editing at the same time', () => {
  it('different fields of the same block are both kept', () => {
    const f = bookFixture()
    const { a, b } = pair()
    seedDoc(a, { nodes: [f.b1], relations: [] })
    // Offline from each other while editing:
    const a2 = new Y.Doc()
    const b2 = new Y.Doc()
    Y.applyUpdate(a2, Y.encodeStateAsUpdate(a))
    Y.applyUpdate(b2, Y.encodeStateAsUpdate(b))
    a2.transact(() => patchNode(a2, f.b1.id, { title: 'Osmosis!' }), LOCAL)
    b2.transact(
      () => patchNode(b2, f.b1.id, { summary: 'Water through a membrane', importance: 'core' }),
      LOCAL,
    )
    reconnect(a2, b2)
    for (const d of [a2, b2]) {
      const n = readNode(d, f.b1.id, MAP)!
      expect(n.title).toBe('Osmosis!')
      expect(n.summary).toBe('Water through a membrane')
      expect(n.importance).toBe('core')
    }
  })

  it('the same field: both devices agree on one of the two values', () => {
    const f = bookFixture()
    const a = new Y.Doc()
    seedDoc(a, { nodes: [f.b1], relations: [] })
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    patchNode(a, f.b1.id, { title: 'From A' })
    patchNode(b, f.b1.id, { title: 'From B' })
    reconnect(a, b)
    const ta = readNode(a, f.b1.id, MAP)?.title
    expect(['From A', 'From B']).toContain(ta)
    expect(readNode(b, f.b1.id, MAP)?.title).toBe(ta)
  })

  it('live: every change shows up on the other device', () => {
    const f = bookFixture()
    const { a, b } = pair()
    seedDoc(a, { nodes: [f.sec, f.b1], relations: [] })
    expect(readDoc(b, MAP).nodes).toHaveLength(2)
    const added = makeNode({
      map_id: MAP,
      level: 'block',
      title: 'Active transport',
      parent_id: f.sec.id,
    })
    b.transact(() => putNode(b, added), LOCAL)
    expect(readNode(a, added.id, MAP)?.title).toBe('Active transport')
    a.transact(() => removeNode(a, f.b1.id), LOCAL)
    expect(readNode(b, f.b1.id, MAP)).toBeNull()
  })

  it('deleting wins: a block edited while someone deleted it stays deleted', () => {
    const f = bookFixture()
    const a = new Y.Doc()
    seedDoc(a, { nodes: [f.sec, f.b1], relations: [] })
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    removeNode(a, f.b1.id)
    patchNode(b, f.b1.id, { title: 'Still here?' })
    reconnect(a, b)
    expect(readNode(a, f.b1.id, MAP)).toBeNull()
    expect(readNode(b, f.b1.id, MAP)).toBeNull()
    expect(readDoc(b, MAP).nodes.map((n) => n.id)).toEqual([f.sec.id])
  })

  it('deleting a section while someone adds and edits blocks inside it: those blocks go too', () => {
    const f = bookFixture()
    const rows = splitRows({ nodes: f.nodes, relations: f.relations })
    const a = new Y.Doc()
    seedDoc(a, rows.get(f.ch1.id)!)
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    // A deletes the section (and, like the app does, everything below it and its links).
    a.transact(() => {
      for (const n of [f.sec, f.b1, f.b2, f.b3]) removeNode(a, n.id)
    }, LOCAL)
    // B, offline, adds a block under the section and edits a block in it.
    const added = makeNode({ map_id: MAP, level: 'block', title: 'New', parent_id: f.sec.id })
    b.transact(() => {
      putNode(b, added)
      patchNode(b, f.b2.id, { title: 'Edited' })
    }, LOCAL)
    reconnect(a, b)
    const book = readDoc(new Y.Doc(), MAP) // empty: the chapter node lives in the book document
    const loaded = (d: Y.Doc) => {
      const r = readDoc(d, MAP)
      return { nodes: [...r.nodes, ...book.nodes, f.book, f.ch1], relations: r.relations }
    }
    const orphans = findOrphans(loaded(b))
    expect(orphans.nodes).toEqual([added.id])
    expect(orphans.relations).toEqual([f.inside.id])
    // Whoever notices removes them; both devices end up with an empty chapter.
    b.transact(() => {
      orphans.nodes.forEach((id) => removeNode(b, id))
    }, LOCAL)
    reconnect(a, b)
    expect(readDoc(a, MAP).nodes).toEqual([])
    expect(readDoc(b, MAP).nodes).toEqual([])
  })

  it('a link between chapters is only judged when both chapters are loaded', () => {
    const f = bookFixture()
    const rows = { nodes: [f.book, f.ch1, f.ch2, f.sec, f.b1], relations: [f.across] }
    expect(findOrphans(rows).relations).toEqual([f.across.id])
    expect(findOrphans(rows, () => false).relations).toEqual([])
  })

  it('reports which nodes and links a change touched', () => {
    const f = bookFixture()
    const doc = new Y.Doc()
    seedDoc(doc, { nodes: [f.b1, f.b2], relations: [f.inside] })
    const log: Array<ReturnType<typeof changedIds>> = []
    doc.on('afterTransaction', (tr: Y.Transaction) => {
      log.push(changedIds(tr))
    })
    doc.transact(() => {
      patchNode(doc, f.b1.id, { title: 'x' })
      putRelation(doc, { ...f.inside, label: 'vs' })
    }, LOCAL)
    expect(log).toEqual([{ nodes: new Set([f.b1.id]), relations: new Set([f.inside.id]) }])
    patchNode(doc, f.b2.id, { title: f.b2.title }) // no real change: nothing written
    expect(log.slice(1).every((c) => c.nodes.size === 0)).toBe(true)
  })

  it('knows an empty document', () => {
    const f = bookFixture()
    const doc = new Y.Doc()
    expect(isEmptyDoc(doc)).toBe(true)
    putNode(doc, f.b1)
    expect(isEmptyDoc(doc)).toBe(false)
    removeNode(doc, f.b1.id)
    expect(isEmptyDoc(doc)).toBe(true)
  })
})

describe('content from other devices is untrusted', () => {
  it('bad field values fall back to safe defaults; identity must be valid', () => {
    const f = bookFixture()
    const bad = {
      ...f.b1,
      title: 42,
      importance: 'huge',
      position: { x: 'left' },
      details: [
        { kind: 'text', text: 'ok' },
        { kind: 'script', src: 'x' },
        { kind: 'bullet', text: 7 },
      ],
      source: 'P1',
      collapsed: 'yes',
      evil: '<img onerror=alert(1)>',
    }
    const n = parseNode(bad, MAP) as NodeRow & { evil?: string }
    expect(n.title).toBe('')
    expect(n.importance).toBe('supporting')
    expect(n.position).toBeNull()
    expect(n.details).toEqual([{ kind: 'text', text: 'ok' }])
    expect(n.source).toEqual({ paragraphs: [] })
    expect(n.collapsed).toBe(false)
    expect(n.evil).toBeUndefined()
    expect(parseNode({ ...f.b1, id: 'not-an-id' }, MAP)).toBeNull()
    expect(parseNode({ ...f.b1, level: 'galaxy' }, MAP)).toBeNull()
    expect(parseNode({ ...f.b1, map_id: crypto.randomUUID() }, MAP)).toBeNull() // another map
    expect(parseNode({ title: 'only a title' }, MAP)).toBeNull() // a deleted node someone edited
  })

  it('links: unknown types become "related"; a link to itself is ignored', () => {
    const f = bookFixture()
    const r = parseRelation({ ...f.inside, type: 'hates', label: 9 }, MAP) as RelationRow
    expect(r.type).toBe('related')
    expect(r.label).toBe('')
    expect(parseRelation({ ...f.inside, to_node: f.inside.from_node }, MAP)).toBeNull()
  })

  it('a row stored under another name is ignored', () => {
    const f = bookFixture()
    const doc = new Y.Doc()
    doc.getMap(`n:${f.b2.id}`).set('id', f.b1.id)
    for (const [k, v] of Object.entries(f.b1)) if (k !== 'id') doc.getMap(`n:${f.b2.id}`).set(k, v)
    expect(readDoc(doc, MAP).nodes).toEqual([])
  })
})
