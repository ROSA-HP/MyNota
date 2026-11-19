import { createContext, Fragment, useContext, useLayoutEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/cn'
import { fixInlineLatex } from '@/lib/fixInlineLatex'
import { parseFormulaLegend, type FormulaLegendEntry } from '@/lib/formulaLegend'
import { splitInlineMath } from './inlineMath'

export interface MathErrorReport {
  latex: string
  message: string
}

const MathErrorReporterContext = createContext<((report: MathErrorReport) => void) | null>(null)

export function MathErrorProvider({
  onError,
  children,
}: {
  onError: (report: MathErrorReport) => void
  children: React.ReactNode
}) {
  return <MathErrorReporterContext.Provider value={onError}>{children}</MathErrorReporterContext.Provider>
}

/**
 * Makes AI-written LaTeX read like a textbook equation (only for display; stored text is kept):
 * - word subscripts and superscripts are upright text, not a product of italic letters:
 *   θ_{dark} → θ_{\mathrm{dark}}, E_rms → E_{\mathrm{rms}}, I_{max} → I_{\mathrm{max}};
 * - function names written without a backslash are typeset as functions: sin x → \sin x,
 *   arctan x → \arctan x.
 */
export function standardLatex(latex: string): string {
  const repaired = fixInlineLatex(latex)
  const protectedSpans: string[] = []
  const protectedLatex = repaired.replace(/\\(?:text|mathrm|mathbf|mathit)\{[^{}]*\}/g, (m) => {
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

/** Validates a LaTeX string against KaTeX without touching the DOM; returns null if valid or error message if invalid. */
export function validateLatex(latex: string, display = false): string | null {
  try {
    katex.renderToString(standardLatex(latex.slice(0, 2000)), {
      displayMode: display,
      throwOnError: true,
      trust: false,
      strict: 'ignore',
      maxSize: 10,
      maxExpand: 200,
    })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/**
 * A formula typeset with KaTeX. The LaTeX comes from the AI, so it is untrusted:
 * - KaTeX builds DOM nodes (katex.render); nothing goes through innerHTML.
 * - Anything KaTeX cannot read is rendered in a highlighted warning box and reported via MathErrorProvider.
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
  const reportError = useContext(MathErrorReporterContext)
  const parseError = validateLatex(latex, display)

  useLayoutEffect(() => {
    if (parseError) {
      reportError?.({ latex, message: parseError })
      return
    }
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      el.textContent = latex
      reportError?.({ latex, message })
    }
  }, [latex, display, parseError, reportError])

  if (parseError) {
    return (
      <span
        dir="ltr"
        title={parseError}
        data-katex-error="true"
        style={{
          display: 'inline-block',
          unicodeBidi: 'isolate',
          border: '1.5px solid #C2261D',
          backgroundColor: '#FDE2DF',
          color: '#7F1D1D',
          borderRadius: 4,
          padding: '1px 5px',
          fontFamily: "'Space Mono', Menlo, Consolas, monospace",
          fontSize: '0.88em',
        }}
        className={cn('mynota-math mynota-math-error', className)}
      >
        {latex}
      </span>
    )
  }

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

/** Renders structured legend entries `{ symbol, meaning }` separated by semicolons. */
export function FormulaLegendView({
  entries,
  className,
}: {
  entries: ReadonlyArray<FormulaLegendEntry>
  className?: string
}) {
  if (entries.length === 0) return null
  const nodes = entries.map((entry, idx) => (
    <Fragment key={idx}>
      {idx > 0 && '; '}
      <MathFormula latex={entry.symbol} display={false} />
      {' = '}
      {renderRichText(entry.meaning)}
    </Fragment>
  ))
  return className ? <span className={className}>{nodes}</span> : <>{nodes}</>
}

/**
 * Shared rich-text renderer used for EVERY text field in the PDF and web app:
 * renders embedded/bare LaTeX with KaTeX and leaves prose as normal text.
 */
export function renderRichText(
  text: string,
  options?: { legend?: boolean; className?: string },
): React.ReactNode {
  if (!text) return null
  if (options?.legend) {
    const parsed = parseFormulaLegend(text)
    if (parsed.length > 0) {
      return <FormulaLegendView entries={parsed} className={options.className} />
    }
  }

  const segments = splitInlineMath(text, options?.legend ? { legend: true } : undefined)
  if (segments.length === 0) return null
  if (segments.length === 1 && segments[0]?.kind === 'text') {
    return options?.className ? (
      <span className={options.className}>{segments[0].text}</span>
    ) : (
      <>{segments[0].text}</>
    )
  }

  const content = segments.map((seg, idx) =>
    seg.kind === 'math' ? (
      <MathFormula key={idx} latex={seg.latex} display={false} />
    ) : (
      <Fragment key={idx}>{seg.text}</Fragment>
    ),
  )

  return options?.className ? <span className={options.className}>{content}</span> : <>{content}</>
}

/** React component wrapper around `renderRichText`. */
export function RichMathText({
  text,
  className,
  legend = false,
}: {
  text: string
  className?: string
  legend?: boolean
}) {
  return <>{renderRichText(text, { legend, className })}</>
}
