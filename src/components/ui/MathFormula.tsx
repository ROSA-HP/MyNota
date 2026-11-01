import { useLayoutEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/cn'

/**
 * Makes AI-written LaTeX read like a textbook equation (only for display; stored text is kept):
 * - word subscripts and superscripts are upright text, not a product of italic letters:
 *   θ_{dark} → θ_{\mathrm{dark}}, I_{max} → I_{\mathrm{max}} (single letters stay italic,
 *   they are variables);
 * - function names written without a backslash are typeset as functions: sin x → \sin x.
 */
export function standardLatex(latex: string): string {
  return latex
    .replace(
      /([_^])\{([A-Za-z]{2,}(?:\s+[A-Za-z]+)*)\}/g,
      (_m, mark: string, word: string) => `${mark}{\\mathrm{${word}}}`,
    )
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc|log|ln|exp)(?![A-Za-z])/g, '$1\\$2')
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
  return <span ref={ref} dir="ltr" className={cn('mynota-math', className)} />
}
