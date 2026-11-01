import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { makeNode } from '@/ai/pipeline/convert'
import type { MapRow, NodeRow } from '@/lib/database.types'

// Regression (2026-11-01): building a chapter of a book (books open chapters lazily) wrote the
// outline into a chapter document that was not open yet, so the sections reached the map only
// after the details pass had already looked for them; every section was skipped, the build
// never finished, and Stop reported the sections as saved while no blocks were made.

const MAP = '9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70'
const USER = '1f0e7c3a-2b4d-4e6f-8a9b-0c1d2e3f4a5b'
const server = new Map<string, Uint8Array[]>()
let savedRows: NodeRow[] = []
let mapType: MapRow['type'] = 'book'

vi.mock('@/features/workspace/live/transport', () => ({
  supabaseDocStore: {
    load: async (_m: string, keys: string[]) => {
      // A real round trip: the chapter is not open immediately.
      await new Promise((r) => setTimeout(r, 30))
      return keys
        .filter((k) => server.has(k))
        .map((k) => ({ key: k, state: null, updates: server.get(k) ?? [], upto: 0 }))
    },
    push: async (_m: string, key: string, u: Uint8Array) => {
      server.set(key, [...(server.get(key) ?? []), u])
      return 1
    },
    compact: async () => true,
  },
  openSupabaseChannel: undefined,
}))
vi.mock('@/features/workspace/live/docCache', () => ({
  dexieDocCache: { load: async () => new Map(), save: async () => undefined },
}))
vi.mock('@/features/workspace/mapRepo', () => ({
  MapNotFoundError: class extends Error {},
  fetchMap: async () => ({
    map: { id: MAP, type: mapType, title: 'Biology' } as MapRow,
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
vi.mock('@/ai/jobs', () => ({ startJob: async () => null, finishJob: async () => undefined }))
vi.mock('@/features/workspace/linksStore', () => ({
  useLinks: {
    getState: () => ({ run: async () => undefined, stop: () => undefined, reset: () => undefined }),
  },
}))
// The student's AI: an outline with two sections, then blocks for each section.
vi.mock('@/ai/providers', () => ({
  createAdapter: () => ({
    provider: 'gemini',
    model: 'fake',
    generate: async (req: { jsonSchema: { properties?: Record<string, unknown> } }) => {
      const outline = Boolean(req.jsonSchema.properties?.sections)
      const text = outline
        ? {
            sections: [
              {
                title: 'Membranes',
                summary: 'Cell borders',
                shape: 'tree',
                paragraphs: { from: 1, to: 2 },
                subsections: [],
              },
              {
                title: 'Transport',
                summary: 'Moving things',
                shape: 'tree',
                paragraphs: { from: 3, to: 4 },
                subsections: [],
              },
            ],
          }
        : {
            blocks: [
              {
                key: 'b1',
                parent: null,
                title: 'Osmosis',
                summary: 'Water moves',
                type: 'concept',
                importance: 'core',
                details: [],
                source: [1],
                added: false,
              },
            ],
            relations: [],
            flashcards: [],
          }
      return { text: JSON.stringify(text), tokensIn: 10, tokensOut: 10 }
    },
  }),
}))

const { useWorkspace } = await import('@/features/workspace/workspaceStore')
const { useBuild } = await import('@/features/workspace/buildStore')
const { putNode } = await import('@/features/workspace/live/mapDoc')

describe('building a chapter of a book', () => {
  it('puts the sections on the map, builds their blocks and finishes', async () => {
    const book = makeNode({ map_id: MAP, level: 'book', title: 'Biology' })
    const ch = makeNode({ map_id: MAP, level: 'chapter', title: 'Cells', parent_id: book.id })
    savedRows = [book, ch]
    const doc = new Y.Doc()
    doc.transact(() => [book, ch].forEach((n) => putNode(doc, n)))
    server.set('book', [Y.encodeStateAsUpdate(doc)])

    await useWorkspace.getState().load(MAP, USER)
    expect(useWorkspace.getState().status).toBe('ready')

    await useBuild.getState().start(
      {
        mapId: MAP,
        rootId: ch.id,
        title: 'Cells',
        paragraphs: [1, 2, 3, 4].map((n) => ({ n, text: `Paragraph ${n} about cells.` })),
        sourceLanguage: 'en',
        explanationLanguage: 'en',
        detailLevel: 'standard',
      },
      { provider: 'gemini', apiKey: 'test', model: 'fake' } as never,
    )

    expect(useBuild.getState().phase).toBe('done')
    const nodes = Object.values(useWorkspace.getState().nodes)
    expect(nodes.filter((n) => n.level === 'section' && n.parent_id === ch.id)).toHaveLength(2)
    expect(nodes.filter((n) => n.level === 'block').map((n) => n.title)).toEqual([
      'Osmosis',
      'Osmosis',
    ])
    useBuild.getState().clear()
    useWorkspace.getState().reset()
  })
})

describe('building a notes map from pasted text', () => {
  it('puts the sections on the map, builds their blocks and finishes', async () => {
    // As createMap() makes it: a new map with only its root saved, no live documents yet.
    mapType = 'notes'
    server.clear()
    const root = makeNode({ map_id: MAP, level: 'chapter', title: 'Lecture 4' })
    savedRows = [root]

    await useWorkspace.getState().load(MAP, USER)
    expect(useWorkspace.getState().status).toBe('ready')
    expect(useWorkspace.getState().role).toBe('owner')

    await useBuild.getState().start(
      {
        mapId: MAP,
        rootId: root.id,
        title: 'Lecture 4',
        paragraphs: [1, 2, 3, 4].map((n) => ({ n, text: `Paragraph ${n} about cells.` })),
        sourceLanguage: 'en',
        explanationLanguage: 'en',
        detailLevel: 'standard',
      },
      { provider: 'gemini', apiKey: 'test', model: 'fake' } as never,
    )

    expect(useBuild.getState().phase).toBe('done')
    const nodes = Object.values(useWorkspace.getState().nodes)
    expect(nodes.filter((n) => n.level === 'section' && n.parent_id === root.id)).toHaveLength(2)
    expect(nodes.filter((n) => n.level === 'block')).toHaveLength(2)
    useBuild.getState().clear()
    useWorkspace.getState().reset()
  })
})