import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { makeNode, makeRelation } from '@/ai/pipeline/convert'
import type { DocCache } from '@/features/workspace/live/docCache'
import { LiveMap, type LiveChange } from '@/features/workspace/live/liveMap'
import {
  BOOK_DOC,
  patchNode,
  putNode,
  readNode,
  splitRows,
} from '@/features/workspace/live/mapDoc'
import type {
  ChannelFactory,
  ChannelStatus,
  DocStore,
  LiveMessage,
} from '@/features/workspace/live/transport'

const MAP = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'

/** The server: saved changes and merged states, like doc_load / doc_push / doc_compact. */
class FakeServer implements DocStore {
  online = true
  next = 1
  docs = new Map<string, { state: Uint8Array | null; upto: number; updates: Array<{ id: number; data: Uint8Array }> }>()
  pushes = 0
  private doc(key: string) {
    let d = this.docs.get(key)
    if (!d) this.docs.set(key, (d = { state: null, upto: 0, updates: [] }))
    return d
  }
  async load(_map: string, keys: string[]) {
    if (!this.online) throw new Error('offline')
    return keys.flatMap((key) => {
      const d = this.docs.get(key)
      if (!d) return []
      return [{ key, state: d.state, updates: d.updates.map((u) => u.data), upto: Math.max(d.upto, ...d.updates.map((u) => u.id)) }]
    })
  }
  async push(_map: string, key: string, update: Uint8Array) {
    if (!this.online) throw new Error('offline')
    this.pushes++
    const id = this.next++
    this.doc(key).updates.push({ id, data: update })
    return id
  }
  async compact(_map: string, key: string, state: Uint8Array, upto: number) {
    if (!this.online) throw new Error('offline')
    const d = this.doc(key)
    if (d.upto >= upto) return false
    d.state = state
    d.upto = upto
    d.updates = d.updates.filter((u) => u.id > upto)
    return true
  }
  /** What someone opening the map now would see. */
  read(key: string, id: string) {
    const doc = new Y.Doc()
    const d = this.docs.get(key)
    for (const u of d ? [d.state, ...d.updates.map((x) => x.data)] : []) if (u) Y.applyUpdate(doc, u)
    return readNode(doc, id, MAP)
  }
}

/** The Realtime channel: delivers each message to every other device that has joined. */
class FakeHub {
  members = new Map<number, { onMessage: (m: LiveMessage) => void; onStatus: (s: ChannelStatus) => void; joined: boolean }>()
  sent: LiveMessage[] = []
  private seq = 0
  factory(): ChannelFactory {
    return (_map, onMessage, onStatus) => {
      const id = ++this.seq
      const me = { onMessage, onStatus, joined: false }
      this.members.set(id, me)
      queueMicrotask(() => this.join(id))
      return {
        send: (m) => {
          if (!me.joined) return false
          this.sent.push(m)
          const copy = JSON.parse(JSON.stringify(m)) as LiveMessage
          for (const [other, o] of this.members) if (other !== id && o.joined) queueMicrotask(() => o.onMessage(copy))
          return true
        },
        close: () => this.members.delete(id),
      }
    }
  }
  join(id: number) {
    const m = this.members.get(id)
    if (!m) return
    m.joined = true
    m.onStatus('live')
  }
  drop(id: number) {
    const m = this.members.get(id)
    if (!m) return
    m.joined = false
    m.onStatus('offline')
  }
}

class MemoryCache implements DocCache {
  data = new Map<string, Uint8Array>()
  async load() {
    return new Map(this.data)
  }
  async save(...[, , key, state]: Parameters<DocCache['save']>) {
    this.data.set(key, state)
  }
}

function fixture() {
  const book = makeNode({ map_id: MAP, level: 'book', title: 'Biology' })
  const ch = makeNode({ map_id: MAP, level: 'chapter', title: 'Cells', parent_id: book.id })
  const sec = makeNode({ map_id: MAP, level: 'section', title: 'Membrane', parent_id: ch.id })
  const block = makeNode({ map_id: MAP, level: 'block', title: 'Osmosis', parent_id: sec.id })
  const rel = makeRelation({ map_id: MAP, from_node: sec.id, to_node: block.id })
  const rows = splitRows({ nodes: [book, ch, sec, block], relations: [rel] })
  return { book, ch, sec, block, rel, rows, keys: [BOOK_DOC, ch.id] }
}

