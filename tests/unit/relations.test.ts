import { describe, expect, it } from 'vitest'
import { formulaLabel, plainFormula } from '@/ai/pipeline/formulas'
import { pruneRelations, relationBudget, vagueLabel } from '@/ai/pipeline/relations'
import { DetailsResponseSchema } from '@/ai/schemas/details'

// Few arrows, each worth drawing (owner, 2026-11-03).
const block = (key: string, parent: string | null = null) => ({
  key,
  parent,
  title: `Block ${key}`,
  summary: '',
  type: 'concept' as const,
  importance: 'supporting' as const,
  details: [],
  source: [1],
  added: false,
})

function reply(
  keys: Array<[string, string | null]>,
  relations: Array<[string, string, string, string]>,
) {
  return DetailsResponseSchema.parse({
    blocks: keys.map(([k, p]) => block(k, p)),
    relations: relations.map(([from, to, type, label]) => ({ from, to, type, label })),
  })
}

describe('trimming the arrows of a section', () => {
  it('drops what the tree already shows, vague labels, self links and repeats', () => {
    const r = reply(
      [
        ['a', null],
        ['b', 'a'],
        ['c', 'b'],
        ['d', null],
        ['e', null],
        ['f', null],
        ['g', null],
        ['h', null],
      ],
      [
        ['a', 'b', 'causes', 'sets the condition'], // parent → child
        ['a', 'c', 'causes', 'sets the condition'], // ancestor → grandchild
        ['d', 'e', 'related', 'related'], // vague
        ['d', 'f', 'leads_to', 'see also'], // vague
        ['g', 'g', 'causes', 'feeds itself'], // self
        ['c', 'd', 'causes', 'raises the pressure'],
        ['d', 'c', 'causes', 'raises it again'], // same pair
      ],
    )
    expect(pruneRelations(r).relations).toEqual([
      { from: 'c', to: 'd', type: 'causes', label: 'raises the pressure' },
    ])
  })

  it('keeps only the strongest few: about one per four blocks', () => {
    expect([4, 8, 12, 40].map(relationBudget)).toEqual([1, 2, 3, 4])
    const keys: Array<[string, string | null]> = 'abcdefgh'.split('').map((k) => [k, null])
    const r = reply(keys, [
      ['a', 'b', 'analogy', 'works like a lens'],
      ['c', 'd', 'causes', 'heats the gas'],
      ['e', 'f', 'part_of', 'inside the cell'],
      ['g', 'h', 'derived_from', 'follows from Snell'],
    ])
    // Eight blocks keep two arrows: the cause and the derivation, in the reply's order.
    expect(pruneRelations(r).relations.map((x) => x.label)).toEqual([
      'heats the gas',
      'follows from Snell',
    ])
  })

  it('never makes a card a hub: at most two arrows per card', () => {
    const keys: Array<[string, string | null]> = 'abcdefghijklmnop'.split('').map((k) => [k, null])
    const r = reply(keys, [
      ['a', 'b', 'causes', 'sets b'],
      ['a', 'c', 'causes', 'sets c'],
      ['a', 'd', 'causes', 'sets d'],
      ['e', 'f', 'causes', 'sets f'],
    ])
    const kept = pruneRelations(r).relations
    expect(kept.filter((x) => x.from === 'a')).toHaveLength(2)
    expect(kept).toHaveLength(3)
  })

  it('knows a vague label in every app language', () => {
    for (const l of ['', ' Related ', 'see also', 'leads to', 'verwandt', 'مرتبط'])
      expect(vagueLabel(l), l).toBe(true)
    for (const l of ['sets dark fringes', 'limits resolution', 'يحدد الدقة'])
      expect(vagueLabel(l), l).toBe(false)
  })
})

describe('formula arrows say what they carry', () => {
  it('writes the formula in plain symbols', () => {
    expect(plainFormula(String.raw`\sin\theta_{dark} = m\frac{\lambda}{a}`)).toBe(
      'sin θdark = mλ/a',
    )
    expect(plainFormula(String.raw`\theta_{min} = 1.22\frac{\lambda}{D}`)).toBe('θmin = 1.22λ/D')
    expect(plainFormula(String.raw`E = mc^{2}`)).toBe('E = mc²')
    expect(plainFormula(String.raw`v = \frac{d + x}{t}`)).toBe('v = (d + x)/t')
  })

  it('uses the block title when the formula is too long for a label', () => {
    const long = String.raw`I = I_{max}\left[\frac{\sin(\pi a \sin\theta / \lambda)}{\pi a \sin\theta / \lambda}\right]^2`
    expect(formulaLabel(long, 'Single-Slit Intensity Equation')).toBe(
      'Single-Slit Intensity Equation',
    )
    expect(formulaLabel(String.raw`d\sin\theta_{bright} = m\lambda`, 'x')).toBe(
      'd sin θbright = mλ',
    )
  })
})
