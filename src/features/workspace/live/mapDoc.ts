import * as Y from 'yjs'
import type { NodeRow, RelationRow } from '@/lib/database.types'
import { parseNode, parseRelation } from './rows'

/**
 * The shared (Yjs) documents of a map (Phase 6).
 *
 * A map has one document per chapter (its sections, blocks and the links between them) and one
 * `book` document (the book and chapter nodes, and links between chapters). Every node and every
 * link is its own top-level Y.Map named `n:<id>` / `r:<id>`, holding one entry per field. Top-level
 * types merge by name, so two devices that write the same node at once (for example both turning
 * an existing map into documents) never replace each other's map: they only race per field, and
 * the same change wins everywhere. Deleting clears the map; a map without a valid row is ignored.
 */

export const BOOK_DOC = 'book'
export type DocKey = string

const NODE = 'n:'
const REL = 'r:'

/** Transaction origin for changes made on this device (undo and saving track it). */
export const LOCAL = 'mynota:local'
/** Turning existing rows into a document: saved, but not undoable. */
export const SEED = 'mynota:seed'
/** Changes that came from someone else or from the server. */
export const REMOTE = 'mynota:remote'

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

function writeFields(map: Y.Map<unknown>, row: object) {
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue
    if (!same(map.get(k), v)) map.set(k, v)
  }
}

// ---------------------------------------------------------------------------
// Which document a row belongs to
// ---------------------------------------------------------------------------

type Ancestry = Pick<NodeRow, 'id' | 'level' | 'parent_id'>

/**
 * `book` for the book and chapter nodes (and a notes map's root); otherwise the id of the chapter
 * above the node. Null when the chain of parents is broken (a parent is unknown).
 */
export function docKeyOfNode(
  node: Ancestry,
  lookup: (id: string) => Ancestry | undefined,
): DocKey | null {
  if (node.level === 'book' || node.level === 'chapter' || !node.parent_id) return BOOK_DOC
  let cur: Ancestry | undefined = node
  for (let guard = 0; cur && guard < 64; guard++) {
    if (!cur.parent_id) return null
    const parent = lookup(cur.parent_id)
    if (!parent) return null
    if (parent.level === 'chapter') return parent.id
    if (parent.level === 'book') return null
    cur = parent
  }
  return null
}

/** A link lives with its blocks when both are in the same chapter, else in the book document. */
export function docKeyOfRelation(
  rel: Pick<RelationRow, 'from_node' | 'to_node'>,
  keyOfNode: (id: string) => DocKey | null,
): DocKey {
  const a = keyOfNode(rel.from_node)
  const b = keyOfNode(rel.to_node)
  return a && a === b ? a : BOOK_DOC
}

// ---------------------------------------------------------------------------
// Writing (call inside doc.transact(…, origin) to group changes)
// ---------------------------------------------------------------------------

export function putNode(doc: Y.Doc, row: NodeRow): void {
  writeFields(doc.getMap(NODE + row.id), row)
}

/** Changes some fields of a node that exists in this document; false when it does not. */
export function patchNode(doc: Y.Doc, id: string, patch: Partial<NodeRow>): boolean {
  if (!doc.share.has(NODE + id)) return false
  const map = doc.getMap(NODE + id)
  if (!map.has('id')) return false
  writeFields(map, { ...patch, id: undefined, map_id: undefined })
  return true
}

export function removeNode(doc: Y.Doc, id: string): void {
  if (doc.share.has(NODE + id)) doc.getMap(NODE + id).clear()
}

export function putRelation(doc: Y.Doc, row: RelationRow): void {
  writeFields(doc.getMap(REL + row.id), row)
}

export function patchRelation(doc: Y.Doc, id: string, patch: Partial<RelationRow>): boolean {
  if (!doc.share.has(REL + id)) return false
  const map = doc.getMap(REL + id)
  if (!map.has('id')) return false
  writeFields(map, { ...patch, id: undefined, map_id: undefined })
  return true
}