function device(server: DocStore, hub: FakeHub | null, canEdit = true, cache?: DocCache) {
  const changes: LiveChange[] = []
  const statuses: ChannelStatus[] = []
  const live = new LiveMap(MAP, 'user', canEdit, { store: server, cache, channel: hub?.factory() }, {
    onChange: (c) => changes.push(c),
    onStatus: (s) => statuses.push(s),
  })
  return { live, changes, statuses }
}

const settle = () => vi.advanceTimersByTimeAsync(3000)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('opening a map', () => {
  it('an old map is converted once and saved; the next person loads it from the server', async () => {
    const server = new FakeServer()
    const f = fixture()
    const a = device(server, null)
    await a.live.load(f.keys, f.rows)
    expect(readNode(a.live.docs.get(f.ch.id)!, f.block.id, MAP)?.title).toBe('Osmosis')
    await settle()
    expect(server.read(f.ch.id, f.block.id)?.title).toBe('Osmosis')
    const pushes = server.pushes

    const b = device(server, null)
    await b.live.load(f.keys, f.rows)
    await settle()
    expect(server.pushes).toBe(pushes) // nothing converted or saved again
    expect(b.live.rows().nodes).toHaveLength(4)
    expect(b.live.rows().relations).toHaveLength(1)
  })

  it('a viewer of an old map sees it but saves nothing', async () => {
    const server = new FakeServer()
    const f = fixture()
    const v = device(server, null, false)
    await v.live.load(f.keys, f.rows)
    await settle()
    expect(v.live.rows().nodes).toHaveLength(4)
    expect(server.pushes).toBe(0)
  })

  it('without the server and without a device copy, opening fails', async () => {
    const server = new FakeServer()
    server.online = false
    const f = fixture()
    await expect(device(server, null).live.load(f.keys, f.rows)).rejects.toThrow('offline')
  })
})

describe('two people on the same map', () => {
  async function twoDevices() {
    const server = new FakeServer()
    const hub = new FakeHub()
    const f = fixture()
    const a = device(server, hub)
    await a.live.load(f.keys, f.rows)
    await settle()
    const b = device(server, hub)
    await b.live.load(f.keys, f.rows)
    await settle()
    return { server, hub, f, a, b }
  }

  it("each sees the other's changes within a moment, and they are saved", async () => {
    const { server, f, a, b } = await twoDevices()
    a.live.write(f.ch.id, (d) => patchNode(d, f.block.id, { title: 'Osmosis (A)' }))
    b.live.write(f.ch.id, (d) => patchNode(d, f.sec.id, { summary: 'From B' }))
    await vi.advanceTimersByTimeAsync(200) // sent, not yet saved
    expect(readNode(b.live.docs.get(f.ch.id)!, f.block.id, MAP)?.title).toBe('Osmosis (A)')
    expect(readNode(a.live.docs.get(f.ch.id)!, f.sec.id, MAP)?.summary).toBe('From B')
    await settle()
    expect(server.read(f.ch.id, f.block.id)?.title).toBe('Osmosis (A)')
    expect(server.read(f.ch.id, f.sec.id)?.summary).toBe('From B')
    expect(b.changes.some((c) => c.nodes.has(f.block.id) && c.origin !== 'load')).toBe(true)
  })

  it('typing is sent in batches, not one message per key press', async () => {
    const { hub, f, a } = await twoDevices()
    const before = hub.sent.length
    for (const ch of 'Osmosis is passive') {
      a.live.write(f.ch.id, (d) => {
        const cur = readNode(d, f.block.id, MAP)!
        patchNode(d, f.block.id, { summary: cur.summary + ch })
      })
      await vi.advanceTimersByTimeAsync(30)
    }
    await settle()
    const updates = hub.sent.slice(before).filter((m) => m.t === 'u')
    expect(updates.length).toBeLessThanOrEqual(5)
  })

  it('a viewer follows along but never sends or saves', async () => {
    const { server, hub, f, a } = await twoDevices()
    const v = device(server, hub, false)
    await v.live.load(f.keys, f.rows)
    await settle()
    const sent = hub.sent.length
    const pushes = server.pushes
    a.live.write(f.ch.id, (d) => patchNode(d, f.block.id, { title: 'Seen by the viewer' }))
    await settle()
    expect(readNode(v.live.docs.get(f.ch.id)!, f.block.id, MAP)?.title).toBe('Seen by the viewer')
    expect(hub.sent.slice(sent).every((m) => m.t === 'u')).toBe(true) // only A's change
    expect(server.pushes).toBe(pushes + 1)
  })

  it('missed messages are caught up when the connection comes back', async () => {
    const { hub, f, a, b } = await twoDevices()
    const bId = [...hub.members.keys()][1]!
    hub.drop(bId)
    a.live.write(f.ch.id, (d) => patchNode(d, f.block.id, { title: 'While B was away' }))
    await settle()
    expect(readNode(b.live.docs.get(f.ch.id)!, f.block.id, MAP)?.title).toBe('Osmosis')
    hub.join(bId)
    await settle()
    expect(readNode(b.live.docs.get(f.ch.id)!, f.block.id, MAP)?.title).toBe('While B was away')
  })

  it('a change too large for one message is saved and then loaded by the others', async () => {
    const { f, a, b, hub } = await twoDevices()
    const big = 'x'.repeat(400) // 400 blocks of 400 chars ≈ 160 KB → more than one message allows
    a.live.write(f.ch.id, (d) => {
      for (let i = 0; i < 400; i++)
        putNode(d, makeNode({ map_id: MAP, level: 'block', title: `B${i}`, summary: big, parent_id: f.sec.id }))
    })
    await settle()
    expect(hub.sent.some((m) => m.t === 'pull')).toBe(true)
    expect(b.live.rows().nodes.length).toBe(404)
  })

  it('the first block of a new chapter reaches people who did not have that chapter yet', async () => {
    const { f, a, b } = await twoDevices()
    const ch2 = makeNode({ map_id: MAP, level: 'chapter', title: 'Genes', parent_id: f.book.id })
    const blk = makeNode({ map_id: MAP, level: 'block', title: 'Helix', parent_id: ch2.id })
    a.live.write(BOOK_DOC, (d) => putNode(d, ch2))
    a.live.write(ch2.id, (d) => putNode(d, blk))
    await settle()
    expect(b.live.docs.has(ch2.id)).toBe(true)
    expect(readNode(b.live.docs.get(ch2.id)!, blk.id, MAP)?.title).toBe('Helix')
  })

  it('saved changes are merged now and then; a later visitor still gets everything', async () => {
    const { server, f, a } = await twoDevices()
    for (let i = 0; i < 110; i++) {
      a.live.write(f.ch.id, (d) => patchNode(d, f.block.id, { summary: `v${i}` }))
      await vi.advanceTimersByTimeAsync(900)
    }
    await settle()
    const saved = server.docs.get(f.ch.id)!
    expect(saved.state).not.toBeNull()
    expect(saved.updates.length).toBeLessThan(20)
    const c = device(server, null)
    await c.live.load(f.keys, f.rows)
    expect(readNode(c.live.docs.get(f.ch.id)!, f.block.id, MAP)?.summary).toBe('v109')
  })
})

