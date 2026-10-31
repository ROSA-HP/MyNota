import { describe, expect, it } from 'vitest'
import { makeNode } from '@/ai/pipeline/convert'
import {
  bundleRelations,
  chapterProgress,
  chapterSummaries,
  levelFor,
  nearestShown,
} from '@/features/workspace/canvas/zoom'
import type { NodeRow, RelationRow, SourceRow } from '@/lib/database.types'

const node = (p: Partial<NodeRow> & Pick<NodeRow, 'level' | 'title'>) =>
  makeNode({ map_id: 'm', ...p })

function book() {
  const root = node({ level: 'book', title: 'Biology' })
  const ch1 = node({ level: 'chapter', title: 'Cells', parent_id: root.id, color: 'yellow' })
  const ch2 = node({ level: 'chapter', title: 'Membranes', parent_id: root.id, sort_order: 1 })
  const ch3 = node({ level: 'chapter', title: 'Index', parent_id: root.id, sort_order: 2 })
  const s1 = node({
    level: 'section',
    title: 'Organelles',
    parent_id: ch1.id,
    source: { paragraphs: [1, 2] },
  })
  const s2 = node({
    level: 'section',
    title: 'Division',
    parent_id: ch1.id,
    sort_order: 1,
    source: { paragraphs: [3] },
  })
  const b1 = node({ level: 'block', title: 'Nucleus', parent_id: s1.id, importance: 'core' })
  const b2 = node({ level: 'block', title: 'Pores', parent_id: b1.id, importance: 'extra' })
  const b3 = node({ level: 'block', title: 'Mitosis', parent_id: s2.id, importance: 'core' })
  const all = [root, ch1, ch2, ch3, s1, s2, b1, b2, b3]
  const nodes = Object.fromEntries(all.map((n) => [n.id, n]))
  const source = (chapter: string, pages: number[]): SourceRow => ({
    id: `src-${chapter}`,
    map_id: 'm',
    chapter_node_id: chapter,
    kind: 'pdf',
    storage_path: null,
    pages: null,
    paragraphs: pages.map((page, i) => ({ n: i + 1, text: 'x', page })),
    file_name: null,
    file_size: null,
    file_hash: null,
    created_by: null,
    created_at: '',
  })
  const sources = [source(ch1.id, [7, 8, 39]), source(ch2.id, [40])]
  return { nodes, sources, root, ch1, ch2, ch3, s1, s2, b1, b2, b3 }
}

const relation = (from: string, to: string, extra: Partial<RelationRow> = {}): RelationRow => ({
  id: `${from}-${to}`,
  map_id: 'm',
  from_node: from,
  to_node: to,
  type: 'causes',
  label: '',
  direction: 'forward',
  status: 'accepted',
  origin: 'user',
  created_by: null,
  created_at: '',
  updated_at: '',
  ...extra,
})

describe('semantic zoom', () => {
  it('picks the detail level from the zoom', () => {
    expect(levelFor(0.2, true)).toBe('chapters')
    expect(levelFor(0.5, true)).toBe('sections')
    expect(levelFor(0.9, true)).toBe('blocks')
    expect(levelFor(0.2, false)).toBe('sections')
    expect(levelFor(0.5, false)).toBe('blocks')
  })

  it('knows which chapters are built, unfinished, waiting or empty', () => {
    const { nodes, ch1, ch2, ch3, s2, b3 } = book()
    expect(chapterProgress(ch1.id, nodes, true)).toBe('built')
    expect(chapterProgress(ch2.id, nodes, true)).toBe('waiting')
    expect(chapterProgress(ch3.id, nodes, false)).toBe('empty')
    // A section whose blocks never arrived (the tab was closed mid-build).
    const partial = { ...nodes }
    Reflect.deleteProperty(partial, b3.id)
    expect(s2.source.paragraphs.length).toBeGreaterThan(0)
    expect(chapterProgress(ch1.id, partial, true)).toBe('partial')
  })

  it('summarises chapters for the zoomed-out view', () => {
    const { nodes, sources, root, ch1, ch2, s1 } = book()
    const [one, two, three] = chapterSummaries(nodes, sources, root.id)
    expect(one).toMatchObject({
      id: ch1.id,
      number: 1,
      color: 'yellow',
      pages: '7–39',
      paragraphs: 3,
      progress: 'built',
      blocks: 3,
      core: 2,
    })
    expect(one?.sections[0]).toEqual({ id: s1.id, title: 'Organelles', count: 2 })
    expect(two).toMatchObject({ id: ch2.id, pages: '40', progress: 'waiting', blocks: 0 })
    expect(three).toMatchObject({ pages: null, progress: 'empty' })
  })

  it('bundles links between the cards still drawn and drops links inside one card', () => {
    const { nodes, s1, s2, b1, b2, b3 } = book()
    const shown = new Set([s1.id, s2.id])
    const visibleOf = (id: string) => nearestShown(nodes, id, (n) => shown.has(n.id))
    const bundles = bundleRelations(
      [
        relation(b1.id, b3.id),
        relation(b3.id, b2.id, { type: 'part_of' }),
        relation(b1.id, b2.id), // both in Organelles
        relation(b2.id, b3.id, { status: 'suggested' }),
      ],
      visibleOf,
    )
    expect(bundles).toHaveLength(1)
    expect(new Set([bundles[0]?.from, bundles[0]?.to])).toEqual(new Set([s1.id, s2.id]))
    expect(bundles[0]?.relations).toHaveLength(2)
  })
})
