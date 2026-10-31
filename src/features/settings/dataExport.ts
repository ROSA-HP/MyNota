import type {
  CardProgressRow,
  CardRow,
  MapRow,
  NodeRow,
  ProfileRow,
  RelationRow,
  ReviewLogRow,
  SourceRow,
  SubjectRow,
} from '@/lib/database.types'
import { MAP_COLUMNS, PROFILE_COLUMNS, SUBJECT_COLUMNS, supabase } from '@/lib/supabase'
import { CARD_COLUMNS, PROGRESS_COLUMNS } from '@/features/study/deckStore'
import { NODE_COLUMNS, RELATION_COLUMNS, SOURCE_COLUMNS } from '@/features/workspace/mapRepo'

/**
 * "Download my data" (Phase 7.5, docs/security.md › Privacy and data rights): everything the
 * person owns or made, as one JSON file built in the browser. Maps they own (with blocks,
 * links, source text and cards), subjects, and their own study progress and review history on
 * every map. AI keys live only on the device and are never part of it.
 */

export interface ExportedMap {
  map: MapRow
  nodes: NodeRow[]
  relations: RelationRow[]
  sources: SourceRow[]
  cards: CardRow[]
}

export interface MyData {
  format: 'mynota-export'
  version: 1
  exported_at: string
  profile: ProfileRow | null
  subjects: SubjectRow[]
  maps: ExportedMap[]
  progress: CardProgressRow[]
  reviews: ReviewLogRow[]
}

const PAGE = 1000

/** Reads every row of a query, a page at a time (Supabase returns at most 1000 per request). */
export async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

export async function collectMyData(
  userId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<MyData> {
  const profile = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single()
  const subjects = await allPages<SubjectRow>((a, b) =>
    supabase.from('subjects').select(SUBJECT_COLUMNS).eq('owner_id', userId).range(a, b),
  )
  const maps = await allPages<MapRow>((a, b) =>
    supabase
      .from('maps')
      .select(MAP_COLUMNS)
      .eq('owner_id', userId)
      .order('created_at')
      .range(a, b),
  )
  const exported: ExportedMap[] = []
  for (const [i, map] of maps.entries()) {
    onProgress?.(i, maps.length)
    const [nodes, relations, sources, cards] = await Promise.all([
      allPages<NodeRow>((a, b) =>
        supabase.from('nodes').select(NODE_COLUMNS).eq('map_id', map.id).order('id').range(a, b),
      ),
      allPages<RelationRow>((a, b) =>
        supabase
          .from('relations')
          .select(RELATION_COLUMNS)
          .eq('map_id', map.id)
          .order('id')
          .range(a, b),
      ),
      allPages<SourceRow>((a, b) =>
        supabase
          .from('sources')
          .select(SOURCE_COLUMNS)
          .eq('map_id', map.id)
          .order('id')
          .range(a, b),
      ),
      allPages<CardRow>((a, b) =>
        supabase.from('cards').select(CARD_COLUMNS).eq('map_id', map.id).order('id').range(a, b),
      ),
    ])
    exported.push({ map, nodes, relations, sources, cards })
  }
  onProgress?.(maps.length, maps.length)
  const [progress, reviews] = await Promise.all([
    allPages<CardProgressRow>((a, b) =>
      supabase.from('card_progress').select(PROGRESS_COLUMNS).eq('user_id', userId).range(a, b),
    ),
    allPages<ReviewLogRow>((a, b) =>
      supabase
        .from('review_logs')
        .select('*')
        .eq('user_id', userId)
        .order('reviewed_at')
        .range(a, b),
    ),
  ])
  return {
    format: 'mynota-export',
    version: 1,
    exported_at: new Date().toISOString(),
    profile: profile.data ?? null,
    subjects,
    maps: exported,
    progress,
    reviews,
  }
}

export function exportFileName(username: string, at = new Date()): string {
  const safe = username.replace(/[^a-z0-9_]/gi, '') || 'me'
  return `mynota-${safe}-${at.toISOString().slice(0, 10)}.json`
}

/** Saves the export as a file (built and saved in the browser; nothing is uploaded). */
export function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
