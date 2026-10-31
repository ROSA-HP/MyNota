import { create } from 'zustand'
import type { LinkView, MapRow, NodeRow, RelationRow, SourceRow } from '@/lib/database.types'
import { dexieDocCache } from './live/docCache'
import { LiveMap, type LiveChange } from './live/liveMap'
import {
  BOOK_DOC,
  LOCAL,
  REMOTE,
  SEED,
  docKeyOfNode,
  docKeyOfRelation,
  findOrphans,
  patchNode,
  patchRelation,
  putNode,
  putRelation,
  readNode,
  readRelation,
  removeNode,
  removeRelation,
  splitRows,
  type DocKey,
  type DocRows,
} from './live/mapDoc'
import { openSupabaseChannel, supabaseDocStore, type ChannelStatus } from './live/transport'
import { MapUndo } from './live/undo'
import {
  cacheMap,
  deleteNodes,
  deleteRelations,
  fetchMap,
  MapNotFoundError,
  readCachedMap,
  saveNodes,
  saveRelations,
} from './mapRepo'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'notFound' | 'error'
export type SaveState = 'saved' | 'saving' | 'pending' | 'error'
export type LiveStatus = 'off' | ChannelStatus

const SAVE_DELAY_MS = 700
const RETRY_DELAY_MS = 8000
const ORPHAN_CHECK_MS = 300

/** Removing what concurrent deletes left behind: saved, never undone. */
export const PRUNE = 'mynota:prune'

interface WorkspaceState {
  mapId: string | null
  userId: string | null
  status: LoadStatus
  /** True while showing the IndexedDB copy read-only (no live documents yet). */
  fromCache: boolean
  /** Opened without a connection: editing continues on the device copy (Phase 6). */
  offline: boolean
  liveStatus: LiveStatus
  map: MapRow | null
  role: 'owner' | 'editor' | 'viewer' | null
  nodes: Record<string, NodeRow>
  relations: Record<string, RelationRow>
  sources: SourceRow[]
  selectedId: string | null
  selectedRelationId: string | null
  saveState: SaveState
  /** Undo and redo of this person's own changes (Phase 6.4). */
  canUndo: boolean
  canRedo: boolean

  load: (mapId: string, userId: string) => Promise<void>
  /** A map seen through its share link: read only, nothing is ever saved. */
  showLink: (view: LinkView) => void
  reset: () => void
  canEdit: () => boolean
  select: (id: string | null) => void
  selectRelation: (id: string | null) => void
  addNodes: (nodes: NodeRow[], opts?: { saveNow?: boolean }) => void
  updateNode: (id: string, patch: Partial<NodeRow>) => void
  updateNodes: (patches: Array<{ id: string; patch: Partial<NodeRow> }>) => void
  deleteNode: (id: string) => void
  addRelations: (relations: RelationRow[], opts?: { saveNow?: boolean }) => void
  updateRelation: (id: string, patch: Partial<RelationRow>) => void
  deleteRelation: (id: string) => void
  flush: () => Promise<void>
  undo: () => void
  redo: () => void
}

/**
 * Editing goes into the map's live documents (live/); the store mirrors them for React.
 * The readable copy in Postgres (`nodes`, `relations`) is written from this device's own
 * changes, after the document changes behind them are saved.
 */
let live: LiveMap | null = null
let undoer: MapUndo | null = null
// Ids whose readable copy must be written (upserted, or deleted when gone).
const snapNodes = new Set<string>()
const snapRelations = new Set<string>()
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saving: Promise<void> | null = null
let orphanTimer: ReturnType<typeof setTimeout> | null = null

function descendantsOf(nodes: Record<string, NodeRow>, id: string): string[] {
  const children = new Map<string, string[]>()
  for (const n of Object.values(nodes)) {
    if (!n.parent_id) continue
    const list = children.get(n.parent_id) ?? []
    list.push(n.id)
    children.set(n.parent_id, list)
  }
  const out: string[] = []
  const stack = [id]
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    out.push(cur)
    stack.push(...(children.get(cur) ?? []))
  }
  return out
}

const byId = <T extends { id: string }>(rows: T[]): Record<string, T> =>
  Object.fromEntries(rows.map((r) => [r.id, r]))

/** The document a loaded node or link is in (where it must be changed). */
function docOf(prefix: 'n:' | 'r:', id: string): DocKey | null {
  if (!live) return null
  for (const [key, doc] of live.docs) if (doc.share.has(prefix + id)) return key
  return null
}