describe('offline', () => {
  it('edits made offline are kept on the device and saved when the connection is back', async () => {
    const server = new FakeServer()
    const hub = new FakeHub()
    const cache = new MemoryCache()
    const f = fixture()
    const a = device(server, hub, true, cache)
    await a.live.load(f.keys, f.rows)
    await settle()
    a.live.close()
    await settle()

    // Next day, no connection: the map opens from the device copy and can be edited.
    server.online = false
    const a2 = device(server, null, true, cache)
    await a2.live.load(f.keys, f.rows)
    a2.live.write(f.ch.id, (d) => patchNode(d, f.block.id, { title: 'Written on the train' }))
    await settle()
    expect(a2.live.hasUnsaved()).toBe(true)
    await expect(a2.live.whenSaved()).rejects.toThrow()
    a2.live.close()
    await settle()

    // Connection back: opening again saves what was written offline.
    server.online = true
    const a3 = device(server, hub, true, cache)
    await a3.live.load(f.keys, f.rows)
    await settle()
    expect(server.read(f.ch.id, f.block.id)?.title).toBe('Written on the train')
  })

  it('a session that loses the connection saves its changes once it is back', async () => {
    const server = new FakeServer()
    const hub = new FakeHub()
    const f = fixture()
    const a = device(server, hub)
    await a.live.load(f.keys, f.rows)
    await settle()
    server.online = false
    a.live.write(f.ch.id, (d) => patchNode(d, f.block.id, { title: 'Offline edit' }))
    await settle()
    expect(server.read(f.ch.id, f.block.id)?.title).toBe('Osmosis')
    server.online = true
    await vi.advanceTimersByTimeAsync(6000) // retry
    expect(server.read(f.ch.id, f.block.id)?.title).toBe('Offline edit')
    await expect(a.live.whenSaved()).resolves.toBeUndefined()
  })
})
