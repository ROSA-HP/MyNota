import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MathFormula } from '@/components/ui/MathFormula'
import { cn } from '@/lib/cn'
import type { DetailBlock } from '@/lib/database.types'

/**
 * A block's details for reading (expanded cards, the details panel): bullets, formulas typeset
 * large with what their letters mean, examples as callouts, vocabulary, questions that open on
 * a tap. AI text is shown as plain text only.
 */
export function DetailList({
  details,
  compact = false,
}: {
  details: DetailBlock[]
  compact?: boolean
}) {
  if (!details.length) return null
  return (
    <ul className={cn('flex flex-col', compact ? 'gap-1.5' : 'gap-2.5')}>
      {details.map((d, i) => (
        <DetailItem key={i} d={d} compact={compact} />
      ))}
    </ul>
  )
}

function DetailItem({ d, compact }: { d: DetailBlock; compact: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const text = compact ? 'text-[12.5px] leading-[17px]' : 'text-sm leading-relaxed'
  switch (d.kind) {
    case 'bullet':
      return (
        <li className={cn('flex gap-2', text)} dir="auto">
          <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-ink-muted" />
          <span className="min-w-0">{d.text}</span>
        </li>
      )
    case 'text':
      return (
        <li className={text} dir="auto">
          {d.text}
        </li>
      )
    case 'formula':
      return (
        <li className="rounded-md bg-paper-sunken px-2 py-1.5">
          <div
            className={cn(
              'overflow-x-auto py-0.5 text-center',
              compact ? 'text-[15px]' : 'text-lg',
            )}
          >
            <MathFormula latex={d.latex} display />
          </div>
          {d.variables && (
            <p
              className={cn('text-ink-muted', compact ? 'text-[12px] leading-4' : 'text-[13px]')}
              dir="auto"
            >
              {d.variables}
            </p>
          )}
        </li>
      )
    case 'example':
      return (
        <li
          className={cn(
            'border-s-[3px] border-brand bg-brand-soft/60 ps-2 pe-1.5 py-1 rounded-e-md',
            text,
          )}
          dir="auto"
        >
          <span className="font-semibold">{t('ws.detail.example')}: </span>
          {d.text}
          {d.translation && <span className="block text-ink-muted">{d.translation}</span>}
        </li>
      )
    case 'vocab':
      return (
        <li className={cn('flex flex-wrap gap-x-1.5', text)}>
          <span className="font-bold" dir="auto">
            {d.article ? `${d.article} ` : ''}
            {d.term}
          </span>
          {d.plural && <span className="text-ink-muted">({d.plural})</span>}
          <span aria-hidden className="text-ink-faint">
            —
          </span>
          <span dir="auto">{d.meaning}</span>
        </li>
      )
    case 'question':
      return (
        <li className={text} dir="auto">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="nodrag w-full cursor-pointer rounded-md border-2 border-dashed border-line-soft px-2 py-1 text-start hover:border-line"
          >
            <span className="font-semibold">{d.front}</span>
            {open ? (
              <span className="block text-ink-muted">{d.back}</span>
            ) : (
              <span className="block text-xs text-ink-faint">{t('ws.detail.showAnswer')}</span>
            )}
          </button>
        </li>
      )
    case 'cloze':
      return (
        <li className={text} dir="auto">
          {d.text.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1')}
        </li>
      )
  }
}

/** Formulas first, the rest in their order: for a block about a formula, it is the key fact. */
export function formulasFirst(details: DetailBlock[]): DetailBlock[] {
  return [
    ...details.filter((d) => d.kind === 'formula'),
    ...details.filter((d) => d.kind !== 'formula'),
  ]
}
