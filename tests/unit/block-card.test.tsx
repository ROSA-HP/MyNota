import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeNode } from '@/ai/pipeline/convert'
import { MathFormula, standardLatex } from '@/components/ui/MathFormula'
import { SIZES, blockCard } from '@/features/workspace/canvas/layout'

afterEach(cleanup)

const MAP = '9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70'

describe('block cards (canvas step 1)', () => {
  it('a bare title keeps the old compact size', () => {
    const n = makeNode({ map_id: MAP, level: 'block', title: 'Osmosis' })
    expect(blockCard(n)).toMatchObject({ titleLines: 1, summaryLines: 0, formula: null })
    expect(blockCard(n).h).toBe(SIZES.blockH)
  })

  it('grows for the summary, a formula and badges, in that order', () => {
    const base = makeNode({
      map_id: MAP,
      level: 'block',
      title: 'Single-Slit Minima Condition',
      summary: 'Dark fringes appear where waves from the slit cancel out.',
    })
    const withSummary = blockCard(base)
    expect(withSummary.summaryLines).toBe(2)
    const withFormula = blockCard({
      ...base,
      details: [{ kind: 'formula', latex: '\\sin\\theta = m\\frac{\\lambda}{a}' }],
    })
    expect(withFormula.formula).toBe('\\sin\\theta = m\\frac{\\lambda}{a}')
    expect(withFormula.h).toBe(withSummary.h + 60)
    const core = blockCard({ ...base, importance: 'core' })
    expect(core.h).toBe(withSummary.h + 26)
  })

  it('caps long titles and summaries (the card clamps them)', () => {
    const n = makeNode({
      map_id: MAP,
      level: 'block',
      title: 'x '.repeat(80),
      summary: 'y '.repeat(300),
    })
    expect(blockCard(n)).toMatchObject({ titleLines: 2, summaryLines: 2 }) // short cards
  })
})

describe('formulas', () => {
  it('are typeset', () => {
    const { container } = render(<MathFormula latex="\frac{\lambda}{a}" />)
    expect(container.querySelector('.katex')).not.toBeNull()
    expect(container.querySelector('.mfrac')).not.toBeNull()
  })

  it('never become links or raw HTML (the LaTeX comes from the AI)', () => {
    const { container } = render(
      <MathFormula latex="\href{javascript:alert(1)}{x} \htmlClass{evil}{y} \url{https://x.y}" />,
    )
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('.evil')).toBeNull()
    expect(container.innerHTML).not.toContain('javascript:')
  })

  it('read like textbook equations: word subscripts upright, functions as functions', () => {
    expect(standardLatex('\\sin\\theta_{dark} = m\\frac{\\lambda}{a}')).toBe(
      '\\sin\\theta_{\\mathrm{dark}} = m\\frac{\\lambda}{a}',
    )
    expect(standardLatex('I = I_{max}')).toBe('I = I_{\\mathrm{max}}')
    expect(standardLatex('x_{i} + y^{2} + E_k')).toBe('x_{i} + y^{2} + E_k') // variables stay
    expect(standardLatex('d sin\\theta = m\\lambda')).toBe('d \\sin\\theta = m\\lambda')
    expect(standardLatex('\\sin x + \\cos y + \\ln z')).toBe('\\sin x + \\cos y + \\ln z')
    expect(standardLatex('\\arcsin x')).toBe('\\arcsin x') // never doubles a backslash command
  })

  it('show broken LaTeX as plain text', () => {
    const { container } = render(<MathFormula latex="\frac{1" />)
    expect(container.textContent).toBe('\\frac{1')
  })
})
