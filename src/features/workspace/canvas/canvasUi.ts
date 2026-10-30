import { create } from 'zustand'

interface CanvasUiState {
  /** Connect mode: the first node picked, waiting for the second. */
  connecting: boolean
  connectFrom: string | null
  /** Pending relation waiting for its type and label. */
  newRelation: { from: string; to: string } | null
  menu: { nodeId: string; x: number; y: number } | null
  confirmDelete: string | null
  startConnect: (from?: string | null) => void
  pick: (nodeId: string) => void
  cancelConnect: () => void
  closeRelationDialog: () => void
  openMenu: (nodeId: string, x: number, y: number) => void
  closeMenu: () => void
  askDelete: (nodeId: string | null) => void
}

export const useCanvasUi = create<CanvasUiState>((set, get) => ({
  connecting: false,
  connectFrom: null,
  newRelation: null,
  menu: null,
  confirmDelete: null,
  startConnect: (from = null) => set({ connecting: true, connectFrom: from, menu: null }),
  pick: (nodeId) => {
    const { connecting, connectFrom } = get()
    if (!connecting) return
    if (!connectFrom) set({ connectFrom: nodeId })
    else if (connectFrom !== nodeId)
      set({ newRelation: { from: connectFrom, to: nodeId }, connecting: false, connectFrom: null })
  },
  cancelConnect: () => set({ connecting: false, connectFrom: null }),
  closeRelationDialog: () => set({ newRelation: null }),
  openMenu: (nodeId, x, y) => set({ menu: { nodeId, x, y } }),
  closeMenu: () => set({ menu: null }),
  askDelete: (nodeId) => set({ confirmDelete: nodeId, menu: null }),
}))
