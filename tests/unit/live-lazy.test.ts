import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { makeNode } from '@/ai/pipeline/convert'
import type { MapRow, NodeRow } from '@/lib/database.types'

// Book maps open with the book document only; chapters load when shown or edited (Phase 6.5).
// The server (doc_load / doc_push) and the readable copy are in memory here.

const MAP = '9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70'
const USER = '1f0e7c3a-2b4d-4e6f-8a9b-0c1d2e3f4a5b'

const server = {
  docs: new Map<string, Uint8Array[]>(),
  loads: [] as string[][],
}
let savedRows: NodeRow[] = []

vi.mock('@/features/workspace/live/transport', () => ({
  supabaseDocStore: {
    load: async (_map: string, keys: string[]) => {
      server.loads.push(keys)
      return keys
        .filter((k) => server.docs.has(k))
        .map((k) => ({ key: k, state: null, updates: server.docs.get(k) ?? [], upto: 0 }))
    },
    push: async (_map: string, key: string, update: Uint8Array) => {
      server.docs.set(key, [...(server.docs.get(key) ?? []), update])
      return 1
    },
    compact: async () => true,
  },
  openSupabaseChannel: undefined, // no Realtime here: saving covers it
}))
vi.mock('@/features/workspace/live/docCache', () => ({
  dexieDocCache: { load: async () => new Map(), save: async () => undefined },
}))
vi.mock('@/features/workspace/mapRepo', () => ({
  MapNotFoundError: class extends Error {},
  fetchMap: async () => ({
    map: { id: MAP, type: 'book', title: 'Biology' } as MapRow,
    nodes: savedRows,
    relations: [],
    sources: [],
    role: 'owner',
  }),
  readCachedMap: async () => undefined,
  cacheMap: async () => undefined,
  saveNodes: async () => undefined,
  deleteNodes: async () => undefined,
  saveRelations: async () => undefined,
  deleteRelations: async () => undefined,
}))

const { useWorkspace } = await import('@/features/workspace/workspaceStore')
const { putNode, readNode } = await import('@/features/workspace/live/mapDoc')

function book() {
  const root = makeNode({ map_id: MAP, level: 'book', title: 'Biology' })
  const ch1 = makeNode({ map_id: MAP, level: 'chapter', title: 'Cells', parent_id: root.id })
  const ch2 = makeNode({ map_id: MAP, level: 'chapter', title: 'Genes', parent_id: root.id })
  const sec1 = makeNode({ map_id: MAP, level: 'section', title: 'Membrane', parent_id: ch1.id })
  const b1 = makeNode({ map_id: MAP, level: 'block', title: 'Osmosis', parent_id: sec1.id })
  const sec2 = makeNode({ map_id: MAP, level: 'section', title: 'DNA', parent_id: ch2.id })
  return { root, ch1, ch2, sec1, b1, sec2 }
}

/** A document as the server would hold it, made from rows. */
function serverDoc(rows: NodeRow[]): Uint8Array[] {
  const doc = new Y.Doc()
  doc.transact(() => rows.forEach((r) => putNode(doc, r)))
  return [Y.encodeStateAsUpdate(doc)]
}

function decode(key: string): Y.Doc {
  const doc = new Y.Doc()
  for (const u of server.docs.get(key) ?? []) Y.applyUpdate(doc, u)
  return doc
}

describe('lazy book maps', () => {
  it('opens with the book document only, loads chapters when shown or edited', async () => {
    const { root, ch1, ch2, sec1, b1, sec2 } = book()
    // A block the readable copy still has but the live document already deleted.
    const gone = makeNode({ map_id: MAP, level: 'block', title: 'Gone', parent_id: sec1.id })
    savedRows = [root, ch1, ch2, sec1, b1, gone, sec2]
    server.docs.clear()
    server.loads = []
    server.docs.set('book', serverDoc([root, ch1, ch2]))
    server.docs.set(ch1.id, serverDoc([sec1, b1]))

    const ws = useWorkspace.getState()
    await ws.load(MAP, USER)
    expect(useWorkspace.getState().status).toBe('ready')
    expect(server.loads).toEqual([['book']])
    // Not loaded yet: shown from the readable copy, including the stale block.
    expect(Object.keys(useWorkspace.getState().nodes)).toHaveLength(7)

    // Editing a block of an unloaded chapter loads the chapter first, then applies the edit.
    useWorkspace.getState().updateNode(b1.id, { title: 'Osmosis!' })
    await vi.waitFor(() => expect(useWorkspace.getState().nodes[b1.id]?.title).toBe('Osmosis!'))
    expect(server.loads).toContainEqual([ch1.id])
    expect(useWorkspace.getState().nodes[gone.id]).toBeUndefined() // the document wins
    await vi.waitFor(() => expect(readNode(decode(ch1.id), b1.id, MAP)?.title).toBe('Osmosis!'), {
      timeout: 3000,
    })

    // A chapter that comes on screen: never saved as a document, so it is converted.
    useWorkspace.getState().showChapters([ch2.id])
    await vi.waitFor(() => expect(server.loads).toContainEqual([ch2.id]))
    await vi.waitFor(() => expect(readNode(decode(ch2.id), sec2.id, MAP)?.title).toBe('DNA'), {
      timeout: 3000,
    })
    // Asking again loads nothing more.
    const before = server.loads.length
    useWorkspace.getState().showChapters([ch1.id, ch2.id])
    useWorkspace.getState().select(b1.id)
    await new Promise((r) => setTimeout(r, 20))
    expect(server.loads).toHaveLength(before)

    useWorkspace.getState().reset()
  })
})
