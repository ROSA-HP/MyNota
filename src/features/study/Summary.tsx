import { Check, Network } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Alert, Button, Panel, buttonClasses } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cardFaces } from './cardFace'
import { useDeck } from './deckStore'
import { GRADES, type Rating } from './fsrs'
import { streak } from './limits'
import { useSession } from './sessionStore'

const BAR: Record<Rating, string> = {
  1: 'bg-danger',
  2: 'bg-warning',
  3: 'bg-success',
  4: 'bg-brand',
}

function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The end of a session: how it went, what to look at again, and what comes next. */
export function Summary({
  mapId,
  title,
  onPractice,
}: {
  mapId: string
  title: string
  onPractice: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const history = useSession((s) => s.history)
  const practice = useSession((s) => s.practice)
  const startedAt = useSession((s) => s.startedAt)
  const saveFailed = useSession((s) => s.saveFailed)
  const cards = useDeck((s) => s.cards)
  const progress = useDeck((s) => s.progress)
  const [days, setDays] = useState<number | null>(null)
  const [endedAt] = useState(() => Date.now())

  const counts = useMemo(() => {
    const c: Record<Rating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const h of history) c[h.rating] += 1
    return c
  }, [history])
  const unique = new Set(history.map((h) => h.cardId)).size
  const minutes = Math.max(0, Math.round((endedAt - startedAt) / 60_000))
  const missed = [...new Set(history.filter((h) => h.rating === 1).map((h) => h.cardId))]
  const hard = [...new Set(history.filter((h) => h.rating <= 2).map((h) => h.cardId))]

  const tomorrow = useMemo(() => {
    const start = new Date(endedAt)
    start.setHours(24, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return Object.values(progress).filter((p) => {
      const d = new Date(p.due).getTime()
      return d >= start.getTime() && d < end.getTime() && !cards[p.card_id]?.suspended
    }).length
  }, [progress, cards, endedAt])

  useEffect(() => {
    if (practice) return
    let alive = true
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    void supabase.rpc('study_activity', { days: 60, tz }).then(({ data, error }) => {
      if (alive && !error && data) setDays(streak(data, localDay(new Date())))
    })
    return () => {
      alive = false
    }
  }, [practice])

  const total = history.length || 1
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10"
    >
      <Panel shadow="lg" className="flex flex-col gap-6 p-6 sm:p-8" aria-labelledby="summary-title">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-line bg-success-soft">
            <Check size={24} strokeWidth={2.6} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 id="summary-title" className="text-2xl font-bold tracking-tight">
              {practice ? t('study.summary.titlePractice') : t('study.summary.title')}
            </h1>
            <p className="text-ink-muted" dir="auto">
              {title} · {t('study.summary.cards', { count: unique })}{' '}
              {t('study.summary.minutes', { count: minutes })}
            </p>
          </div>
        </div>

        {saveFailed && <Alert tone="danger">{t('study.summary.unsaved')}</Alert>}

        {history.length > 0 && (
          <div className="flex flex-col gap-3">
            <div
              role="img"
              aria-label={t('study.summary.bar', {
                again: counts[1],
                hard: counts[2],
                good: counts[3],
                easy: counts[4],
              })}
              className="flex h-4 overflow-hidden rounded-full border-2 border-line"
            >
              {GRADES.filter((g) => counts[g] > 0).map((g) => (
                <span
                  key={g}
                  className={BAR[g]}
                  style={{ width: `${(counts[g] / total) * 100}%` }}
                />
              ))}
            </div>
            <dl className="grid grid-cols-4 gap-2 text-sm">
              {GRADES.map((g) => (
                <div key={g} className="flex flex-col">
                  <dt className="flex items-center gap-1.5 text-ink-muted">
                    <span className={`size-2.5 rounded-full ${BAR[g]}`} aria-hidden />
                    {t(`study.ratings.${g}`)}
                  </dt>
                  <dd className="text-2xl font-bold tabular-nums">{counts[g]}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {missed.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">{t('study.summary.lookAgain')}</h2>
            <ul className="flex flex-col gap-1.5">
              {missed.slice(0, 5).map((id) => {
                const c = cards[id]
                if (!c) return null
                const front = cardFaces(c)
                  .front.map((p) => ('text' in p ? p.text : p.kind === 'formula' ? p.latex : '…'))
                  .join('')
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 rounded-neo border-2 border-line bg-surface px-3 py-2"
                  >
                    <span className="size-2.5 shrink-0 rounded-full bg-danger" aria-hidden />
                    <span dir="auto" className="min-w-0 flex-1 truncate">
                      {front}
                    </span>
                    {c.node_id && (
                      <Link
                        to={`/maps/${mapId}?node=${c.node_id}`}
                        className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand underline-offset-4 hover:underline"
                      >
                        <Network size={14} aria-hidden />
                        {t('study.showOnMap')}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {!practice && (
          <p className="text-sm text-ink-muted">
            {days !== null && days > 0 && <>{t('study.summary.streak', { count: days })} · </>}
            {t('study.summary.dueTomorrow', { count: tomorrow })}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Link to={`/maps/${mapId}`} className={buttonClasses({ variant: 'secondary' })}>
            {t('study.backToMap')}
          </Link>
          {hard.length > 0 && (
            <Button onClick={() => onPractice(hard)}>
              {t('study.summary.practiceHard', { count: hard.length })}
            </Button>
          )}
        </div>
      </Panel>
    </main>
  )
}