export function removeRelation(doc: Y.Doc, id: string): void {
  if (doc.share.has(REL + id)) doc.getMap(REL + id).clear()
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface DocRows {
  nodes: NodeRow[]
  relations: RelationRow[]
}

export function readNode(doc: Y.Doc, id: string, mapId: string): NodeRow | null {
  return doc.share.has(NODE + id) ? parseNode(doc.getMap(NODE + id).toJSON(), mapId) : null
}

export function readRelation(doc: Y.Doc, id: string, mapId: string): RelationRow | null {
  return doc.share.has(REL + id) ? parseRelation(doc.getMap(REL + id).toJSON(), mapId) : null
}

/** Every valid node and link in the document. */
export function readDoc(doc: Y.Doc, mapId: string): DocRows {
  const nodes: NodeRow[] = []
  const relations: RelationRow[] = []
  for (const name of doc.share.keys()) {
    if (name.startsWith(NODE)) {
      const n = parseNode(doc.getMap(name).toJSON(), mapId)
      if (n && n.id === name.slice(NODE.length)) nodes.push(n)
    } else if (name.startsWith(REL)) {
      const r = parseRelation(doc.getMap(name).toJSON(), mapId)
      if (r && r.id === name.slice(REL.length)) relations.push(r)
    }
  }
  return { nodes, relations }
}

/** The node and link ids a transaction touched (added, changed or deleted). */
export function changedIds(tr: Y.Transaction): { nodes: Set<string>; relations: Set<string> } {
  const names = new Map<unknown, string>()
  for (const [name, type] of tr.doc.share) names.set(type, name)
  const nodes = new Set<string>()
  const relations = new Set<string>()
  for (const type of tr.changed.keys()) {
    const name = names.get(type)
    if (!name) continue
    if (name.startsWith(NODE)) nodes.add(name.slice(NODE.length))
    else if (name.startsWith(REL)) relations.add(name.slice(REL.length))
  }
  return { nodes, relations }
}

/** True when the document has no nodes or links at all (never written, or seeded empty). */
export function isEmptyDoc(doc: Y.Doc): boolean {
  for (const name of doc.share.keys())
    if ((name.startsWith(NODE) || name.startsWith(REL)) && doc.getMap(name).size > 0) return false
  return true
}

// ---------------------------------------------------------------------------
// Turning an existing map into documents, and keeping the documents consistent
// ---------------------------------------------------------------------------

/**
 * Splits saved rows into the documents they belong to (rows whose chain of parents is broken
 * are left out, as the database would not have them either).
 */
export function splitRows(rows: DocRows): Map<DocKey, DocRows> {
  const byId = new Map(rows.nodes.map((n) => [n.id, n]))
  const keyCache = new Map<string, DocKey | null>()
  const keyOf = (id: string): DocKey | null => {
    if (keyCache.has(id)) return keyCache.get(id) ?? null
    const n = byId.get(id)
    const key = n ? docKeyOfNode(n, (p) => byId.get(p)) : null
    keyCache.set(id, key)
    return key
  }
  const out = new Map<DocKey, DocRows>()
  const bucket = (key: DocKey) => {
    let b = out.get(key)
    if (!b) out.set(key, (b = { nodes: [], relations: [] }))
    return b
  }
  bucket(BOOK_DOC)
  for (const n of rows.nodes) {
    const key = keyOf(n.id)
    if (key) bucket(key).nodes.push(n)
  }
  for (const r of rows.relations) {
    if (!keyOf(r.from_node) || !keyOf(r.to_node)) continue
    bucket(docKeyOfRelation(r, keyOf)).relations.push(r)
  }
  return out
}

/** 32-bit FNV-1a, used as the Yjs client id of a conversion (never 0). */
function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h || 1
}

/**
 * Writes saved rows into an empty document (origin SEED, so it is never undone).
 *
 * The conversion is made under a client id taken from the rows themselves: two devices that
 * convert the same rows at the same time write byte-identical changes, which Yjs treats as one,
 * so an edit made right after converting cannot be overwritten by the other device's copy.
 * Different rows give a different id, so the two conversions merge field by field instead.
 */
export function seedDoc(doc: Y.Doc, rows: DocRows): void {
  const nodes = [...rows.nodes].sort((a, b) => a.id.localeCompare(b.id))
  const relations = [...rows.relations].sort((a, b) => a.id.localeCompare(b.id))
  if (!nodes.length && !relations.length) return
  const tmp = new Y.Doc({ gc: false })
  tmp.clientID = hash32(JSON.stringify([nodes, relations]))
  tmp.transact(() => {
    nodes.forEach((n) => putNode(tmp, n))
    relations.forEach((r) => putRelation(tmp, r))
  })
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(tmp), SEED)
  tmp.destroy()
}

/**
 * What must go when people changed the map at the same time: nodes whose parent was deleted
 * (with everything below them), and links whose block is gone. Deleting wins over editing.
 * `rows` is everything currently loaded, from all documents. `canJudge` says whether a link's
 * blocks would be loaded if they existed (a link between chapters cannot be judged while one of
 * its chapters is not loaded).
 */
export function findOrphans(
  rows: DocRows,
  canJudge: (rel: RelationRow) => boolean = () => true,
): { nodes: string[]; relations: string[] } {
  const byId = new Map(rows.nodes.map((n) => [n.id, n]))
  const alive = new Map<string, boolean>()
  const isAlive = (id: string, depth = 0): boolean => {
    const known = alive.get(id)
    if (known !== undefined) return known
    const n = byId.get(id)
    let ok = false
    if (n && depth < 64) ok = !n.parent_id || isAlive(n.parent_id, depth + 1)
    alive.set(id, ok)
    return ok
  }
  const nodes = rows.nodes.filter((n) => !isAlive(n.id)).map((n) => n.id)
  const relations = rows.relations
    .filter((r) => canJudge(r) && (!isAlive(r.from_node) || !isAlive(r.to_node)))
    .map((r) => r.id)
  return { nodes, relations }
}
