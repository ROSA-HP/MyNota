import { create } from 'zustand'
import type { LinkView, MapRow, NodeRow, RelationRow, SourceRow } from '@/lib/database.types'
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

const SAVE_DELAY_MS = 700
const RETRY_DELAY_MS = 8000

interface WorkspaceState {
  mapId: string | null
  userId: string | null
  status: LoadStatus
  /** True while showing the IndexedDB copy before the server copy arrives. */
  fromCache: boolean
  map: MapRow | null
  role: 'owner' | 'editor' | 'viewer' | null
  nodes: Record<string, NodeRow>
  relations: Record<string, RelationRow>
  sources: SourceRow[]
  selectedId: string | null
  selectedRelationId: string | null
  saveState: SaveState

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
}

// Pending writes live outside React state: they change on every keystroke.
const dirtyNodes = new Set<string>()
const dirtyRelations = new Set<string>()
const deletedNodes = new Set<string>()
const deletedRelations = new Set<string>()
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saving: Promise<void> | null = null

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

export const useWorkspace = create<WorkspaceState>((set, get) => {
  function scheduleSave(delay = SAVE_DELAY_MS) {
    set({ saveState: 'pending' })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void get().flush(), delay)
  }

  return {
    mapId: null,
    userId: null,
    status: 'idle',
    fromCache: false,
    map: null,
    role: null,
    nodes: {},
    relations: {},
    sources: [],
    selectedId: null,
    selectedRelationId: null,
    saveState: 'saved',

    load: async (mapId, userId) => {
      if (get().mapId !== mapId) {
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
            role: 'viewer', // read-only until the server confirms the role
          })
        }
      }
      try {
        const snap = await fetchMap(mapId, userId)
        if (get().mapId !== mapId) return
        // Keep local edits that have not reached the server yet.
        const nodes = byId(snap.nodes)
        for (const id of dirtyNodes) {
          const local = get().nodes[id]
          if (local) nodes[id] = local
        }
        for (const id of deletedNodes) Reflect.deleteProperty(nodes, id)
        const relations = byId(snap.relations)
        for (const id of dirtyRelations) {
          const local = get().relations[id]
          if (local) relations[id] = local
        }
        for (const id of deletedRelations) Reflect.deleteProperty(relations, id)
        set({
          status: 'ready',
          fromCache: false,
          map: snap.map,
          role: snap.role,
          nodes,
          relations,
          sources: snap.sources,
        })
      } catch (e) {
        if (get().mapId !== mapId) return
        if (e instanceof MapNotFoundError) set({ status: 'notFound' })
        else if (get().status !== 'ready') set({ status: 'error' })
        // With a cached copy we stay usable (read-only) while offline.
      }
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
      dirtyNodes.clear()
      dirtyRelations.clear()
      deletedNodes.clear()
      deletedRelations.clear()
      set({
        mapId: null,
        status: 'idle',
        fromCache: false,
        map: null,
        role: null,
        nodes: {},
        relations: {},
        sources: [],
        selectedId: null,
        selectedRelationId: null,
        saveState: 'saved',
      })
    },

    canEdit: () => {
      const r = get().role
      return r === 'owner' || r === 'editor'
    },

    select: (id) => set({ selectedId: id, selectedRelationId: null }),
    selectRelation: (id) => set({ selectedRelationId: id, selectedId: null }),

    addNodes: (rows, opts) => {
      if (!rows.length) return
      set({ nodes: { ...get().nodes, ...byId(rows) } })
      rows.forEach((n) => dirtyNodes.add(n.id))
      scheduleSave(opts?.saveNow ? 0 : SAVE_DELAY_MS)
    },

    updateNode: (id, patch) => get().updateNodes([{ id, patch }]),

    updateNodes: (patches) => {
      const nodes = { ...get().nodes }
      for (const { id, patch } of patches) {
        const cur = nodes[id]
        if (!cur) continue
        nodes[id] = { ...cur, ...patch, updated_at: new Date().toISOString() }
        dirtyNodes.add(id)
      }
      set({ nodes })
      scheduleSave()
    },

    deleteNode: (id) => {
      const all = get().nodes
      const target = all[id]
      if (!target || !target.parent_id) return // the root cannot be deleted
      const ids = new Set(descendantsOf(all, id))
      const nodes = { ...all }
      ids.forEach((d) => {
        Reflect.deleteProperty(nodes, d)
        dirtyNodes.delete(d)
      })
      deletedNodes.add(id) // children and relations cascade in the database
      const relations = Object.fromEntries(
        Object.entries(get().relations).filter(
          ([, r]) => !ids.has(r.from_node) && !ids.has(r.to_node),
        ),
      )
      Object.keys(get().relations).forEach((rid) => {
        if (!relations[rid]) dirtyRelations.delete(rid)
      })
      const selected = get().selectedId
      set({ nodes, relations, selectedId: selected && ids.has(selected) ? null : selected })
      scheduleSave(0)
    },

    addRelations: (rows, opts) => {
      if (!rows.length) return
      set({ relations: { ...get().relations, ...byId(rows) } })
      rows.forEach((r) => dirtyRelations.add(r.id))
      scheduleSave(opts?.saveNow ? 0 : SAVE_DELAY_MS)
    },

    updateRelation: (id, patch) => {
      const cur = get().relations[id]
      if (!cur) return
      set({
        relations: {
          ...get().relations,
          [id]: { ...cur, ...patch, updated_at: new Date().toISOString() },
        },
      })
      dirtyRelations.add(id)
      scheduleSave()
    },

    deleteRelation: (id) => {
      const relations = { ...get().relations }
      Reflect.deleteProperty(relations, id)
      dirtyRelations.delete(id)
      deletedRelations.add(id)
      set({
        relations,
        selectedRelationId: get().selectedRelationId === id ? null : get().selectedRelationId,
      })
      scheduleSave(0)
    },

    flush: async () => {
      if (saving) {
        await saving
        if (dirtyNodes.size || dirtyRelations.size || deletedNodes.size || deletedRelations.size)
          return get().flush()
        return
      }
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = null
      const { nodes, relations, map, sources, userId } = get()
      const nodeIds = [...dirtyNodes]
      const relIds = [...dirtyRelations]
      const delNodes = [...deletedNodes]
      const delRels = [...deletedRelations]
      if (!nodeIds.length && !relIds.length && !delNodes.length && !delRels.length) {
        set({ saveState: 'saved' })
        return
      }
      nodeIds.forEach((i) => dirtyNodes.delete(i))
      relIds.forEach((i) => dirtyRelations.delete(i))
      delNodes.forEach((i) => deletedNodes.delete(i))
      delRels.forEach((i) => deletedRelations.delete(i))
      set({ saveState: 'saving' })

      saving = (async () => {
        try {
          await deleteRelations(delRels)
          await deleteNodes(delNodes)
          await saveNodes(nodeIds.map((i) => nodes[i]).filter((n): n is NodeRow => Boolean(n)))
          await saveRelations(
            relIds.map((i) => relations[i]).filter((r): r is RelationRow => Boolean(r)),
          )
          set({ saveState: dirtyNodes.size || dirtyRelations.size ? 'pending' : 'saved' })
          const s = get()
          if (map && userId && s.mapId === map.id) {
            void cacheMap(
              {
                map,
                nodes: Object.values(s.nodes),
                relations: Object.values(s.relations),
                sources,
              },
              userId,
            )
          }
        } catch {
          // Put everything back and try again later (offline, or a transient error).
          nodeIds.forEach((i) => dirtyNodes.add(i))
          relIds.forEach((i) => dirtyRelations.add(i))
          delNodes.forEach((i) => deletedNodes.add(i))
          delRels.forEach((i) => deletedRelations.add(i))
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
  }
})

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void useWorkspace.getState().flush())
  window.addEventListener('beforeunload', (e) => {
    const s = useWorkspace.getState().saveState
    if (s === 'pending' || s === 'saving' || s === 'error') {
      void useWorkspace.getState().flush()
      e.preventDefault()
    }
  })
}
