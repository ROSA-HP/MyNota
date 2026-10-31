import { describe, expect, it } from 'vitest'
import { makeNode, makeRelation } from '@/ai/pipeline/convert'
import {
  canLink,
  linkCandidates,
  maxLinksFor,
  pairKey,
  toSuggestions,
  MAX_CANDIDATES,
} from '@/ai/pipeline/links'
import { linksPrompt } from '@/ai/prompts/links.v1'
import { LinksResponseSchema } from '@/ai/schemas/links'
import type { NodeRow } from '@/lib/database.types'

const node = (p: Partial<NodeRow> & Pick<NodeRow, 'level' | 'title'>) =>
  makeNode({ map_id: 'm', ...p })

function bookMap() {
  const root = node({ level: 'book', title: 'Biology' })
  const ch1 = node({ level: 'chapter', title: 'Membranes', parent_id: root.id, sort_order: 0 })
  const ch2 = node({ level: 'chapter', title: 'Metabolism', parent_id: root.id, sort_order: 1 })
  const s1 = node({ level: 'section', title: 'Transport', parent_id: ch1.id, sort_order: 0 })
  const s2 = node({ level: 'section', title: 'Osmosis', parent_id: ch1.id, sort_order: 1 })
  const s3 = node({ level: 'section', title: 'Respiration', parent_id: ch2.id })
  const active = node({ level: 'block', title: 'Active transport', parent_id: s1.id })
  const pump = node({ level: 'block', title: 'Na/K pump', parent_id: active.id })
  const tonicity = node({ level: 'block', title: 'Tonicity', parent_id: s2.id })
  const atp = node({ level: 'block', title: 'ATP synthesis', parent_id: s3.id })
  const all = [root, ch1, ch2, s1, s2, s3, active, pump, tonicity, atp]
  return {
    nodes: Object.fromEntries(all.map((n) => [n.id, n])),
    root,
    ch1,
    ch2,
    s1,
    s2,
    active,
    pump,
    tonicity,
    atp,
  }
}

describe('cross-links candidates', () => {
  it('lists one chapter’s blocks grouped by section', () => {
    const m = bookMap()
    const c = linkCandidates(m.nodes, m.root.id, { kind: 'chapter', chapterId: m.ch1.id })
    expect(c.title).toBe('Membranes')
    expect(c.blocks.map((b) => [b.id, b.title, b.place])).toEqual([
      ['B1', 'Active transport', 'Transport'],
      ['B2', 'Na/K pump', 'Transport'],
      ['B3', 'Tonicity', 'Osmosis'],
    ])
    expect(c.groups).toBe(2)
    expect(canLink(c)).toBe(true)
    expect(c.idMap.get('B3')).toBe(m.tonicity.id)
  })

  it('groups a whole book by chapter', () => {
    const m = bookMap()
    const c = linkCandidates(m.nodes, m.root.id, { kind: 'book' })
    expect(c.groups).toBe(2)
    expect(c.blocks.at(-1)).toMatchObject({
      title: 'ATP synthesis',
      place: 'Metabolism › Respiration',
    })
    expect(c.groupOf.get(m.pump.id)).toBe(m.ch1.id)
  })

  it('cannot link a chapter with one section', () => {
    const m = bookMap()
    const c = linkCandidates(m.nodes, m.root.id, { kind: 'chapter', chapterId: m.ch2.id })
    expect(canLink(c)).toBe(false)
  })

  it('keeps core blocks first when a book is too big', () => {
    const root = node({ level: 'book', title: 'Big' })
    const all: NodeRow[] = [root]
    for (let c = 0; c < 2; c++) {
      const ch = node({ level: 'chapter', title: `C${c}`, parent_id: root.id, sort_order: c })
      const sec = node({ level: 'section', title: `S${c}`, parent_id: ch.id })
      all.push(ch, sec)
      for (let i = 0; i < 300; i++)
        all.push(
          node({
            level: 'block',
            title: `b${c}-${i}`,
            parent_id: sec.id,
            sort_order: i,
            importance: i % 10 === 0 ? 'core' : 'extra',
          }),
        )
    }
    const c = linkCandidates(Object.fromEntries(all.map((n) => [n.id, n])), root.id, {
      kind: 'book',
    })
    expect(c.blocks).toHaveLength(MAX_CANDIDATES.book)
    expect(c.blocks.filter((b) => /-\d*0$/.test(b.title)).length).toBe(60) // all 60 core kept
  })

  it('asks for a sensible number of links', () => {
    expect(maxLinksFor('chapter', 3, 2)).toBe(2)
    expect(maxLinksFor('chapter', 300, 7)).toBe(10)
    expect(maxLinksFor('book', 400, 12)).toBe(16)
  })
})

