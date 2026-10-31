import { Network, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { IconButton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { cardFaces } from './cardFace'
import { CardText } from './CardText'
import { useDeck } from './deckStore'
import { GRADES, interval, previewDue, type Rating } from './fsrs'
import { useSession } from './sessionStore'
import type { BlockPlace } from './useStudyData'

const RATING_TONE: Record<Rating, string> = {
  1: 'bg-danger-soft',
  2: 'bg-warning-soft',
  3: 'bg-success-soft',
  4: 'bg-brand-soft',
}

const STATE_KEY = ['new', 'learning', 'review', 'relearning'] as const

export function SessionHeader({
  title,
  scope,
  onEnd,
  counts = true,
}: {
  title: string
  scope: string
  onEnd: () => void
  /** False when there is no session to count (nothing due, no cards). */
  counts?: boolean
}) {
  const { t } = useTranslation()
  const done = useSession((s) => s.history.length)
  const left = useSession((s) => s.queue.length + s.later.length + (s.current ? 1 : 0))
  const progress = useDeck((s) => s.progress)
  const newLeft = useSession(
    (s) => [s.current, ...s.queue].filter((id) => id && !progress[id]).length,
  )
  const practice = useSession((s) => s.practice)
  const total = done + left
  return (
    <header className="flex items-center gap-3 border-b-2 border-line bg-surface px-3 py-2 sm:gap-4 sm:px-5">
      <IconButton label={t('study.end')} onClick={onEnd}>
        <X size={18} aria-hidden />
      </IconButton>
      <div className="flex min-w-0 flex-col">
        <span dir="auto" className="truncate font-bold">
          {title}
        </span>
        <span className="truncate text-xs text-ink-muted">{scope}</span>
      </div>
      {counts && (
        <>
          <div
            role="progressbar"
            aria-label={t('study.progress')}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="mx-auto hidden h-3 max-w-md flex-1 overflow-hidden rounded-full border-2 border-line bg-paper-sunken sm:block"
          >
            <span
              className="block h-full bg-brand transition-[width]"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
          <span className="ms-auto flex flex-col items-end text-xs sm:ms-0">
            <span className="font-mono font-bold" dir="ltr">
              {done} / {total}
            </span>
            {!practice && (
              <span className="text-ink-muted">{t('study.newLeft', { count: newLeft })}</span>
            )}
          </span>
        </>
      )}
    </header>
  )
}

/** One card at a time: question, then answer and the four ratings. Keys, taps and swipes. */
export function SessionView({ mapId, places }: { mapId: string; places: Map<string, BlockPlace> }) {
  const { t } = useTranslation()
  const current = useSession((s) => s.current)
  const flipped = useSession((s) => s.flipped)
  const canUndo = useSession((s) => s.history.length > 0)
  const practice = useSession((s) => s.practice)
  const card = useDeck((s) => (current ? s.cards[current] : undefined))
  const memory = useDeck((s) => (current ? s.progress[current] : undefined))
  const { flip, answer, undo } = useSession.getState()

  // Fixed when the card is shown, so the intervals do not shift while the student thinks.
  const [shownAt, setShownAt] = useState(() => new Date())
  const [prevCurrent, setPrevCurrent] = useState(current)
  if (prevCurrent !== current) {
    setPrevCurrent(current)
    setShownAt(new Date())
  }
  const faces = useMemo(() => (card ? cardFaces(card, memory?.reps ?? 0) : null), [card, memory])
  const due = useMemo(
    () => (flipped ? previewDue(memory, shownAt) : null),
    [flipped, memory, shownAt],
  )

  // Keyboard: Space/Enter flips, 1–4 answer, Z undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = useSession.getState()
      if ((e.key === ' ' || e.key === 'Enter') && !s.flipped) {
        e.preventDefault()
        s.flip()
      } else if (s.flipped && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        s.answer(Number(e.key) as Rating)
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        s.undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Swipe on touch screens: up (or a tap) shows the answer; left is Again, right is Good.
  const start = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current
    start.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!flipped) {
      if (dy < -40 || (Math.abs(dx) < 8 && Math.abs(dy) < 8)) flip()
      return
    }
    if (e.pointerType === 'mouse' || Math.abs(dy) > Math.abs(dx)) return
    if (dx < -70) answer(1)
    else if (dx > 70) answer(3)
  }

  if (!card || !faces) return null
  const place = card.node_id ? places.get(card.node_id) : undefined
  const where = place?.chapter
    ? t('study.chapter', { n: place.chapter.n, name: place.chapter.title })
    : (place?.section ?? null)
  const state = STATE_KEY[memory?.state ?? 0]

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:py-10"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {where && (
          <span
            dir="auto"
            className="rounded-full border-2 border-line bg-surface px-3 py-0.5 font-semibold"
          >
            {where}
          </span>
        )}
        {!practice && <span className="text-ink-muted">{t(`study.state.${state}`)}</span>}
        {canUndo && (
          <button
            type="button"
            onClick={undo}
            className="ms-auto inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-neo px-2 font-semibold text-ink-muted hover:bg-paper-sunken hover:text-ink pointer-coarse:min-h-11"
          >
            <Undo2 size={16} aria-hidden className="rtl:-scale-x-100" />
            {t('study.undo')}
            <kbd className="font-mono text-xs">Z</kbd>
          </button>
        )}
      </div>

      <article
        aria-label={flipped ? t('study.cardAnswer') : t('study.cardQuestion')}
        aria-live="polite"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className={cn(
          'flex min-h-64 touch-pan-y flex-col rounded-neo-lg border-2 border-line bg-surface neo-shadow-lg select-none',
          !flipped && 'cursor-pointer',
        )}
      >
        <div className="flex flex-1 flex-col gap-3 p-6 sm:p-8">
          <span className="text-xs font-semibold text-ink-muted">{t('study.question')}</span>
          <p dir="auto" className="text-2xl leading-snug font-bold text-balance sm:text-[1.75rem]">
            <CardText parts={faces.front} />
          </p>
        </div>
        {flipped && (
          <div className="flex flex-col gap-3 border-t-2 border-line bg-surface-muted p-6 sm:p-8">
            <span className="text-xs font-semibold text-ink-muted">{t('study.answer')}</span>
            {faces.filled && (
              <p dir="auto" className="text-xl leading-snug font-semibold">
                <CardText parts={faces.filled} reveal />
              </p>
            )}
            {faces.back.length > 0 && (
              <p
                dir="auto"
                className={cn(
                  'leading-relaxed',
                  faces.filled ? 'text-base' : 'text-xl font-semibold',
                )}
              >
                <CardText parts={faces.back} />
              </p>
            )}
            {card.node_id && place && (
              <Link
                to={`/maps/${mapId}?node=${card.node_id}`}
                className="inline-flex min-h-9 items-center gap-1.5 self-start text-sm font-semibold text-brand underline-offset-4 hover:underline pointer-coarse:min-h-11"
              >
                <Network size={15} aria-hidden />
                <span dir="auto">
                  {t('study.showOnMap')} · {place.title}
                </span>
              </Link>
            )}
          </div>
        )}
      </article>

      {!flipped ? (
        <>
          <button
            type="button"
            onClick={flip}
            className="neo-btn inline-flex min-h-13 cursor-pointer items-center justify-center gap-3 rounded-neo border-2 border-line bg-brand px-6 text-base font-semibold text-brand-ink neo-shadow hover:bg-brand-hover"
          >
            {t('study.showAnswer')}
            <kbd className="rounded-md border-[1.5px] border-current px-1.5 font-mono text-xs opacity-90">
              Space
            </kbd>
          </button>
          <p className="text-center text-sm text-ink-muted">{t('study.hintFront')}</p>
        </>
      ) : (
        <>
          <div
            role="group"
            aria-label={t('study.rateGroup')}
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {GRADES.map((g) => {
              const when = due ? interval(shownAt, due[g]) : null
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => answer(g)}
                  className={cn(
                    'neo-btn flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-neo border-2 border-line px-2 text-ink neo-shadow',
                    RATING_TONE[g],
                  )}
                >
                  <span className="text-base font-bold">{t(`study.ratings.${g}`)}</span>
                  <span className="text-xs text-ink-muted tabular-nums">
                    {!practice && when && (
                      <>
                        {t(`study.units.${when.unit}`, { n: when.value })}
                        {' · '}
                      </>
                    )}
                    <kbd className="font-mono">{g}</kbd>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-center text-sm text-ink-muted">{t('study.hintBack')}</p>
        </>
      )}
    </main>
  )
}
