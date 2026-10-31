import { create } from 'zustand'

/** A screen point (client coordinates) to anchor popovers. */
export interface Anchor {
  x: number
  y: number
}

interface CanvasUiState {
  /** Two-click connect mode (touch-friendly fallback): the first node picked, then the second. */
  connecting: boolean
  connectFrom: string | null
  /** The link picker, open on a just-made or existing link. */
  picker: { relationId: string; anchor: Anchor; isNew: boolean } | null
  /** "Link to…" search for one or more source blocks. */
  search: { fromIds: string[]; anchor: Anchor } | null
  /** Extra blocks picked with Shift-click, to link several at once. */
  multi: string[]
  menu: { nodeId: string; x: number; y: number } | null
  confirmDelete: string | null
  /** The student moved the view (pan, zoom, toolbar): stop fitting the growing map. */
  viewLocked: boolean
  lockView: (locked?: boolean) => void
  startConnect: (from?: string | null) => void
  /** Returns the pair when the second node is picked. */
  pick: (nodeId: string) => { from: string; to: string } | null
  cancelConnect: () => void
  openPicker: (relationId: string, anchor: Anchor, isNew: boolean) => void
  closePicker: () => void
  openSearch: (fromIds: string[], anchor: Anchor) => void
  closeSearch: () => void
  toggleMulti: (nodeId: string) => void
  clearMulti: () => void
  openMenu: (nodeId: string, x: number, y: number) => void
  closeMenu: () => void
  askDelete: (nodeId: string | null) => void
}

export const useCanvasUi = create<CanvasUiState>((set, get) => ({
  connecting: false,
  connectFrom: null,
  picker: null,
  search: null,
  multi: [],
  menu: null,
  confirmDelete: null,
  viewLocked: false,
  lockView: (locked = true) => set({ viewLocked: locked }),
  startConnect: (from = null) =>
    set({ connecting: true, connectFrom: from, menu: null, search: null, picker: null }),
  pick: (nodeId) => {
    const { connecting, connectFrom } = get()
    if (!connecting) return null
    if (!connectFrom) {
      set({ connectFrom: nodeId })
      return null
    }
    if (connectFrom === nodeId) return null
    set({ connecting: false, connectFrom: null })
    return { from: connectFrom, to: nodeId }
  },
  cancelConnect: () => set({ connecting: false, connectFrom: null }),
  openPicker: (relationId, anchor, isNew) =>
    set({ picker: { relationId, anchor, isNew }, search: null, menu: null }),
  closePicker: () => set({ picker: null }),
  openSearch: (fromIds, anchor) =>
    set({ search: { fromIds, anchor }, picker: null, menu: null, connecting: false }),
  closeSearch: () => set({ search: null }),
  toggleMulti: (nodeId) => {
    const multi = get().multi
    set({ multi: multi.includes(nodeId) ? multi.filter((m) => m !== nodeId) : [...multi, nodeId] })
  },
  clearMulti: () => set({ multi: [] }),
  openMenu: (nodeId, x, y) => set({ menu: { nodeId, x, y } }),
  closeMenu: () => set({ menu: null }),
  askDelete: (nodeId) => set({ confirmDelete: nodeId, menu: null }),
}))
