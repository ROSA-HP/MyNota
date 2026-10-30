import type { MapRow, NodeRow, RelationRow, SourceParagraph, SourceRow } from '@/lib/database.types'
import { localDb, type CachedMap } from '@/lib/localdb'
import { MAP_COLUMNS, supabase } from '@/lib/supabase'
import { PALETTE, makeNode, newId } from '@/ai/pipeline/convert'

export const NODE_COLUMNS =
  'id, map_id, parent_id, sort_order, level, title, summary, type, icon, color, importance, details, lang, dir, branch_view, position, size, collapsed, source, ai_added, ai_added_reason, origin, created_by, created_at, updated_at'
export const RELATION_COLUMNS =
  'id, map_id, from_node, to_node, type, label, direction, status, origin, created_by, created_at, updated_at'
export const SOURCE_COLUMNS =
  'id, map_id, chapter_node_id, kind, storage_path, pages, paragraphs, file_name, file_size, file_hash, created_by, created_at'

export interface MapSnapshot {
  map: MapRow
  nodes: NodeRow[]
  relations: RelationRow[]
  sources: SourceRow[]
  role: 'owner' | 'editor' | 'viewer'
}

export class MapNotFoundError extends Error {}

export async function fetchMap(mapId: string, userId: string): Promise<MapSnapshot> {
  const [map, nodes, relations, sources, role] = await Promise.all([
    supabase.from('maps').select(MAP_COLUMNS).eq('id', mapId).maybeSingle(),
    supabase.from('nodes').select(NODE_COLUMNS).eq('map_id', mapId).order('sort_order'),
    supabase.from('relations').select(RELATION_COLUMNS).eq('map_id', mapId),
    supabase.from('sources').select(SOURCE_COLUMNS).eq('map_id', mapId),
    supabase.rpc('map_role', { target_map: mapId }),
  ])
  const error = map.error ?? nodes.error ?? relations.error ?? sources.error ?? role.error
  if (error) throw error
  if (!map.data || !role.data) throw new MapNotFoundError(mapId)
  const snapshot: MapSnapshot = {
    map: map.data,
    nodes: nodes.data ?? [],
    relations: relations.data ?? [],
    sources: sources.data ?? [],
    role: role.data,
  }
  void cacheMap(snapshot, userId)
  return snapshot
}

export async function cacheMap(s: Omit<MapSnapshot, 'role'>, userId: string): Promise<void> {
  const row: CachedMap = {
    mapId: s.map.id,
    userId,
    map: s.map,
    nodes: s.nodes,
    relations: s.relations,
    sources: s.sources,
    cachedAt: new Date().toISOString(),
  }
  try {
    await localDb.maps.put(row)
  } catch {
    /* storage unavailable: the cache is only an optimisation */
  }
}

export async function readCachedMap(mapId: string, userId: string): Promise<CachedMap | undefined> {
  try {
    const row = await localDb.maps.get(mapId)
    return row?.userId === userId ? row : undefined
  } catch {
    return undefined
  }
}

/** Columns the client may write. Server-owned fields (created_by, timestamps) are left out. */
function nodePayload(n: NodeRow) {
  return {
    id: n.id,
    map_id: n.map_id,
    parent_id: n.parent_id,
    sort_order: n.sort_order,
    level: n.level,
    title: n.title,
    summary: n.summary,
    type: n.type,
    icon: n.icon,
    color: n.color,
    importance: n.importance,
    details: n.details,
    lang: n.lang,
    dir: n.dir,
    branch_view: n.branch_view,
    position: n.position,
    size: n.size,
    collapsed: n.collapsed,
    source: n.source,
    ai_added: n.ai_added,
    ai_added_reason: n.ai_added_reason,
    origin: n.origin,
  }
}

function relationPayload(r: RelationRow) {
  return {
    id: r.id,
    map_id: r.map_id,
    from_node: r.from_node,
    to_node: r.to_node,
    type: r.type,
    label: r.label,
    direction: r.direction,
    status: r.status,
    origin: r.origin,
  }
}

