import { useLayoutEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/cn'

/**
 * A formula typeset with KaTeX. The LaTeX comes from the AI, so it is untrusted:
 * - KaTeX builds DOM nodes (katex.render); nothing goes through innerHTML, and styles are set
 *   through the DOM, which the strict Content Security Policy allows.
 * - trust: false turns off \href, \url, \includegraphics and \html…; sizes and macro expansion
 *   are capped so a formula cannot freeze the page.
 * - Anything KaTeX cannot read is shown as the plain LaTeX text.
 */
export function MathFormula({
  latex,
  display = false,
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
      katex.render(latex.slice(0, 2000), el, {
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
