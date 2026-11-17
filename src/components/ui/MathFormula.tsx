import { Fragment, useLayoutEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/cn'
import { splitInlineMath } from './inlineMath'

/**
 * Makes AI-written LaTeX read like a textbook equation (only for display; stored text is kept):
 * - word subscripts and superscripts are upright text, not a product of italic letters:
 *   θ_{dark} → θ_{\mathrm{dark}}, E_rms → E_{\mathrm{rms}}, I_{max} → I_{\mathrm{max}};
 * - function names written without a backslash are typeset as functions: sin x → \sin x,
 *   arctan x → \arctan x.
 */
export function standardLatex(latex: string): string {
  const protectedSpans: string[] = []
  const protectedLatex = latex.replace(/\\(?:text|mathrm|mathbf|mathit)\{[^{}]*\}/g, (m) => {
    const idx = protectedSpans.length
    protectedSpans.push(m)
    return `\uE000${idx}\uE001`
  })

  const normalized = protectedLatex
    .replace(
      /([_^])([A-Za-z]{2,})(?![A-Za-z{])/g,
      (_m, mark: string, word: string) => `${mark}{\\mathrm{${word}}}`,
    )
    .replace(
      /([_^])\{([A-Za-z]{2,}(?:\s+[A-Za-z]+)*)\}/g,
      (_m, mark: string, word: string) => `${mark}{\\mathrm{${word}}}`,
    )
    .replace(
      /(^|[^\\A-Za-z])(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|log|ln|exp)(?![A-Za-z])/g,
      '$1\\$2',
    )

  return normalized.replace(/\uE000(\d+)\uE001/g, (_m, idxStr: string) => {
    const idx = Number(idxStr)
    return protectedSpans[idx] ?? ''
  })
}

/**
 * A formula typeset with KaTeX. The LaTeX comes from the AI, so it is untrusted:
 * - KaTeX builds DOM nodes (katex.render); nothing goes through innerHTML, and styles are set
 *   through the DOM, which the strict Content Security Policy allows.
 * - trust: false turns off \href, \url, \includegraphics and \html…; sizes and macro expansion
 *   are capped so a formula cannot freeze the page.
 * - Anything KaTeX cannot read is shown as the plain LaTeX text.
 * Display style by default: fractions and sums at full size, like a textbook equation.
 */
export function MathFormula({
  latex,
  display = true,
  className,
}: {
  latex: string
  display?: boolean
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    try {
      katex.render(standardLatex(latex.slice(0, 2000)), el, {
        displayMode: display,
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        maxSize: 10,
        maxExpand: 200,
        output: 'html',
      })
    } catch {
      el.textContent = latex
    }
  }, [latex, display])

  // Formulas read left to right in every language.
  return (
    <span
      ref={ref}
      dir="ltr"
      style={display ? undefined : { unicodeBidi: 'isolate' }}
      className={cn('mynota-math', !display && 'mynota-math-inline', className)}
    />
  )
}

/**
 * Renders prose containing delimited ($...$, \(...\)) or bare LaTeX expressions
 * (\vec{S}, \mu_0, \frac{1}{\sqrt{LC}}, u_E, theta_B) with inline KaTeX math.
 */
export function RichMathText({ text, className }: { text: string; className?: string }) {
  const segments = splitInlineMath(text)
  if (segments.length === 0) return null
  if (segments.length === 1 && segments[0]?.kind === 'text') {
    return className ? <span className={className}>{segments[0].text}</span> : <>{segments[0].text}</>
  }

  const content = segments.map((seg, idx) =>
    seg.kind === 'math' ? (
      <MathFormula key={idx} latex={seg.latex} display={false} />
    ) : (
      <Fragment key={idx}>{seg.text}</Fragment>
    ),
  )

  return className ? <span className={className}>{content}</span> : <>{content}</>
}

