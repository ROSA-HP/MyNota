import { describe, expect, it } from 'vitest'
import { makeNode } from '@/ai/pipeline/convert'
import {
  applyPlan,
  mergeOutline,
  nextParagraphOffset,
  toPlan,
  type PlanItem,
} from '@/ai/pipeline/merge'
import { mergePrompt } from '@/ai/prompts/merge.v1'
import { MergeResponseSchema, mergeSchemaFor } from '@/ai/schemas/merge'
import type { NodeRow } from '@/lib/database.types'

const node = (p: Partial<NodeRow> & Pick<NodeRow, 'level' | 'title'>) =>
  makeNode({ map_id: 'm', ...p })

function notesMap() {
  const root = node({ level: 'chapter', title: 'Cell Membrane' })
  const transport = node({
    level: 'section',
    title: 'Transport',
    summary: 'Moving things across',
    parent_id: root.id,
    sort_order: 0,
  })
  const signaling = node({
    level: 'section',
    title: 'Signaling',
    parent_id: root.id,
    sort_order: 1,
  })
  const passive = node({
    level: 'block',
    title: 'Passive Transport',
    parent_id: transport.id,
    sort_order: 0,
    source: { paragraphs: [2] },
  })
  const pump = node({
    level: 'block',
    title: 'Na/K Pump',
    parent_id: transport.id,
    sort_order: 1,
  })
  const ligand = node({ level: 'block', title: 'Ligand Binds', parent_id: signaling.id })
  const all = [root, transport, signaling, passive, pump, ligand]
  return {
    nodes: Object.fromEntries(all.map((n) => [n.id, n])),
    root,
    transport,
    signaling,
    passive,
    pump,
    ligand,
  }
}

const notes = [
  { n: 1, text: 'Facilitated diffusion uses channel proteins.' },
  { n: 2, text: 'Passive transport needs no ATP.' },
  { n: 3, text: 'The pump keeps the inside negative.' },
  { n: 4, text: 'Endocytosis wraps particles in membrane.' },
  { n: 5, text: 'cAMP is a second messenger.' },
]
const block = (title: string, ns: number[]) => ({
  title,
  summary: '',
  type: 'concept' as const,
  importance: 'supporting' as const,
  notes: ns,
  added: false,
  added_reason: null,
})

describe('merge outline', () => {
  it('lists the map with S… and B… ids and nesting', () => {
    const m = notesMap()
    const ctx = mergeOutline(m.nodes, m.root.id)
    expect(ctx.outline.split('\n')).toEqual([
      'S1 Transport — Moving things across',
      '  B1 Passive Transport',
      '  B2 Na/K Pump',
      'S2 Signaling',
      '  B3 Ligand Binds',
    ])
    expect(ctx.idMap.get('B2')).toBe(m.pump.id)
    expect([...ctx.ids.sections]).toEqual(['S1', 'S2'])
  })

  it('puts the outline and the notes in the prompt', () => {
    const m = notesMap()
    const p = mergePrompt({
      mapTitle: 'Cell Membrane',
      outline: mergeOutline(m.nodes, m.root.id).outline,
      language: 'en',
      notes,
    })
    expect(p).toContain('S1 Transport')
    expect(p).toContain('N5: cAMP is a second messenger.')
    expect(p).toContain('Every note N1 to N5 appears in exactly one item')
    expect(p).toMatch(/ignore them/)
  })
})

describe('merge validation', () => {
  it('sends unknown ids and missing parts back for repair', () => {
    const m = notesMap()
    const schema = mergeSchemaFor(mergeOutline(m.nodes, m.root.id).ids, 5)
    const bad = schema.safeParse({
      items: [
        { action: 'attach', notes: [1], parent: 'S9', blocks: [block('X', [1])] },
        { action: 'detail', notes: [3], target: 'S1', detail: 'x' },
        { action: 'new_section', notes: [4], blocks: [] },
        { action: 'skip', notes: [9], duplicate_of: 'B1' },
      ],
    })
    expect(bad.success).toBe(false)
    const paths = bad.error?.issues.map((i) => i.path.join('.'))
    expect(paths).toEqual(
      expect.arrayContaining([
        'items.0.parent',
        'items.1.target',
        'items.2.section',
        'items.2.blocks',
        'items.3.notes',
      ]),
    )
    const good = schema.safeParse({
      items: [{ action: 'skip', notes: [2], duplicate_of: 'B1' }],
    })
    expect(good.success).toBe(true)
  })
})