/** Fields that make up the readable copy (timestamps and authorship are the server's). */
const SERVER_FIELDS = new Set(['created_by', 'created_at', 'updated_at'])
const readable = (row: NodeRow | RelationRow) =>
  JSON.stringify(Object.entries(row).filter(([k]) => !SERVER_FIELDS.has(k)))
const sameNode = (a: NodeRow, b: NodeRow) => readable(a) === readable(b)
const sameRelation = (a: RelationRow, b: RelationRow) => readable(a) === readable(b)

export const useWorkspace = create<WorkspaceState>((set, get) => {
  function scheduleSave(delay = SAVE_DELAY_MS) {
    set({ saveState: 'pending' })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void get().flush(), delay)
  }

  /** Mirrors a document change into the store (and marks this device's own changes for saving). */
  function onChange(instance: LiveMap, change: LiveChange) {
    if (instance !== live) return
    const doc = instance.docs.get(change.key)
    if (!doc) return
    const mapId = instance.mapId
    let nodes: Record<string, NodeRow> | null = null
    let relations: Record<string, RelationRow> | null = null
    for (const id of change.nodes) {
      const row = readNode(doc, id, mapId)
      if (!row && !(nodes ?? get().nodes)[id]) continue
      nodes ??= { ...get().nodes }
      if (row) nodes[id] = row
      else Reflect.deleteProperty(nodes, id)
    }
    for (const id of change.relations) {
      const row = readRelation(doc, id, mapId)
      if (!row && !(relations ?? get().relations)[id]) continue
      relations ??= { ...get().relations }
      if (row) relations[id] = row
      else Reflect.deleteProperty(relations, id)
    }
    if (nodes || relations) {
      const s = get()
      const patch: Partial<WorkspaceState> = {}
      if (nodes) {
        patch.nodes = nodes
        if (s.selectedId && !nodes[s.selectedId]) patch.selectedId = null
      }
      if (relations) {
        patch.relations = relations
        if (s.selectedRelationId && !relations[s.selectedRelationId]) patch.selectedRelationId = null
      }
      set(patch)
    }
    const own = change.origin !== REMOTE && change.origin !== SEED && change.origin !== 'load'
    if (own && get().canEdit()) {
      change.nodes.forEach((id) => snapNodes.add(id))
      change.relations.forEach((id) => snapRelations.add(id))
      scheduleSave()
    } else if (change.origin === REMOTE) {
      scheduleOrphanCheck()
    }
  }

  /** After others' changes: remove blocks whose section was deleted meanwhile, and their links. */
  function scheduleOrphanCheck() {
    if (orphanTimer || !get().canEdit()) return
    orphanTimer = setTimeout(() => {
      orphanTimer = null
      pruneOrphans()
    }, ORPHAN_CHECK_MS)
  }

  function pruneOrphans() {
    if (!live || !get().canEdit()) return
    const s = get()
    const orphans = findOrphans({
      nodes: Object.values(s.nodes),
      relations: Object.values(s.relations),
    })
    const byDoc = new Map<DocKey, { nodes: string[]; relations: string[] }>()
    const add = (key: DocKey | null, kind: 'nodes' | 'relations', id: string) => {
      if (!key) return
      const b = byDoc.get(key) ?? { nodes: [], relations: [] }
      b[kind].push(id)
      byDoc.set(key, b)
    }
    orphans.nodes.forEach((id) => add(docOf('n:', id), 'nodes', id))
    orphans.relations.forEach((id) => add(docOf('r:', id), 'relations', id))
    for (const [key, b] of byDoc)
      live.write(
        key,
        (d) => {
          b.nodes.forEach((id) => removeNode(d, id))
          b.relations.forEach((id) => removeRelation(d, id))
        },
        PRUNE,
      )
  }

  /** Opens the live documents; returns false when they cannot be opened. */
  async function openLive(
    mapId: string,
    userId: string,
    rows: DocRows,
    role: 'owner' | 'editor' | 'viewer',
  ): Promise<boolean> {
    live?.close()
    undoer?.clear()
    const undo = new MapUndo((canUndo, canRedo) => {
      if (undoer === undo) set({ canUndo, canRedo })
    })
    undoer = undo
    const canEdit = role === 'owner' || role === 'editor'
    const instance: LiveMap = new LiveMap(
      mapId,
      userId,
      canEdit,
      { store: supabaseDocStore, cache: dexieDocCache, channel: openSupabaseChannel },
      {
        onChange: (c) => onChange(instance, c),
        onDoc: (key, doc) => undo.track(key, doc),
        onStatus: (st) => {
          if (instance === live) set({ liveStatus: st })
        },
        onSaving: (pending, failed) => {
          if (instance !== live) return
          if (failed) set({ saveState: 'error' })
          else if (pending && get().saveState === 'saved') set({ saveState: 'pending' })
          else if (!pending && !snapNodes.size && !snapRelations.size && !saving)
            set({ saveState: 'saved' })
        },
      },
    )
    live = instance
    const split = splitRows(rows)
    try {
      await instance.load([...split.keys()], split)
      // The book document may know chapters the readable copy does not have yet.
      const known = new Set(instance.docs.keys())
      const more = instance
        .rows()
        .nodes.filter((n) => n.level === 'chapter' && n.parent_id && !known.has(n.id))
        .map((n) => n.id)
      if (more.length) await instance.load(more, split)
    } catch {
      if (live === instance) {
        instance.close()
        live = null
      }
      return false
    }
    return live === instance
  }

  /** Brings the readable copy in line with the documents (an editor's device does it on open). */
  function healReadableCopy(saved: DocRows) {
    if (!get().canEdit()) return
    const { nodes, relations } = get()
    const savedNodes = byId(saved.nodes)
    const savedRelations = byId(saved.relations)
    for (const n of Object.values(nodes)) {
      const s = savedNodes[n.id]
      if (!s || !sameNode(s, n)) snapNodes.add(n.id)
    }
    for (const id of Object.keys(savedNodes)) if (!nodes[id]) snapNodes.add(id)
    for (const r of Object.values(relations)) {
      const s = savedRelations[r.id]
      if (!s || !sameRelation(s, r)) snapRelations.add(r.id)
    }
    for (const id of Object.keys(savedRelations)) if (!relations[id]) snapRelations.add(id)
    if (snapNodes.size || snapRelations.size) scheduleSave(0)
  }

  /** Groups rows by the document they go into (parents first; unknown parents are skipped). */
  function groupNodes(rows: NodeRow[]): Map<DocKey, NodeRow[]> {
    const batch = new Map(rows.map((r) => [r.id, r]))
    const nodes = get().nodes
    const lookup = (id: string) => batch.get(id) ?? nodes[id]
    const out = new Map<DocKey, NodeRow[]>([[BOOK_DOC, []]])
    for (const r of rows) {
      const key = docOf('n:', r.id) ?? docKeyOfNode(r, lookup)
      if (!key) continue
      const list = out.get(key) ?? []
      list.push(r)
      out.set(key, list)
    }
    return out
  }

  function keyOfRelation(r: Pick<RelationRow, 'from_node' | 'to_node'>): DocKey {
    const nodes = get().nodes
    return docKeyOfRelation(r, (id) => {
      const n = nodes[id]
      return n ? docKeyOfNode(n, (p) => nodes[p]) : null
    })
  }

  return {
    mapId: null,
    userId: null,
    status: 'idle',
    fromCache: false,
    offline: false,
    liveStatus: 'off',
    map: null,
    role: null,
    nodes: {},
    relations: {},
    sources: [],
    selectedId: null,
    selectedRelationId: null,
    saveState: 'saved',
    canUndo: false,
    canRedo: false,

    load: async (mapId, userId) => {
      if (get().mapId === mapId && live) {
        void live.resync()
        return
      }
      get().reset()
      set({ mapId, userId, status: 'loading' })
      const cached = await readCachedMap(mapId, userId)
      if (cached && get().mapId === mapId && get().status === 'loading') {
        set({
          status: 'ready',
          fromCache: true,
          map: cached.map,
          nodes: byId(cached.nodes),
          relations: byId(cached.relations),
          sources: cached.sources,
          role: 'viewer', // read-only until the live documents are open
        })
      }
      let snap: Awaited<ReturnType<typeof fetchMap>> | null = null
      try {
        // Rows first, then the documents: a row change is always saved after its document change,
        // so the documents loaded next are never older than these rows.
        snap = await fetchMap(mapId, userId)
      } catch (e) {
        if (get().mapId !== mapId) return
        if (e instanceof MapNotFoundError) return set({ status: 'notFound' })
      }
      if (get().mapId !== mapId) return

      if (snap) {
        const ok = await openLive(mapId, userId, snap, snap.role)
        if (get().mapId !== mapId) return
        if (!ok) {
          // Documents unavailable: show the saved rows read-only.
          return set({
            status: 'ready',
            fromCache: true,
            map: snap.map,
            role: 'viewer',
            nodes: byId(snap.nodes),
            relations: byId(snap.relations),
            sources: snap.sources,
          })
        }
        const rows = live?.rows() ?? { nodes: [], relations: [] }
        set({
          status: 'ready',
          fromCache: false,
          offline: false,
          map: snap.map,
          role: snap.role,
          nodes: byId(rows.nodes),
          relations: byId(rows.relations),
          sources: snap.sources,
        })
        pruneOrphans()
        healReadableCopy(snap)
        return
      }

      // No connection: continue on the device copy, editing if this device was allowed to.
      if (cached?.role) {
        const ok = await openLive(mapId, userId, cached, cached.role)
        if (get().mapId !== mapId) return
        if (ok) {
          const rows = live?.rows() ?? { nodes: [], relations: [] }
          return set({
            status: 'ready',
            fromCache: false,
            offline: true,
            map: cached.map,
            role: cached.role,
            nodes: byId(rows.nodes),
            relations: byId(rows.relations),
            sources: cached.sources,
          })
        }
      }
      if (get().status !== 'ready') set({ status: 'error' })
      // With a cached copy we stay usable (read-only) while offline.
    },

    showLink: (view) => {
      get().reset()
      const now = view.map.updated_at
      set({
        mapId: view.map.id,
        userId: null,
        status: 'ready',
        fromCache: false,
        map: {
          ...view.map,
          owner_id: '',
          subject_id: null,
          link_access: view.access,
          link_expires_at: null,
          updated_at: now,
        },
        role: 'viewer',
        nodes: byId(view.nodes),
        relations: byId(view.relations),
        sources: view.sources,
      })
    },

    reset: () => {
      if (saveTimer) clearTimeout(saveTimer)
      if (orphanTimer) clearTimeout(orphanTimer)
      saveTimer = null
      orphanTimer = null
      // Unsaved readable-copy rows of the map being left are written by the next editor who
      // opens it (healReadableCopy); the document changes themselves are saved by close().
      snapNodes.clear()
      snapRelations.clear()
      live?.close()
      live = null
      undoer?.clear()
      undoer = null
      set({
        mapId: null,
        status: 'idle',
        fromCache: false,
        offline: false,
        liveStatus: 'off',
        map: null,
        role: null,
        nodes: {},
        relations: {},
        sources: [],
        selectedId: null,
        selectedRelationId: null,
        saveState: 'saved',
        canUndo: false,
        canRedo: false,
      })
    },

    canEdit: () => {
      const r = get().role
      return r === 'owner' || r === 'editor'
    },

    select: (id) => {
      // Editing another block starts a new undo step.
      if (id !== get().selectedId) undoer?.stopCapturing()
      set({ selectedId: id, selectedRelationId: null })
    },
    selectRelation: (id) => set({ selectedRelationId: id, selectedId: null }),

    addNodes: (rows, opts) => {
      if (!rows.length || !live || !get().canEdit()) return
      for (const [key, list] of groupNodes(rows))
        if (list.length) live.write(key, (d) => list.forEach((n) => putNode(d, n)))
      if (opts?.saveNow) scheduleSave(0)
    },

    updateNode: (id, patch) => get().updateNodes([{ id, patch }]),

    updateNodes: (patches) => {
      if (!live || !get().canEdit()) return
      const at = new Date().toISOString()
      const byDoc = new Map<DocKey, typeof patches>()
      for (const p of patches) {
        const key = docOf('n:', p.id)
        if (!key) continue
        byDoc.set(key, [...(byDoc.get(key) ?? []), p])
      }
      for (const [key, list] of byDoc)
        live.write(key, (d) =>
          list.forEach(({ id, patch }) => patchNode(d, id, { ...patch, updated_at: at })),
        )
    },

    deleteNode: (id) => {
      const all = get().nodes
      const target = all[id]
      if (!target || !target.parent_id || !live || !get().canEdit()) return // never the root
      const ids = new Set(descendantsOf(all, id))
      const rels = Object.values(get().relations).filter(
        (r) => ids.has(r.from_node) || ids.has(r.to_node),
      )
      const byDoc = new Map<DocKey, { nodes: string[]; relations: string[] }>()
      const add = (key: DocKey | null, kind: 'nodes' | 'relations', x: string) => {
        if (!key) return
        const b = byDoc.get(key) ?? { nodes: [], relations: [] }
        b[kind].push(x)
        byDoc.set(key, b)
      }
      ids.forEach((n) => add(docOf('n:', n), 'nodes', n))
      rels.forEach((r) => add(docOf('r:', r.id), 'relations', r.id))
      for (const [key, b] of byDoc)
        live.write(key, (d) => {
          b.relations.forEach((r) => removeRelation(d, r))
          b.nodes.forEach((n) => removeNode(d, n))
        })
      scheduleSave(0)
    },

    addRelations: (rows, opts) => {
      if (!rows.length || !live || !get().canEdit()) return
      const byDoc = new Map<DocKey, RelationRow[]>()
      for (const r of rows) {
        const key = docOf('r:', r.id) ?? keyOfRelation(r)
        byDoc.set(key, [...(byDoc.get(key) ?? []), r])
      }
      for (const [key, list] of byDoc) live.write(key, (d) => list.forEach((r) => putRelation(d, r)))
      if (opts?.saveNow) scheduleSave(0)
    },

    updateRelation: (id, patch) => {
      const key = docOf('r:', id)
      if (!key || !live || !get().canEdit()) return
      const at = new Date().toISOString()
      live.write(key, (d) => patchRelation(d, id, { ...patch, updated_at: at }))
    },

    deleteRelation: (id) => {
      const key = docOf('r:', id)
      if (!key || !live || !get().canEdit()) return
      live.write(key, (d) => removeRelation(d, id))
      scheduleSave(0)
    },

    flush: async () => {
      if (saving) {
        await saving
        if (snapNodes.size || snapRelations.size) return get().flush()
        return
      }
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = null
      const instance = live
      const nodeIds = [...snapNodes]
      const relIds = [...snapRelations]
      if (!nodeIds.length && !relIds.length) {
        if (!instance?.hasUnsaved()) set({ saveState: 'saved' })
        return
      }
      nodeIds.forEach((i) => snapNodes.delete(i))
      relIds.forEach((i) => snapRelations.delete(i))
      set({ saveState: 'saving' })

      saving = (async () => {
        try {
          // The document changes first: the readable copy must never be ahead of them.
          await instance?.whenSaved()
          const { nodes, relations, map, sources, userId, role } = get()
          const upNodes = nodeIds.map((i) => nodes[i]).filter((n): n is NodeRow => Boolean(n))
          const goneNodes = nodeIds.filter((i) => !nodes[i])
          const upRels = relIds
            .map((i) => relations[i])
            .filter((r): r is RelationRow => Boolean(r))
          const goneRels = relIds.filter((i) => !relations[i])
          await deleteRelations(goneRels)
          await deleteNodes(goneNodes)
          await saveNodes(upNodes)
          await saveRelations(upRels)
          set({
            saveState:
              snapNodes.size || snapRelations.size || instance?.hasUnsaved() ? 'pending' : 'saved',
          })
          if (map && userId && get().mapId === map.id && role) {
            const s = get()
            void cacheMap(
              {
                map,
                nodes: Object.values(s.nodes),
                relations: Object.values(s.relations),
                sources,
              },
              userId,
              role,
            )
          }
        } catch {
          // Put everything back and try again later (offline, or a transient error).
          if (live !== instance) return
          nodeIds.forEach((i) => snapNodes.add(i))
          relIds.forEach((i) => snapRelations.add(i))
          set({ saveState: 'error' })
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => void get().flush(), RETRY_DELAY_MS)
        }
      })()
      try {
        await saving
      } finally {
        saving = null
      }
    },

    undo: () => {
      if (get().canEdit()) undoer?.undo()
    },
    redo: () => {
      if (get().canEdit()) undoer?.redo()
    },
  }
})

/** For tests and tools: the live documents of the open map. */
export const currentLiveMap = () => live
export { LOCAL }

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void live?.resync()
    void useWorkspace.getState().flush()
  })
  window.addEventListener('beforeunload', (e) => {
    const s = useWorkspace.getState().saveState
    if (s === 'pending' || s === 'saving' || s === 'error' || live?.hasUnsaved()) {
      void live?.saveNow()
      void useWorkspace.getState().flush()
      e.preventDefault()
    }
  })
}
