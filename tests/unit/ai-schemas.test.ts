import { describe, expect, it } from 'vitest'
import { detailsSchemaFor, toDetailBlock, type DetailsResponse } from '@/ai/schemas/details'
import { normalizeOutline, outlineSchemaFor, type OutlineResponse } from '@/ai/schemas/outline'
import { checkDetailsRules, checkOutlineRules, countWords } from '@/ai/schemas/rules'

const outline: OutlineResponse = {
  sections: [
    {
      title: 'Structure',
      summary: 'What the membrane is made of',
      shape: 'tree',
      paragraphs: { from: 1, to: 4 },
      subsections: [],
    },
    {
      title: 'Transport',
      summary: 'How substances cross',
      shape: 'comparison',
      paragraphs: { from: 5, to: 9 },
      subsections: [],
    },
    {
      title: 'Signaling',
      summary: 'How cells react to signals',
      shape: 'process',
      paragraphs: { from: 10, to: 12 },
      subsections: [
        { title: 'Receptors', summary: 'Bind ligands', paragraphs: { from: 10, to: 11 } },
      ],
    },
  ],
}

describe('outline schema', () => {
  it('accepts a valid outline', () => {
    expect(outlineSchemaFor(12).safeParse(outline).success).toBe(true)
  })

  it('rejects paragraphs beyond the chapter, with a message the model can act on', () => {
    const r = outlineSchemaFor(10).safeParse(outline)
    expect(r.success).toBe(false)
    expect(r.error?.issues.map((i) => i.message).join(' ')).toMatch(
      /P12 does not exist; the chapter has P1 to P10/,
    )
  })

  it('rejects overlapping sections', () => {
    const bad = structuredClone(outline)
    bad.sections[1]!.paragraphs.from = 4
    const r = outlineSchemaFor(12).safeParse(bad)
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toMatch(/overlap at P4/)
  })

  it('rejects a subsection outside its section', () => {
    const bad = structuredClone(outline)
    bad.sections[2]!.subsections[0]!.paragraphs = { from: 9, to: 11 }
    expect(outlineSchemaFor(12).safeParse(bad).success).toBe(false)
  })

  it('rejects unknown shapes, empty titles and more than 7 sections', () => {
    const bad1 = structuredClone(outline) as unknown as { sections: Array<Record<string, unknown>> }
    bad1.sections[0]!.shape = 'spiral'
    expect(outlineSchemaFor(12).safeParse(bad1).success).toBe(false)

    const bad2 = structuredClone(outline)
    bad2.sections[0]!.title = '   '
    expect(outlineSchemaFor(12).safeParse(bad2).success).toBe(false)

    const many = {
      sections: Array.from({ length: 8 }, (_, i) => ({
        ...outline.sections[0]!,
        paragraphs: { from: i + 1, to: i + 1 },
      })),
    }
    expect(outlineSchemaFor(12).safeParse(many).success).toBe(false)
  })

  it('normalizeOutline fills gaps so every paragraph belongs to exactly one section', () => {
    const gappy = structuredClone(outline)
    gappy.sections[0]!.paragraphs = { from: 2, to: 3 } // P1 and P4 uncovered
    gappy.sections[2]!.paragraphs = { from: 10, to: 11 } // P12 uncovered
    const n = normalizeOutline(gappy, 12)
    expect(n.sections.map((s) => s.paragraphs)).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 9 },
      { from: 10, to: 12 },
    ])
  })

  it('normalizeOutline sorts sections by position', () => {
    const shuffled = {
      sections: [outline.sections[2]!, outline.sections[0]!, outline.sections[1]!],
    }
    expect(normalizeOutline(shuffled, 12).sections.map((s) => s.title)).toEqual([
      'Structure',
      'Transport',
      'Signaling',
    ])
  })
})

const details: DetailsResponse = {
  blocks: [
    {
      key: 'b1',
      parent: null,
      title: 'Passive Transport',
      summary: 'Movement down a gradient without energy',
      type: 'concept',
      importance: 'core',
      details: [{ kind: 'bullet', text: 'No ATP needed' }],
      source: [5, 6],
      added: false,
    },
    {
      key: 'b2',
      parent: null,
      title: 'Active Transport',
      summary: 'Movement against a gradient using ATP',
      type: 'concept',
      importance: 'core',
      details: [],
      source: [7, 8],
      added: false,
    },
    {
      key: 'b3',
      parent: 'b2',
      title: 'Sodium–Potassium Pump',
      summary: 'Classic example of active transport',
      type: 'example',
      importance: 'supporting',
      details: [],
      source: [],
      added: true,
      added_reason: 'Common textbook example not named in the notes',
    },
  ],
  relations: [{ from: 'b1', to: 'b2', type: 'contrasts_with', label: 'opposite of' }],
  flashcards: [{ block: 'b2', front: 'What powers active transport?', back: 'ATP' }],
}

