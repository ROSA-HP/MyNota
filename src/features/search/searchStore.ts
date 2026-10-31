import type { SearchResultRow } from '@/lib/database.types'
import { create } from 'zustand'

interface SearchState {
  open: boolean
  setOpen: (open: boolean) => void
}

/** The search palette (Ctrl/Cmd+K), shared by the app shell and the map workspace. */
export const useSearch = create<SearchState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

/** Where a result opens: the map at its block, the card in the deck, or the map itself. */
export function resultHref(r: SearchResultRow): string {
  if (r.kind === 'card' && r.card_id) return `/maps/${r.map_id}/deck?tab=cards&card=${r.card_id}`
  if (r.node_id) return `/maps/${r.map_id}?node=${r.node_id}`
  return `/maps/${r.map_id}`
}
