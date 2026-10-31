import { Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button, buttonClasses, toast } from '@/components/ui'
import { controlClasses } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { cardFaces } from './cardFace'
import { useDeck } from './deckStore'
import { interval } from './fsrs'
import { cardMastery, type Mastery } from './mastery'

const DOT: Record<Mastery, string> = {
  new: 'bg-surface',
  learning: 'bg-warning',
  struggling: 'bg-danger',
  mastered: 'bg-success',
}

/** The block's flashcards in its side panel: progress, a quick new card, study just these. */
export function BlockCards({
  mapId,
  nodeId,
  canEdit,
}: {
  mapId: string
  nodeId: string
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const ready = useDeck((s) => s.status === 'ready' && s.mapId === mapId)
  const all = useDeck((s) => s.cards)
  const progress = useDeck((s) => s.progress)
  const cards = useMemo(
    () => Object.values(all).filter((c) => c.node_id === nodeId && !c.suspended),
    [all, nodeId],
  )
  const [adding, setAdding] = useState(false)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [saving, setSaving] = useState(false)
  const [now] = useState(() => new Date())

  if (!ready) return null

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!front.trim() || !back.trim()) return
    setSaving(true)
    try {
      await useDeck.getState().addCard({
        type: 'basic',
        front: front.trim(),
        back: back.trim(),
        node_id: nodeId,
        origin: 'manual',
        source_key: null,
      })
      setFront('')
      setBack('')
      setAdding(false)
      toast(t('ws.cards.added'), 'success')
    } catch {
      toast(t('common.errorGeneric'), 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby={`cards-${nodeId}`} className="flex flex-col gap-2">
      <h3 id={`cards-${nodeId}`} className="flex items-center gap-2 text-sm font-semibold">
        {t('ws.cards.title')}
        <span className="text-xs font-normal text-ink-muted tabular-nums">{cards.length}</span>
      </h3>
      {cards.length ? (
        <ul className="flex flex-col gap-1.5">
          {cards.map((c) => {
            const p = progress[c.id]
            const m = cardMastery(p)
            const due = p ? new Date(p.due) : null
            const when = !p
              ? t('deck.next.new')
              : due && due > now
                ? t(`study.units.${interval(now, due).unit}`, { n: interval(now, due).value })
                : t('deck.next.now')
            const front = cardFaces(c)
              .front.map((x) => (x.kind === 'formula' ? x.latex : x.text))
              .join('')
            return (
              <li
                key={c.id}
                className="flex items-center gap-2.5 rounded-neo border-2 border-line-soft bg-surface px-2.5 py-2 text-sm"
              >
                <span
                  role="img"
                  aria-label={t(`deck.mastery.${m}`)}
                  className={cn('size-3 shrink-0 rounded-full border-[1.5px] border-line', DOT[m])}
                />
                <span dir="auto" className="min-w-0 flex-1 truncate">
                  {front}
                </span>
                <span className="shrink-0 text-xs text-ink-muted tabular-nums">{when}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{t('ws.cards.none')}</p>
      )}

      {adding && (
        <form
          onSubmit={onAdd}
          className="flex flex-col gap-2 rounded-neo border-2 border-line p-2.5"
        >
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {t('deck.editor.front')}
            <textarea
              dir="auto"
              rows={2}
              value={front}
              onChange={(e) => setFront(e.target.value)}
              className={cn(controlClasses(), 'min-h-14 py-2 text-sm font-normal')}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {t('deck.editor.back')}
            <textarea
              dir="auto"
              rows={2}
              value={back}
              onChange={(e) => setBack(e.target.value)}
              className={cn(controlClasses(), 'min-h-14 py-2 text-sm font-normal')}
            />
          </label>
          <span className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={saving}
              disabled={!front.trim() || !back.trim()}
            >
              {t('deck.editor.add')}
            </Button>
          </span>
        </form>
      )}

      <span className="flex flex-wrap gap-2">
        {canEdit && !adding && (
          <Button
            variant="ghost"
            size="sm"
            className="text-brand-hover"
            icon={<Plus size={16} aria-hidden />}
            onClick={() => setAdding(true)}
          >
            {t('ws.cards.add')}
          </Button>
        )}
        {cards.length > 0 && (
          <Link
            to={`/maps/${mapId}/study?block=${nodeId}`}
            className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'ms-auto' })}
          >
            {t('ws.cards.studyThese', { count: cards.length })}
          </Link>
        )}
      </span>
    </section>
  )
}
