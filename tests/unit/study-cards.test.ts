import { describe, expect, it } from 'vitest'
import { makeNode } from '@/ai/pipeline/convert'
import { cardsForBlock, missingCards, shortHash } from '@/features/study/autoCards'
import { blockMastery, cardMastery, deckCounts, masteryByBlock } from '@/features/study/mastery'
import type { CardProgressRow, CardRow, NodeRow } from '@/lib/database.types'

const block = (p: Partial<NodeRow>) =>
  makeNode({ map_id: 'm', level: 'block', title: 'Osmosis', lang: 'en', ...p })

describe('cards made from blocks', () => {
  it('uses the AI’s card ideas first, keyed by their text', () => {
    const n = block({
      type: 'concept',
      summary: 'Water moves',
      details: [
        { kind: 'bullet', text: 'x' },
        { kind: 'question', front: 'What is osmosis?', back: 'Water diffusion' },
        { kind: 'cloze', text: 'Osmosis moves {{water}} across a membrane.' },
        { kind: 'cloze', text: 'no gap here' },
      ],
    })
    const cards = cardsForBlock(n)
    expect(cards.map((c) => [c.type, c.origin, c.front])).toEqual([
      ['basic', 'ai', 'What is osmosis?'],
      ['cloze', 'ai', 'Osmosis moves {{water}} across a membrane.'],
    ])
    expect(cards[0]?.source_key).toBe(`q:${shortHash('What is osmosis?')}`)
    expect(cards[0]?.languages).toEqual(['en'])
  })

  it('makes one card per block type that calls for it', () => {
    expect(cardsForBlock(block({ type: 'definition', summary: 'Water diffusion' }))).toMatchObject([
      {
        type: 'basic',
        front: 'Osmosis',
        back: 'Water diffusion',
        origin: 'auto',
        source_key: 'type',
      },
    ])
    expect(cardsForBlock(block({ type: 'concept', summary: 'x' }))).toEqual([])
    expect(cardsForBlock(block({ type: 'key_fact', summary: '' }))).toEqual([]) // nothing to ask
    expect(
      cardsForBlock(
        block({
          type: 'formula',
          title: 'Fick',
          details: [{ kind: 'formula', latex: 'J=-D\\,dC/dx' }],
        }),
      )[0],
    ).toMatchObject({ front: 'Fick', back: '$J=-D\\,dC/dx$' })
    const vocab = cardsForBlock(
      block({
        type: 'vocabulary',
        lang: 'de',
        details: [
          {
            kind: 'vocab',
            term: 'Zellmembran',
            article: 'die',
            meaning: 'cell membrane',
            plural: 'Zellmembranen',
            lang: 'de',
          },
        ],
      }),
    )
    expect(vocab).toMatchObject([
      {
        type: 'vocab',
        front: 'die Zellmembran',
        back: 'cell membrane (Zellmembranen)',
        languages: ['de'],
      },
    ])
    expect(
      cardsForBlock(
        makeNode({ map_id: 'm', level: 'section', title: 'S', type: 'definition', summary: 'x' }),
      ),
    ).toEqual([])
  })

  it('adds only what is missing, so a sync never repeats a card', () => {
    const a = block({ type: 'definition', summary: 'Water diffusion' })
    const b = block({ type: 'event', title: '1665', summary: 'Hooke sees cells' })
    expect(
      missingCards([a, b], [{ node_id: a.id, source_key: 'type' }]).map((d) => d.node_id),
    ).toEqual([b.id])
  })
})

const progress = (p: Partial<CardProgressRow>): CardProgressRow => ({
  card_id: 'c',
  user_id: 'u',
  map_id: 'm',
  due: new Date(Date.now() - 1000).toISOString(),
  stability: 1,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 0,
  learning_steps: 0,
  reps: 1,
  lapses: 0,
  state: 1,
  last_review: null,
  updated_at: '',
  ...p,
})
const card = (id: string, node: string | null, extra: Partial<CardRow> = {}): CardRow => ({
  id,
  map_id: 'm',
  node_id: node,
  type: 'basic',
  front: 'Q',
  back: 'A',
  languages: [],
  origin: 'auto',
  source_key: 'type',
  suspended: false,
  created_by: null,
  created_at: '',
  updated_at: '',
  ...extra,
})

describe('mastery', () => {
  it('reads a card’s state', () => {
    expect(cardMastery(undefined)).toBe('new')
    expect(cardMastery(progress({ state: 1 }))).toBe('learning')
    expect(cardMastery(progress({ state: 3 }))).toBe('struggling')
    expect(cardMastery(progress({ state: 2, lapses: 2, stability: 5 }))).toBe('struggling')
    expect(cardMastery(progress({ state: 2, stability: 30 }))).toBe('mastered')
  })

  it('gives each block one dot', () => {
    expect(blockMastery([])).toBeNull()
    expect(blockMastery(['mastered', 'struggling'])).toBe('struggling')
    expect(blockMastery(['new', 'new'])).toBe('new')
    expect(blockMastery(['mastered', 'mastered'])).toBe('mastered')
    expect(blockMastery(['mastered', 'new'])).toBe('learning')
    const cards = [
      card('1', 'a'),
      card('2', 'a'),
      card('3', 'b', { suspended: true }),
      card('4', null),
    ]
    expect(
      masteryByBlock(cards, { '1': progress({ card_id: '1', state: 2, stability: 40 }) }),
    ).toEqual({
      a: 'learning',
    })
  })

  it('counts a deck like deck_stats()', () => {
    const cards = [
      card('1', 'a'),
      card('2', 'a'),
      card('3', 'b'),
      card('4', 'b', { suspended: true }),
    ]
    const later = new Date(Date.now() + 86_400_000).toISOString()
    expect(
      deckCounts(cards, {
        '2': progress({ card_id: '2', state: 1 }),
        '3': progress({ card_id: '3', state: 2, stability: 40, due: later }),
      }),
    ).toEqual({ total: 3, newCards: 1, due: 1, learning: 1, mastered: 1 })
  })
})
