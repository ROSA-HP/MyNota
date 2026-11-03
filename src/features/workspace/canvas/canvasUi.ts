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
  /** The suggested-links tray is open (right panel). */
  linksTray: boolean
  setLinksTray: (open: boolean) => void
  /** Nodes highlighted on the canvas (e.g. "Show" in the links tray). */
  spotlight: string[]
  setSpotlight: (ids: string[]) => void
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
  /** Study views (docs/features.md › Flashcards): mastery dots on blocks (remembered per device). */
  showMastery: boolean
  setShowMastery: (on: boolean) => void
  /** Hide details: block titles are covered until tapped, to test recall. */
  cover: boolean
  revealed: string[]
  setCover: (on: boolean) => void
  reveal: (nodeId: string) => void
  revealAll: () => void
  /** Focus mode: one section (notes map) or chapter (book) stays bright, the rest is dimmed. */
  focusId: string | null
  setFocus: (id: string | null) => void
  /** The outline filter; while set, the canvas dims what does not match (live filter). */
  filter: string
  setFilter: (q: string) => void
  /**
   * The details panel beside the canvas. Selecting a block only opens it in place (canvas
   * step 2); the panel opens from the card's Open / Edit, a double-click or Enter.
   */
  panelOpen: boolean
  /** Read (study card) or edit (the form). Sections and the map title always edit. */
  panelMode: 'read' | 'edit'
  setPanelOpen: (open: boolean, mode?: 'read' | 'edit') => void

  /**
   * Sub-cards opened or folded on this screen (owner, 2026-11-03: sub-cards start folded and
   * open with a click). Kept here, not in the map, so viewers can fold too; it wins over the
   * block's saved "collapsed".
   */
  folds: Record<string, boolean>
  setFold: (nodeId: string, folded: boolean) => void
}

const MASTERY_KEY = 'mynota.mastery'
function readMastery(): boolean {
  try {
    return localStorage.getItem(MASTERY_KEY) !== 'off'
  } catch {
    return true
  }
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
  linksTray: false,
  setLinksTray: (open) => set({ linksTray: open, spotlight: open ? get().spotlight : [] }),
  spotlight: [],
  setSpotlight: (ids) => set({ spotlight: ids }),
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
  showMastery: readMastery(),
  setShowMastery: (on) => {
    try {
      localStorage.setItem(MASTERY_KEY, on ? 'on' : 'off')
    } catch {
      // private mode: the choice lasts for this visit only
    }
    set({ showMastery: on })
  },
  cover: false,
  revealed: [],
  setCover: (on) => set({ cover: on, revealed: [] }),
  reveal: (nodeId) => {
    if (!get().revealed.includes(nodeId)) set({ revealed: [...get().revealed, nodeId] })
  },
  revealAll: () => set({ cover: false, revealed: [] }),
  focusId: null,
  setFocus: (id) => set({ focusId: id }),
  filter: '',
  setFilter: (q) => set({ filter: q }),
  panelOpen: false,
  panelMode: 'read',
  setPanelOpen: (open, mode) =>
    set(mode ? { panelOpen: open, panelMode: mode } : { panelOpen: open }),

  folds: {},
  setFold: (nodeId, folded) => set((s) => ({ folds: { ...s.folds, [nodeId]: folded } })),
}))
