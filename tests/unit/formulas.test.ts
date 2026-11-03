import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { blockNodes, makeNode } from '@/ai/pipeline/convert'
import {
  ensureFormulas,
  findEquations,
  fixLatex,
  sameFormula,
  toLatex,
} from '@/ai/pipeline/formulas'
import { DetailsResponseSchema, type DetailsResponse } from '@/ai/schemas/details'
import { extractJson, fixLatexEscapes, generateStructured } from '@/ai/structured'
import type { ProviderAdapter } from '@/ai/types'
import type { DetailBlock } from '@/lib/database.types'

// Formulas never get lost between the notes and the map (2026-11-01).
const MAP = '9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70'

/** Physical-optics notes like the owner's: equations in prose, Unicode symbols, no LaTeX. */
const NOTES = [
  {
    n: 1,
    text: 'Single-slit diffraction: dark fringes appear where a sin θ = mλ, with m = ±1, ±2, …',
  },
  { n: 2, text: 'The intensity is I = I₀ (sin β / β)² where β = πa sin θ / λ.' },
  { n: 3, text: 'Rayleigh criterion: θmin ≈ 1.22 λ/D for a circular aperture.' },
  { n: 4, text: 'Gratings with many slits make sharp, bright lines.' },
]

describe('finding equations in notes', () => {
  it('finds every equation, as written, and stops at the words around it', () => {
    expect(NOTES.flatMap((p) => findEquations(p.text))).toEqual([
      'a sin θ = mλ',
      'I = I₀ (sin β / β)²',
      'β = πa sin θ / λ',
      'θmin ≈ 1.22 λ/D',
    ])
  })

  it('leaves prose and plain values alone', () => {
    expect(findEquations('The score = good, and the result is fine.')).toEqual([])
    expect(findEquations('Here n = 1.5 for glass.')).toEqual([])
  })

  it('takes maths already written as LaTeX as it is', () => {
    expect(
      findEquations(String.raw`* Condition for minima: $\sin\theta = m\frac{\lambda}{a}$.`),
    ).toEqual([String.raw`\sin\theta = m\frac{\lambda}{a}`])
    expect(findEquations(String.raw`where $\lambda$ is the wavelength`)).toEqual([])
    expect(findEquations(String.raw`\[ I = I_0 \cos^2\phi \]`)).toEqual([
      String.raw`I = I_0 \cos^2\phi`,
    ])
  })

  it('reads equations written without spaces', () => {
    expect(findEquations('Newton: F=ma.')).toEqual(['F = ma'])
  })

  it('turns Unicode math into LaTeX', () => {
    const latex = toLatex('I = I₀ (sin β / β)²')
    expect(latex).toContain('I_{0}')
    expect(latex).toContain('\\beta')
    expect(latex).toContain('^{2}')
    expect(toLatex('θmin ≈ 1.22 λ/D')).toBe('\\theta min \\approx 1.22 \\lambda/D')
  })

  it('writes LaTeX the map can typeset', () => {
    for (const eq of NOTES.flatMap((p) => findEquations(p.text)))
      expect(() => katex.renderToString(toLatex(eq), { throwOnError: true })).not.toThrow()
  })

  it('knows the same formula in LaTeX and in plain text', () => {
    expect(sameFormula('a\\sin\\theta = m\\lambda', 'a sin θ = mλ')).toBe(true)
    expect(sameFormula('\\theta_{min} \\approx 1.22\\frac{\\lambda}{D}', 'θmin ≈ 1.22 λ/D')).toBe(
      true,
    )
    expect(sameFormula('a\\sin\\theta = m\\lambda', 'I = I₀ (sin β / β)²')).toBe(false)
  })
})