describe('cross-links suggestions', () => {
  it('drops unknown ids, self-links, same-section links, existing and repeated pairs', () => {
    const m = bookMap()
    const candidates = linkCandidates(m.nodes, m.root.id, { kind: 'book' })
    const existing = [
      makeRelation({
        map_id: 'm',
        from_node: m.atp.id,
        to_node: m.tonicity.id,
        status: 'dismissed',
      }),
    ]
    const links = LinksResponseSchema.parse({
      links: [
        { from: 'B9', to: 'B1', type: 'causes', label: 'x', confidence: 'high' }, // unknown
        { from: 'B1', to: 'B1', type: 'causes', label: 'x', confidence: 'high' }, // self
        { from: 'B1', to: 'B2', type: 'part_of', label: 'x', confidence: 'high' }, // same chapter
        { from: 'B3', to: 'B4', type: 'related', label: 'x', confidence: 'high' }, // dismissed before
        { from: 'B2', to: 'B4', type: 'prerequisite', label: 'uses energy', confidence: 'medium' },
        { from: 'b4', to: 'b2', type: 'causes', label: 'again', confidence: 'medium' }, // repeat
        {
          from: 'B1',
          to: 'B4',
          type: 'derived_from',
          label: 'powered by cell energy',
          confidence: 'high',
        },
      ],
    })
    const out = toSuggestions(links, { mapId: 'm', candidates, existing, max: 10 })
    expect(out.map((r) => [r.from_node, r.to_node, r.label, r.confidence])).toEqual([
      [m.active.id, m.atp.id, 'powered by cell', 'high'],
      [m.pump.id, m.atp.id, 'uses energy', 'medium'],
    ])
    expect(out.every((r) => r.status === 'suggested' && r.origin === 'ai')).toBe(true)
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'))
  })

  it('respects the maximum', () => {
    const m = bookMap()
    const candidates = linkCandidates(m.nodes, m.root.id, { kind: 'book' })
    const out = toSuggestions(
      {
        links: [
          { from: 'B1', to: 'B4', type: 'causes', label: '', confidence: 'medium' },
          { from: 'B2', to: 'B4', type: 'causes', label: '', confidence: 'medium' },
        ],
      },
      { mapId: 'm', candidates, existing: [], max: 1 },
    )
    expect(out).toHaveLength(1)
  })

  it('rejects confidences below medium', () => {
    expect(
      LinksResponseSchema.safeParse({
        links: [{ from: 'B1', to: 'B2', type: 'causes', label: '', confidence: 'low' }],
      }).success,
    ).toBe(false)
  })

  it('puts the rules and the block list in the prompt', () => {
    const p = linksPrompt({
      scope: 'book',
      title: 'Biology',
      language: 'de',
      maxLinks: 6,
      blocks: [{ id: 'B1', title: 'ATP', summary: '', group: 'c', place: 'Metabolism › Energy' }],
    })
    expect(p).toContain('DIFFERENT chapters')
    expect(p).toContain('Maximum 6 relations')
    expect(p).toContain('label in German')
    expect(p).toContain('B1 | ATP | - | Metabolism › Energy')
    expect(p).toMatch(/ignore them/)
  })
})