describe('merge plan', () => {
  function plan() {
    const m = notesMap()
    const ctx = mergeOutline(m.nodes, m.root.id)
    const res = MergeResponseSchema.parse({
      items: [
        {
          action: 'attach',
          notes: [1],
          parent: 'S1',
          after: 'B1',
          blocks: [block('Facilitated Diffusion', [1])],
        },
        { action: 'skip', notes: [2], duplicate_of: 'B1' },
        { action: 'detail', notes: [3], target: 'B2', detail: 'Keeps the inside negative' },
        { action: 'attach', notes: [1], parent: 'S9', blocks: [] }, // N1 again, bad parent
      ],
    })
    return { m, items: toPlan(res, ctx, notes, 'More notes') }
  }

  it('maps ids, keeps each note once and gathers forgotten notes in a new section', () => {
    const { m, items } = plan()
    expect(items.map((i) => [i.action, i.notes, i.include])).toEqual([
      ['attach', [1], true],
      ['skip', [2], false],
      ['detail', [3], true],
      ['new_section', [4, 5], true],
    ])
    expect(items[0]?.parentId).toBe(m.transport.id)
    expect(items[0]?.afterId).toBe(m.passive.id)
    expect(items[3]?.section?.title).toBe('More notes')
    expect(items[3]?.blocks.map((b) => b.title)).toEqual([
      'Endocytosis wraps particles in membrane.',
      'cAMP is a second messenger.',
    ])
  })

  it('applies ticked items: new blocks cite P(offset+N), details append, order is kept', () => {
    const { m, items } = plan()
    const ticked: PlanItem[] = items.map((i) => (i.action === 'skip' ? { ...i, include: true } : i))
    const { add, patches } = applyPlan(ticked, {
      mapId: 'm',
      rootId: m.root.id,
      nodes: m.nodes,
      notes,
      offset: 10,
      lang: 'en',
    })
    const facilitated = add.find((n) => n.title === 'Facilitated Diffusion')
    expect(facilitated).toMatchObject({
      parent_id: m.transport.id,
      sort_order: 1,
      level: 'block',
      origin: 'ai',
      source: { paragraphs: [11] },
    })
    const patch = (id: string) => patches.find((p) => p.id === id)?.patch
    expect(patch(m.pump.id)?.sort_order).toBe(2) // moved down one place
    expect(patch(m.pump.id)?.details?.at(-1)).toEqual({
      kind: 'text',
      text: 'Keeps the inside negative',
    })
    expect(patch(m.pump.id)?.source?.paragraphs).toEqual([13])
    // "Add them anyway": the repeated note becomes a detail on the block it repeats.
    expect(patch(m.passive.id)?.source?.paragraphs).toEqual([2, 12])
    const section = add.find((n) => n.level === 'section')
    expect(section).toMatchObject({ parent_id: m.root.id, title: 'More notes', sort_order: 2 })
    expect(add.filter((n) => n.parent_id === section?.id).map((n) => n.source.paragraphs)).toEqual([
      [14],
      [15],
    ])
    // Parents come before their children.
    expect(add.indexOf(section as NodeRow)).toBeLessThan(
      add.findIndex((n) => n.parent_id === section?.id),
    )
  })

  it('continues paragraph numbers after the chapter’s existing sources', () => {
    expect(
      nextParagraphOffset(
        [
          { chapter_node_id: 'a', paragraphs: [{ n: 1 }, { n: 7 }] },
          { chapter_node_id: 'a', paragraphs: [{ n: 9 }] },
          { chapter_node_id: 'b', paragraphs: [{ n: 40 }] },
        ],
        'a',
      ),
    ).toBe(9)
    expect(nextParagraphOffset([], 'a')).toBe(0)
  })
})