describe('LaTeX that JSON would mangle', () => {
  it('keeps single-backslash LaTeX instead of failing or turning it into tabs', () => {
    const raw = String.raw`{"a": "\theta = m\lambda", "b": "\frac{a}{b}", "c": "\sqrt{2}", "d": "line\nbreak \"q\" \u00e9"}`
    expect(extractJson(raw)).toEqual({
      a: '\\theta = m\\lambda',
      b: '\\frac{a}{b}',
      c: '\\sqrt{2}',
      d: 'line\nbreak "q" é',
    })
  })

  it('leaves correctly escaped JSON exactly as it was', () => {
    // (A real tab right before a letter is read as LaTeX: \theta, \tau, \times are far more
    // common in replies than tabs.)
    const ok = JSON.stringify({ f: '\\frac{\\lambda}{a}', t: 'line\nnext', q: 'say "hi"' })
    expect(fixLatexEscapes(ok)).toBe(ok)
  })

  it('repairs formulas that were already mangled', () => {
    expect(fixLatex('\theta = m\\\\lambda')).toBe('\\theta = m\\lambda')
    expect(fixLatex('\frac{1}{\nu}')).toBe('\\frac{1}{\\nu}')
  })
})

/** A details reply that forgets formulas the way models do. */
const forgetful: DetailsResponse = DetailsResponseSchema.parse({
  blocks: [
    {
      key: 'b1',
      parent: null,
      title: 'Single-slit minima',
      summary: 'Where dark fringes appear.',
      type: 'formula',
      importance: 'core',
      details: [
        { kind: 'bullet', text: 'Dark fringes form where waves cancel.' },
        { kind: 'formula', text: 'a\\sin\\theta = m\\lambda', extra: 'm = order' },
      ],
      source: [1],
    },
    {
      key: 'b2',
      parent: 'b1',
      title: 'Intensity pattern',
      summary: 'A bright centre with weaker side bands.',
      type: 'concept',
      importance: 'supporting',
      details: [{ kind: 'bullet', text: 'Bright centre, weaker bands outside.' }],
      source: [2],
    },
    {
      key: 'b3',
      parent: null,
      title: 'Rayleigh criterion',
      summary: 'The smallest angle two sources can be told apart.',
      type: 'concept',
      importance: 'core',
      details: [{ kind: 'bullet', text: 'Limit: θmin ≈ 1.22 λ/D for a round lens.' }],
      source: [3, 4],
    },
  ],
})

const formulas = (r: DetailsResponse, key: string) =>
  r.blocks
    .find((b) => b.key === key)
    ?.details.filter((d) => d.kind === 'formula')
    .map((d) => d.text)

describe('the formula safety net', () => {
  const fixed = ensureFormulas(forgetful, NOTES)

  it('adds the equations the reply forgot to the block citing their paragraph', () => {
    expect(formulas(fixed, 'b2')).toEqual([
      toLatex('I = I₀ (sin β / β)²'),
      toLatex('β = πa sin θ / λ'),
    ])
  })

  it('turns an equation written only in a bullet into a formula', () => {
    expect(formulas(fixed, 'b3')).toEqual([toLatex('θmin ≈ 1.22 λ/D')])
  })

  it('never adds a formula the reply already has, and puts formulas first', () => {
    expect(formulas(fixed, 'b1')).toEqual(['a\\sin\\theta = m\\lambda'])
    for (const b of fixed.blocks) expect(b.details[0]?.kind).toBe('formula')
  })

  it('keeps the reply valid', () => {
    expect(DetailsResponseSchema.safeParse(fixed).success).toBe(true)
  })
})

