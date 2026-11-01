import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Alert, Panel, Skeleton, buttonClasses } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { COVER } from '@/features/library/mapBits'
import { MasteryBar } from '@/features/study/MasteryBar'
import { dueToday, useOverview } from '@/features/study/overviewStore'
import { cn } from '@/lib/cn'

/** Every deck the student can study: one per map that has cards. */
export function FlashcardsPage() {
  const { t } = useTranslation()
  const userId = useAuth((s) => s.session?.user.id)
  const data = useOverview((s) => s.data)
  const status = useOverview((s) => s.status)

  useEffect(() => {
    if (userId) void useOverview.getState().load(userId)
  }, [userId])

  const decks = (data?.maps ?? [])
    .map((m) => ({ map: m, deck: data?.decks[m.id] }))
    .filter((x) => x.deck && x.deck.total > 0)
  const today = data ? dueToday(data) : null

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('nav.flashcards')}</h1>
        {today && data?.studyReady && (
          <p className="mt-1 text-ink-muted">
            {t('flashcards.today', { reviews: today.reviews, fresh: today.fresh })}
          </p>
        )}
      </div>
      {status === 'error' && !data && <Alert tone="danger">{t('home.loadFailed')}</Alert>}
      {!data && status !== 'error' && (
        <div className="flex flex-col gap-3" role="status">
          <span className="sr-only">{t('common.loading')}</span>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-neo-lg" />
          ))}
        </div>
      )}
      {data && !data.studyReady && <Alert tone="warning">{t('home.due.notReady')}</Alert>}
      {data && data.studyReady && decks.length === 0 && (
        <Panel className="flex flex-col items-start gap-3 p-6">
          <h2 className="text-xl font-bold">{t('flashcards.empty.title')}</h2>
          <p className="text-ink-muted">{t('flashcards.empty.body')}</p>
          <Link to="/library" className={buttonClasses({ variant: 'secondary' })}>
            {t('nav.library')}
          </Link>
        </Panel>
      )}
      {decks.length > 0 && (
        <ul className="mynota-stagger flex flex-col gap-3">
          {decks.map(({ map, deck }) =>
            deck ? (
              <li key={map.id}>
                <Panel className="group flex flex-wrap items-center gap-x-5 gap-y-3 p-4 transition-transform duration-300 ease-spring hover:-translate-y-0.5">
                  <span
                    aria-hidden
                    className={cn(
                      'size-4 shrink-0 rounded-full border-2 border-line transition-transform duration-300 ease-spring group-hover:scale-125',
                      COVER[map.cover_color],
                    )}
                  />
                  <span className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
                    <Link
                      to={`/maps/${map.id}/deck`}
                      dir="auto"
                      className="truncate font-bold hover:underline"
                    >
                      {map.title}
                    </Link>
                    <span className="text-sm text-ink-muted tabular-nums">
                      {t('flashcards.counts', {
                        total: deck.total,
                        due: deck.due,
                        fresh: deck.new_cards,
                      })}
                    </span>
                  </span>
                  <MasteryBar
                    className="max-w-48 flex-1 basis-32"
                    mastered={deck.mastered}
                    learning={deck.learning}
                    fresh={deck.new_cards}
                    label={t('deck.barLabel', {
                      mastered: deck.mastered,
                      learning: deck.learning,
                      fresh: deck.new_cards,
                    })}
                  />
                  <span className="flex gap-2">
                    <Link
                      to={`/maps/${map.id}/deck`}
                      className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                    >
                      {t('flashcards.open')}
                    </Link>
                    {(deck.due > 0 || deck.new_cards > 0) && (
                      <Link to={`/maps/${map.id}/study`} className={buttonClasses({ size: 'sm' })}>
                        {t('ws.study')}
                      </Link>
                    )}
                  </span>
                </Panel>
              </li>
            ) : null,
          )}
        </ul>
      )}
    </div>
  )
}
