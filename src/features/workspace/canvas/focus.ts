import type { NodeRow } from '@/lib/database.types'

/**
 * The part of the map focus mode keeps bright for a node: the root's child it sits under
 * (a chapter in a book, a section in a notes map). Null for the root itself.
 */
export function focusGroupOf(nodes: Record<string, NodeRow>, id: string): string | null {
  let cur = nodes[id]
  for (let guard = 0; cur && guard < 64; guard++) {
    const parent = cur.parent_id ? nodes[cur.parent_id] : undefined
    if (!parent) return null
    if (!parent.parent_id) return cur.id
    cur = parent
  }
  return null
}