export async function saveNodes(nodes: NodeRow[]): Promise<void> {
  if (!nodes.length) return
  const { error } = await supabase.from('nodes').upsert(nodes.map(nodePayload))
  if (error) throw error
}

export async function deleteNodes(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('nodes').delete().in('id', ids)
  if (error) throw error
}

export async function saveRelations(relations: RelationRow[]): Promise<void> {
  if (!relations.length) return
  const { error } = await supabase.from('relations').upsert(relations.map(relationPayload))
  if (error) throw error
}

export async function deleteRelations(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('relations').delete().in('id', ids)
  if (error) throw error
}

export interface NewMapInput {
  title: string
  type: MapRow['type']
  subjectId: string | null
  language: string | null
  paragraphs: SourceParagraph[]
}

/** Creates the map, its root node and (for AI maps) the numbered source paragraphs. */
export async function createMap(input: NewMapInput): Promise<{ mapId: string; rootId: string }> {
  const mapId = newId()
  const { error: mapError } = await supabase.from('maps').insert({
    id: mapId,
    type: input.type,
    title: input.title,
    subject_id: input.subjectId,
    languages: input.language ? [input.language] : [],
    cover_color: 'yellow',
  })
  if (mapError) throw mapError

  const root = makeNode({
    map_id: mapId,
    level: 'chapter',
    title: input.title.slice(0, 200),
    lang: input.language,
    dir: input.language === 'ar' ? 'rtl' : 'ltr',
    importance: 'core',
  })
  await saveNodes([root])

  if (input.paragraphs.length) {
    const { error } = await supabase.from('sources').insert({
      map_id: mapId,
      chapter_node_id: root.id,
      kind: 'text',
      paragraphs: input.paragraphs,
    })
    if (error) throw error
  }
  return { mapId, rootId: root.id }
}

export interface NewBookInput {
  title: string
  subjectId: string | null
  language: string | null
  kind: 'pdf' | 'images'
  file: { name: string; size: number; hash: string } | null
  /** All chapters in order; unbuilt ones are created too, ready to build later. */
  chapters: Array<{ title: string; pages: number; paragraphs: SourceParagraph[] }>
}

/**
 * Creates a book map: the book node, one colored chapter node per chapter and one source per
 * chapter (its paragraphs numbered P1..Pn with page numbers). Returns the chapter node ids in
 * the same order as `input.chapters`.
 */
export async function createBookMap(
  input: NewBookInput,
): Promise<{ mapId: string; rootId: string; chapterIds: string[] }> {
  const mapId = newId()
  const { error: mapError } = await supabase.from('maps').insert({
    id: mapId,
    type: 'book',
    title: input.title,
    subject_id: input.subjectId,
    languages: input.language ? [input.language] : [],
    cover_color: 'yellow',
  })
  if (mapError) throw mapError
  const dir = input.language === 'ar' ? 'rtl' : 'ltr'
  const root = makeNode({
    map_id: mapId,
    level: 'book',
    title: input.title.slice(0, 200),
    lang: input.language,
    dir,
    importance: 'core',
  })
  const chapters = input.chapters.map((c, i) =>
    makeNode({
      map_id: mapId,
      parent_id: root.id,
      sort_order: i,
      level: 'chapter',
      title: c.title.slice(0, 200) || `${i + 1}`,
      color: PALETTE[i % PALETTE.length] ?? 'yellow',
      lang: input.language,
      dir,
      importance: 'core',
    }),
  )
  await saveNodes([root, ...chapters])
  const sources = input.chapters.map((c, i) => ({
    map_id: mapId,
    chapter_node_id: chapters[i]?.id ?? null,
    kind: input.kind,
    pages: c.pages || null,
    paragraphs: c.paragraphs,
    file_name: input.file?.name.slice(0, 255) ?? null,
    file_size: input.file?.size ?? null,
    file_hash: input.file?.hash ?? null,
  }))
  for (let i = 0; i < sources.length; i += 20) {
    const { error } = await supabase.from('sources').insert(sources.slice(i, i + 20))
    if (error) throw error
  }
  return { mapId, rootId: root.id, chapterIds: chapters.map((c) => c.id) }
}
