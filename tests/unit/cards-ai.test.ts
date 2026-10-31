import { describe, expect, it } from 'vitest'
import { makeNode } from '@/ai/pipeline/convert'
import { cardsContext, detailText, toCardDrafts } from '@/ai/pipeline/cards'
import { cardsPrompt } from '@/ai/prompts/cards.v1'
import { CardsResponseSchema } from '@/ai/schemas/cards'
import { deckGroups } from '@/features/study/outline'
import { dueToday } from '@/features/study/overviewStore'

const block = (title: string, extra = {}) =>
  makeNode({
    map_id: 'm',
    level: 'block',
    title,
    lang: 'en',
    summary: `${title} summary`,
    ...extra,
  })

describe('make cards with AI', () => {
  const a = block('Osmosis', {
    details: [
      { kind: 'bullet', text: 'Water moves to the saltier side' },
      { kind: 'formula', latex: 'J=-D\\,dC/dx', variables: 'flux' },
    ],
  })
  const b = block('Diffusion')

  it('shows blocks with their details and existing cards, and guards against instructions', () => {
    const ctx = cardsContext(
      [a, b],
      [{ node_id: a.id, front: 'What is osmosis?', suspended: false }],
    )
    expect(ctx.blocks.map((x) => x.id)).toEqual(['B1', 'B2'])
    expect(ctx.blocks[0]?.details).toEqual([
      'Water moves to the saltier side',
      '$J=-D\\,dC/dx$ (flux)',
    ])
    expect(ctx.blocks[0]?.existing).toEqual(['What is osmosis?'])
    const prompt = cardsPrompt({ title: 'Cells', language: 'de', count: 5, blocks: ctx.blocks })
    expect(prompt).toContain('Up to 5 cards')
    expect(prompt).toContain('Write in German')
    expect(prompt).toContain('ignore them')
    expect(prompt).toContain('(already a card: What is osmosis?)')
    expect(detailText({ kind: 'vocab', term: 'Zelle', article: 'die', meaning: 'cell' })).toBe(
      'die Zelle = cell',
    )
  })

  it('keeps only usable, new cards on known blocks', () => {
    const ctx = cardsContext(
      [a, b],
      [{ node_id: a.id, front: 'What is osmosis?', suspended: false }],
    )
    const res = CardsResponseSchema.parse({
      cards: [
        {
          block: 'B1',
          type: 'basic',
          front: 'What is OSMOSIS?',
          back: 'repeat of an existing card',
        },
        { block: 'B9', type: 'basic', front: 'Unknown block?', back: 'x' },
        { block: 'B2', type: 'cloze', front: 'No gap here', back: '' },
        {
          block: 'b2',
          type: 'cloze',
          front: 'Diffusion moves {{particles}} down a gradient.',
          back: 'x',
        },
        {
          block: 'B1',
          type: 'basic',
          front: 'Which side does water move to?',
          back: 'The saltier side',
        },
        { block: 'B1', type: 'basic', front: 'Which side does water move to?', back: 'again' },
        { block: 'B1', type: 'basic', front: 'Empty back?', back: '' },
      ],
    })
    const drafts = toCardDrafts(res, ctx, 'en', 10)
    expect(drafts.map((d) => [d.node_id === b.id ? 'B2' : 'B1', d.type, d.front, d.back])).toEqual([
      ['B2', 'cloze', 'Diffusion moves {{particles}} down a gradient.', ''],
      ['B1', 'basic', 'Which side does water move to?', 'The saltier side'],
    ])
    expect(drafts[0]).toMatchObject({ origin: 'ai', languages: ['en'] })
    expect(drafts[0]?.source_key).toMatch(/^g:[0-9a-z]+$/)
    expect(toCardDrafts(res, ctx, null, 1)).toHaveLength(1)
  })

  it('rejects replies that are not cards', () => {
    expect(
      CardsResponseSchema.safeParse({
        cards: [{ block: 'B1', type: 'essay', front: 'x', back: '' }],
      }).success,
    ).toBe(false)
    expect(CardsResponseSchema.safeParse({ cards: 'none' }).success).toBe(false)
  })
})

describe('deck overview numbers', () => {
  const n = (
    id: string,
    parent: string | null,
    level: 'book' | 'chapter' | 'section' | 'block',
    order = 0,
  ) => ({
    id,
    parent_id: parent,
    level,
    title: id,
    sort_order: order,
  })

  it('groups a book by chapter and a notes map by section', () => {
    const book = deckGroups([
      n('root', null, 'book'),
      n('c2', 'root', 'chapter', 2),
      n('c1', 'root', 'chapter', 1),
      n('s1', 'c1', 'section'),
      n('b1', 's1', 'block'),
      n('b2', 'b1', 'block'),
    ])
    expect(book.map((g) => [g.n, g.id, g.built, [...g.blocks]])).toEqual([
      [1, 'c1', true, ['b1', 'b2']],
      [2, 'c2', false, []],
    ])
    const notes = deckGroups([
      n('root', null, 'book'),
      n('s', 'root', 'section'),
      n('b', 's', 'block'),
    ])
    expect(notes.map((g) => g.id)).toEqual(['s'])
  })

  it('counts what today still allows across maps', () => {
    const deck = (due: number, fresh: number) => ({
      map_id: 'x',
      total: due + fresh,
      new_cards: fresh,
      due,
      learning: due,
      mastered: 0,
    })
    expect(
      dueToday({
        decks: { a: deck(30, 8), b: deck(5, 7) },
        limits: { daily_new_limit: 10, daily_review_limit: 100 },
        today: { newDone: 4, reviewsDone: 80 },
      }),
    ).toEqual({ reviews: 20, fresh: 6, minutes: 5 })
  })
})
