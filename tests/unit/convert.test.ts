import { describe, expect, it } from 'vitest'
import { blockNodes, makeNode, outlineText, sectionNodes } from '@/ai/pipeline/convert'
import type { DetailsResponse } from '@/ai/schemas/details'
import type { OutlineResponse } from '@/ai/schemas/outline'

const outline: OutlineResponse = {
  sections: [
    {
      title: 'Structure',
      summary: 'Parts',
      shape: 'tree',
      paragraphs: { from: 1, to: 3 },
      subsections: [{ title: 'Lipids', summary: 's', paragraphs: { from: 1, to: 2 } }],
    },
    {
      title: 'Signaling',
      summary: 'Steps',
      shape: 'process',
      paragraphs: { from: 4, to: 6 },
      subsections: [],
    },
  ],
}

describe('sectionNodes', () => {
  it('creates colored section nodes under the root with paragraph ranges', () => {
    const nodes = sectionNodes(outline, { mapId: 'm', rootId: 'root', lang: 'ar' })
    expect(nodes.map((n) => [n.title, n.color, n.branch_view, n.sort_order, n.dir])).toEqual([
      ['Structure', 'yellow', 'tree', 0, 'rtl'],
      ['Signaling', 'coral', 'process', 1, 'rtl'],
    ])
    expect(nodes[0]?.source.paragraphs).toEqual([1, 2, 3])
    expect(
      nodes.every((n) => n.parent_id === 'root' && n.level === 'section' && n.origin === 'ai'),
    ).toBe(true)
  })

  it('outlineText lists sections and subsections compactly', () => {
    expect(outlineText(outline)).toBe(
      '1. Structure (P1-P3, tree): Parts\n   - Lipids (P1-P2)\n2. Signaling (P4-P6, process): Steps',
    )
  })
})

describe('blockNodes', () => {
  const section = makeNode({ map_id: 'm', level: 'section', title: 'Transport' })
  const res: DetailsResponse = {
    blocks: [
      {
        key: 'b2',
        parent: 'b1',
        title: 'Pump',
        summary: '',
        type: 'example',
        importance: 'extra',
        details: [],
        source: [5, 4, 5],
        added: true,
        added_reason: 'common example',
      },
      {
        key: 'b1',
        parent: null,
        title: 'Active',
        summary: 'uses ATP',
        type: 'concept',
        importance: 'core',
        details: [{ kind: 'bullet', text: 'ATP' }],
        source: [4],
        added: false,
      },
      {
        key: 'b3',
        parent: null,
        title: 'Passive',
        summary: '',
        type: 'concept',
        importance: 'core',
        details: [],
        source: [6],
        added: false,
      },
    ],
    relations: [{ from: 'b3', to: 'b1', type: 'contrasts_with', label: 'opposite' }],
    flashcards: [{ block: 'b1', front: 'Energy source?', back: 'ATP' }],
  }

  it('maps keys to ids, parents to nodes, and orders parents before children', () => {
    const { nodes } = blockNodes(res, { mapId: 'm', section, lang: 'en' })
    const byTitle = Object.fromEntries(nodes.map((n) => [n.title, n]))
    expect(byTitle.Active?.parent_id).toBe(section.id)
    expect(byTitle.Pump?.parent_id).toBe(byTitle.Active?.id)
    expect(nodes.findIndex((n) => n.title === 'Active')).toBeLessThan(
      nodes.findIndex((n) => n.title === 'Pump'),
    )
    expect([byTitle.Active?.sort_order, byTitle.Passive?.sort_order]).toEqual([0, 1])
  })

  it('keeps sources sorted and unique, marks added content, attaches flashcards as questions', () => {
    const { nodes } = blockNodes(res, { mapId: 'm', section, lang: 'en' })
    const pump = nodes.find((n) => n.title === 'Pump')!
    expect(pump.source.paragraphs).toEqual([4, 5])
    expect(pump).toMatchObject({
      ai_added: true,
      ai_added_reason: 'common example',
      importance: 'extra',
      level: 'block',
    })
    const active = nodes.find((n) => n.title === 'Active')!
    expect(active.details).toEqual([
      { kind: 'bullet', text: 'ATP' },
      { kind: 'question', front: 'Energy source?', back: 'ATP' },
    ])
  })

  it('turns relations into accepted links between the new ids', () => {
    const { nodes, relations } = blockNodes(res, { mapId: 'm', section, lang: 'en' })
    const id = (t: string) => nodes.find((n) => n.title === t)?.id
    expect(relations).toHaveLength(1)
    expect(relations[0]).toMatchObject({
      from_node: id('Passive'),
      to_node: id('Active'),
      type: 'contrasts_with',
      label: 'opposite',
      status: 'accepted',
      origin: 'ai',
    })
  })
})