describe('details schema', () => {
  const schema = detailsSchemaFor(12)

  it('accepts a valid section', () => {
    expect(schema.safeParse(details).success).toBe(true)
  })

  it('fills defaults for missing optional arrays', () => {
    const minimal = { blocks: [{ ...details.blocks[0]!, details: undefined, source: [1] }] }
    const r = schema.safeParse(minimal)
    expect(r.success).toBe(true)
    expect(r.data?.relations).toEqual([])
    expect(r.data?.blocks[0]?.details).toEqual([])
  })

  const cases: Array<[string, (d: DetailsResponse) => void, RegExp]> = [
    ['duplicate keys', (d) => (d.blocks[1]!.key = 'b1'), /Duplicate block key/],
    ['unknown parent', (d) => (d.blocks[2]!.parent = 'b9'), /Parent "b9" is not a block key/],
    ['self parent', (d) => (d.blocks[2]!.parent = 'b3'), /cannot be its own parent/],
    ['cycle', (d) => (d.blocks[1]!.parent = 'b3'), /cycle/],
    ['citation out of range', (d) => (d.blocks[0]!.source = [5, 13]), /P13 does not exist/],
    ['added without reason', (d) => (d.blocks[2]!.added_reason = null), /added_reason is required/],
    ['no citation and not added', (d) => (d.blocks[0]!.source = []), /Cite at least one paragraph/],
    ['relation to unknown block', (d) => (d.relations[0]!.to = 'b7'), /Relation to "b7"/],
    ['self relation', (d) => (d.relations[0]!.to = 'b1'), /two different blocks/],
    ['flashcard for unknown block', (d) => (d.flashcards[0]!.block = 'zz'), /Flashcard block "zz"/],
  ]

  it.each(cases)('rejects %s', (_name, mutate, message) => {
    const bad = structuredClone(details)
    mutate(bad)
    const r = schema.safeParse(bad)
    expect(r.success).toBe(false)
    expect(r.error?.issues.map((i) => i.message).join(' | ')).toMatch(message)
  })

  it('rejects more than 7 children under one parent and says to add a grouping block', () => {
    const many: DetailsResponse = {
      ...details,
      relations: [],
      flashcards: [],
      blocks: Array.from({ length: 8 }, (_, i) => ({ ...details.blocks[0]!, key: `k${i}` })),
    }
    const r = schema.safeParse(many)
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toMatch(
      /8 children; the maximum is 7. Add a grouping block/,
    )
  })

  it('rejects unknown block and relation types', () => {
    const bad1 = structuredClone(details) as unknown as { blocks: Array<Record<string, unknown>> }
    bad1.blocks[0]!.type = 'opinion'
    expect(schema.safeParse(bad1).success).toBe(false)
    const bad2 = structuredClone(details) as unknown as {
      relations: Array<Record<string, unknown>>
    }
    bad2.relations[0]!.type = 'loves'
    expect(schema.safeParse(bad2).success).toBe(false)
  })
})

describe('toDetailBlock', () => {
  it('maps every flat kind to its typed block', () => {
    expect(toDetailBlock({ kind: 'bullet', text: 'Needs ATP' })).toEqual({
      kind: 'bullet',
      text: 'Needs ATP',
    })
    expect(
      toDetailBlock({
        kind: 'vocab',
        text: 'Baum',
        extra: 'tree',
        article: 'der',
        plural: 'die Bäume',
      }),
    ).toEqual({
      kind: 'vocab',
      term: 'Baum',
      meaning: 'tree',
      article: 'der',
      plural: 'die Bäume',
    })
    expect(toDetailBlock({ kind: 'formula', text: 'E = mc^2', extra: 'E energy' })).toEqual({
      kind: 'formula',
      latex: 'E = mc^2',
      variables: 'E energy',
    })
    expect(
      toDetailBlock({ kind: 'question', text: 'What is ATP?', extra: 'Energy carrier' }),
    ).toEqual({
      kind: 'question',
      front: 'What is ATP?',
      back: 'Energy carrier',
    })
    expect(toDetailBlock({ kind: 'example', text: 'Ich lerne.', extra: 'I learn.' })).toEqual({
      kind: 'example',
      text: 'Ich lerne.',
      translation: 'I learn.',
    })
  })
})

describe('style rules (warnings only)', () => {
  it('counts words in English, German and Arabic', () => {
    expect(countWords('Active  Transport ')).toBe(2)
    expect(countWords('Die Zellmembran')).toBe(2)
    expect(countWords('النقل النشط عبر الغشاء')).toBe(4)
  })

  it('flags long titles and summaries but nothing on a clean outline', () => {
    expect(checkOutlineRules(outline)).toEqual([])
    const long = structuredClone(outline)
    long.sections[0]!.title = 'A very long section title with too many words'
    long.sections[0]!.summary =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen'
    expect(checkOutlineRules(long).map((w) => w.rule)).toEqual(['title_words', 'summary_words'])
  })

  it('flags when more than half of the blocks are core', () => {
    const allCore: DetailsResponse = {
      ...details,
      blocks: Array.from({ length: 4 }, (_, i) => ({
        ...details.blocks[0]!,
        key: `c${i}`,
        importance: 'core' as const,
      })),
    }
    expect(checkDetailsRules(allCore).some((w) => w.rule === 'core_ratio')).toBe(true)
    expect(checkDetailsRules(details).some((w) => w.rule === 'core_ratio')).toBe(false)
  })

  it('warnings contain counts, never content', () => {
    const long = structuredClone(details)
    long.blocks[0]!.title = 'secret words from a private chapter go here'
    const json = JSON.stringify(checkDetailsRules(long))
    expect(json).not.toContain('secret')
  })
})