describe('end to end: a forgetful, badly escaped reply still gives a map with every formula', () => {
  it('builds blocks whose first detail is the formula', async () => {
    const reply = JSON.stringify(forgetful).replace(/\\\\/g, '\\') // single backslashes, as models write
    const adapter: ProviderAdapter = {
      provider: 'gemini',
      model: 'fake',
      generate: async () => ({ text: reply }),
    } as unknown as ProviderAdapter // only generate() is used here
    const r = await generateStructured({
      adapter,
      system: '',
      prompt: '',
      schema: DetailsResponseSchema,
      jsonSchema: {},
    })
    expect(r.attempts).toBe(1) // no repair round needed for the backslashes
    const section = makeNode({ map_id: MAP, level: 'section', title: 'Diffraction' })
    const { nodes } = blockNodes(ensureFormulas(r.data, NOTES), {
      mapId: MAP,
      section,
      lang: 'en',
    })
    const first = nodes.map((n) => n.details[0] as DetailBlock | undefined)
    expect(first.every((d) => d?.kind === 'formula')).toBe(true)
    const all = nodes.flatMap((n) => n.details.filter((d) => d.kind === 'formula'))
    expect(all).toHaveLength(4)
    expect(all[0]).toMatchObject({ latex: 'a\\sin\\theta = m\\lambda', variables: 'm = order' })
  })
})

describe('the owner’s physical optics notes (the map that repeated and lost formulas)', async () => {
  const { splitParagraphs } = await import('@/ai/pipeline/prepare')
  const fx = await import('../fixtures/optics-notes')
  const ps = splitParagraphs(fx.OPTICS_NOTES)
  const at = (s: string) => ps.find((p) => p.text.includes(s))?.n ?? 0
  const reply = DetailsResponseSchema.parse(
    fx.screenshotReply({
      core: at('Fraunhofer'),
      slit: at('Intensity equation'),
      gratings: at('bright fringes'),
      resolution: at('circular aperture'),
    }),
  )
  const out = ensureFormulas(reply, ps)
  const on = (title: string) =>
    out.blocks
      .find((b) => b.title === title)
      ?.details.filter((d) => d.kind === 'formula')
      .map((d) => d.text)
  const key = (title: string) => out.blocks.find((b) => b.title === title)?.key

  it('finds the five equations in the notes, not the m = ±1… values', () => {
    expect(ps.flatMap((p) => findEquations(p.text))).toEqual([
      fx.DARK,
      fx.INTENSITY,
      String.raw`d\sin\theta_{bright} = m\lambda`,
      String.raw`\theta_{min} = \frac{\lambda}{a}`,
      String.raw`\theta_{min} = 1.22\frac{\lambda}{D}`,
    ])
  })

  it('puts every formula on exactly one block, the one it belongs to', () => {
    expect(on('Single-Slit Minima Condition')).toEqual([fx.DARK])
    expect(on('Single-Slit Intensity Equation')).toEqual([fx.INTENSITY])
    expect(on('Grating Maxima Condition')).toEqual([String.raw`d\sin\theta_{bright} = m\lambda`])
    expect(on('Limiting Angles of Resolution')).toEqual([
      String.raw`\theta_{min} = \frac{\lambda}{a}`,
      String.raw`\theta_{min} = 1.22\frac{\lambda}{D}`,
    ])
    for (const t of [
      'Diffraction Definition',
      'Fraunhofer Diffraction',
      'Single-Slit Diffraction Pattern',
      'Diffraction Gratings Structure',
      'Rayleigh’s Criterion',
    ])
      expect(on(t)).toEqual([])
    expect(out.blocks.flatMap((b) => b.details.filter((d) => d.kind === 'formula'))).toHaveLength(5)
  })

  it('links the formula to the blocks that use it instead of repeating it', () => {
    const links = out.relations.map((r) => [r.from, r.to, r.type])
    expect(links).toEqual([
      [key('Single-Slit Minima Condition'), key('Diffraction Definition'), 'leads_to'],
      [key('Single-Slit Minima Condition'), key('Fraunhofer Diffraction'), 'leads_to'],
    ])
    // A parent and its child are joined by the tree already; copies on unrelated blocks
    // (the intensity equation on the grating and resolution blocks) are just removed.
    // Each arrow says what it carries: the formula itself, in plain symbols.
    expect(out.relations.map((r) => r.label)).toEqual(['sin θdark = mλ/a', 'sin θdark = mλ/a'])
  })
})
