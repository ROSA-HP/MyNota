import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import katex from 'katex'
import { RichMathText, standardLatex } from '@/components/ui/MathFormula'
import { splitInlineMath } from '@/components/ui/inlineMath'

describe('inline math tokenizer and RichMathText', () => {
  it('extracts bare LaTeX symbols in variable legends while keeping prose descriptions', () => {
    const input =
      '\\vec{S} = Poynting vector; \\mu_0 = permeability constant; \\vec{E} = electric field; \\vec{B} = magnetic field'
    const segments = splitInlineMath(input)
    expect(segments).toEqual([
      { kind: 'math', latex: '\\vec{S}' },
      { kind: 'text', text: ' = Poynting vector; ' },
      { kind: 'math', latex: '\\mu_0' },
      { kind: 'text', text: ' = permeability constant; ' },
      { kind: 'math', latex: '\\vec{E}' },
      { kind: 'text', text: ' = electric field; ' },
      { kind: 'math', latex: '\\vec{B}' },
      { kind: 'text', text: ' = magnetic field' },
    ])
  })

  it('keeps connected multi-term bare equations as single KaTeX runs', () => {
    expect(splitInlineMath('\\omega = \\frac{1}{\\sqrt{LC}}')).toEqual([
      { kind: 'math', latex: '\\omega = \\frac{1}{\\sqrt{LC}}' },
    ])

    expect(
      splitInlineMath('All electromagnetic waves travel at c \\approx 3.0 \\times 10^8\\text{ m/s} in vacuum.'),
    ).toEqual([
      { kind: 'text', text: 'All electromagnetic waves travel at ' },
      { kind: 'math', latex: 'c \\approx 3.0 \\times 10^8\\text{ m/s}' },
      { kind: 'text', text: ' in vacuum.' },
    ])

    expect(splitInlineMath('Propagation uses \\vec{E} \\times \\vec{B} right-hand rule.')).toEqual([
      { kind: 'text', text: 'Propagation uses ' },
      { kind: 'math', latex: '\\vec{E} \\times \\vec{B}' },
      { kind: 'text', text: ' right-hand rule.' },
    ])
  })

  it('handles unbraced subscripts, inverse trig, Greek words, and degree symbols', () => {
    expect(splitInlineMath('I = E_rms^2 / (c \\mu_0)')).toEqual([
      { kind: 'math', latex: 'I = E_rms^2 / (c \\mu_0)' },
    ])
    expect(standardLatex('I = E_rms^2 / (c \\mu_0)')).toBe('I = E_{\\mathrm{rms}}^2 / (c \\mu_0)')

    expect(splitInlineMath('theta_B = arctan(n_2 / n_1)')).toEqual([
      { kind: 'math', latex: '\\theta_B = arctan(n_2 / n_1)' },
    ])
    expect(standardLatex('\\theta_B = arctan(n_2 / n_1)')).toBe('\\theta_B = \\arctan(n_2 / n_1)')

    expect(splitInlineMath('They are perpendicular: theta_B + theta_r = 90°.')).toEqual([
      { kind: 'text', text: 'They are perpendicular: ' },
      { kind: 'math', latex: '\\theta_B + \\theta_r = 90^{\\circ}' },
      { kind: 'text', text: '.' },
    ])

    expect(
      splitInlineMath(
        '\\Delta p = transferred momentum; E_{\\text{rms}} = root-mean-square electric field',
      ),
    ).toEqual([
      { kind: 'math', latex: '\\Delta p' },
      { kind: 'text', text: ' = transferred momentum; ' },
      { kind: 'math', latex: 'E_{\\text{rms}}' },
      { kind: 'text', text: ' = root-mean-square electric field' },
    ])
  })

  it('typesets every extracted expression without KaTeX errors', () => {
    const samples = [
      'I = (1/2) * I_0.',
      'I = I_0 * cos^2(theta), where theta is the angle.',
      'c = \\frac{1}{\\sqrt{\\mu_0 \\epsilon_0}} \\approx 3.0 \\times 10^8\\text{ m/s}',
      'u_E = u_B',
      'I = P_s / (4\\pi r^2)',
      'p_r = I / c',
      '\\Delta p = 2\\Delta U / c',
    ]

    for (const s of samples) {
      const mathRuns = splitInlineMath(s).filter((seg) => seg.kind === 'math')
      expect(mathRuns.length).toBeGreaterThan(0)
      for (const m of mathRuns) {
        expect(() =>
          katex.renderToString(standardLatex(m.latex), {
            displayMode: false,
            throwOnError: true,
          }),
        ).not.toThrow()
      }
    }
  })

  it('does not misclassify plain prose, units, currency, or snake_case words', () => {
    const prose = [
      'Measured in SI units of watts per square meter (W/m²).',
      'Produces primary rainbows at a 42° viewing angle.',
      'Costs $5 and saves $10 in practice.',
      'Here n = 1.5 for glass and score = good.',
      'A plain identifier process_step stays text.',
    ]
    for (const line of prose) {
      expect(splitInlineMath(line)).toEqual([{ kind: 'text', text: line }])
    }
  })

  it('renders delimited and bare equations into .katex nodes via RichMathText', () => {
    const { container } = render(
      <RichMathText text={'Intensity $I = I_0$ and vector \\vec{S} with \\mu_0.'} />,
    )
    expect(container.querySelectorAll('.katex').length).toBe(3)
    expect(container.textContent).not.toContain('\\vec{S}')
    expect(container.textContent).not.toContain('\\mu_0')
  })

  it('handles Unicode subscripts/superscripts, Delta expressions, and legend variables cleanly', () => {
    const samples = [
      'I = E_rms² / (c μ₀)',
      'I = P_s / (4π r²)',
      'Δp = 2ΔU / c',
      'I = I_0 cos² θ',
    ]
    for (const s of samples) {
      const segs = splitInlineMath(s)
      const mathRuns = segs.filter((seg) => seg.kind === 'math')
      expect(mathRuns).toHaveLength(1)
      expect(segs).toEqual([mathRuns[0]])
      expect(() =>
        katex.renderToString(standardLatex(mathRuns[0]!.latex), {
          displayMode: false,
          throwOnError: true,
        }),
      ).not.toThrow()
    }

    const legend =
      'I = wave intensity; P_s = power of source; r = radial distance; \\omega = angular frequency; L = inductance; C = capacitance'
    const legendSegs = splitInlineMath(legend, { legend: true })
    const legendMath = legendSegs.filter((s) => s.kind === 'math').map((s) => s.latex)
    expect(legendMath).toEqual(['I', 'P_s', 'r', '\\omega', 'L', 'C'])

    const { container } = render(
      <RichMathText text="u_B = magnetic energy density; \\mu_0 = permeability constant; B = magnetic field" legend />,
    )
    expect(container.querySelectorAll('.katex').length).toBe(3)
    expect(container.textContent).not.toContain('\\mu_0')
  })

  it('repairs JSON-mangled control characters before known LaTeX commands without hurting prose', () => {
    const mangled = 'Poynting vector \u000bec{S} uses \\mu_0 and \theta_B = 90°;\nNext sentence.'
    const segs = splitInlineMath(mangled)
    expect(segs.some((s) => s.kind === 'math' && s.latex === '\\vec{S}')).toBe(true)
    expect(segs.some((s) => s.kind === 'math' && s.latex.includes('\\theta_B'))).toBe(true)
    expect(segs.some((s) => s.kind === 'text' && s.text.includes('\nNext sentence.'))).toBe(true)

    expect(splitInlineMath('Measured in (W/m²).')).toEqual([
      { kind: 'text', text: 'Measured in (W/m²).' },
    ])
  })
})
