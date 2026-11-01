import { useTranslation } from 'react-i18next'
import { MathFormula } from '@/components/ui/MathFormula'
import type { Part } from './cardFace'

/** Card text: plain runs, cloze gaps (hidden or revealed) and formulas. Model text is never HTML. */
export function CardText({ parts, reveal = false }: { parts: Part[]; reveal?: boolean }) {
  const { t } = useTranslation()
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.text}</span>
        if (p.kind === 'formula')
          return (
            <MathFormula
              key={i}
              latex={p.latex}
              display={false}
              className="inline-block max-w-full overflow-x-auto align-middle"
            />
          )
        return reveal ? (
          <mark key={i} className="rounded-md bg-ch-yellow px-1 font-bold text-ink">
            {p.text}
          </mark>
        ) : (
          <span
            key={i}
            className="mx-0.5 inline-block min-w-16 rounded-md border-2 border-dashed border-line bg-paper-sunken px-2 text-center text-ink-muted"
          >
            <span aria-hidden>…</span>
            <span className="sr-only">{t('study.gap')}</span>
          </span>
        )
      })}
    </>
  )
}
