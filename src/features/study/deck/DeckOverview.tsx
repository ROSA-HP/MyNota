import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Panel, buttonClasses } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useDeck } from '../deckStore'
import { deckCounts } from '../mastery'
import { MasteryBar } from '../MasteryBar'
import { deckGroups } from '../outline'
import { buildQueue } from '../queue'
import type { StudyData } from '../useStudyData'

function Tile({
  label,
  value,
  note,
  dot,
}: {
  label: string
  value: number
  note?: string
  dot?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-neo-lg border-2 border-line bg-surface p-4">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
        {dot && (
          <span
            aria-hidden
            className={cn('size-2.5 rounded-full border-[1.5px] border-line', dot)}
          />
        )}
        {label}
      </span>
      <span className="text-3xl font-bold tabular-nums">{value}</span>
      {note && <span className="text-xs text-ink-muted">{note}</span>}
    </div>
  )
}

export function DeckOverview({
  mapId,
  data,
  onBrowse,
}: {
  mapId: string
  data: StudyData
  onBrowse: () => void
}) {
  const { t } = useTranslation()
  const cards = useDeck((s) => s.cards)
  const progress = useDeck((s) => s.progress)
  const [now] = useState(() => new Date())
  const list = useMemo(() => Object.values(cards), [cards])
  const all = deckCounts(list, progress, now)
  const groups = useMemo(() => deckGroups(data.nodes), [data.nodes])
  const queue = (dueOnly: boolean) =>
    buildQueue({
      cards: list,
      progress,
      now,
      scope: null,
      newLeft: data.limits.daily_new_limit - data.today.newDone,
      reviewLeft: data.limits.daily_review_limit - data.today.reviewsDone,
      dueOnly,
    }).ids.length
  const studyAll = queue(false)
  const studyDue = queue(true)

  if (all.total === 0)
    return (
      <Panel className="flex flex-col items-start gap-3 p-6">
        <h2 className="text-xl font-bold">{t('study.noCards.title')}</h2>
        <p className="max-w-xl text-ink-muted">{t('study.noCards.body')}</p>
        <button
          type="button"
          onClick={onBrowse}
          className={buttonClasses({ variant: 'secondary' })}
        >
          {t('deck.addFirst')}
        </button>
      </Panel>
    )

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={t('deck.tiles.due')} value={all.due} />
        <Tile
          label={t('deck.tiles.new')}
          value={all.newCards}
          note={t('deck.tiles.perDay', { count: data.limits.daily_new_limit })}
        />
        <Tile label={t('deck.tiles.learning')} value={all.learning} dot="bg-warning" />
        <Tile label={t('deck.tiles.mastered')} value={all.mastered} dot="bg-success" />
      </div>

      <div className="flex flex-wrap gap-3">
        {studyAll > 0 ? (
          <Link to={`/maps/${mapId}/study`} className={buttonClasses({})}>
            {t('deck.studyAll', { count: studyAll })}
          </Link>
        ) : (
          <span
            className={buttonClasses({
              className: 'pointer-events-none bg-paper-sunken! text-ink-muted! shadow-none!',
            })}
          >
            {t('deck.nothingNow')}
          </span>
        )}
        {studyDue > 0 && (
          <Link
            to={`/maps/${mapId}/study?due=1`}
            className={buttonClasses({ variant: 'secondary' })}
          >
            {t('deck.studyDue', { count: studyDue })}
          </Link>
        )}
        <Link
          to={`/maps/${mapId}/study?practice=1`}
          className={buttonClasses({ variant: 'ghost' })}
        >
          {t('deck.practiceAll')}
        </Link>
      </div>

      {groups.length > 0 && (
        <section aria-labelledby="by-ch" className="flex flex-col gap-3">
          <h2 id="by-ch" className="text-lg font-bold">
            {data.type === 'book' ? t('deck.byChapter') : t('deck.bySection')}
          </h2>
          <div className="overflow-x-auto rounded-neo-lg border-2 border-line bg-surface">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-line text-start text-ink-muted">
                  <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                    {data.type === 'book' ? t('deck.col.chapter') : t('deck.col.section')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                    {t('deck.col.progress')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-end font-semibold">
                    {t('deck.col.due')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-end font-semibold">
                    {t('deck.col.new')}
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    <span className="sr-only">{t('deck.col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const c = deckCounts(
                    list.filter((x) => x.node_id && g.blocks.has(x.node_id)),
                    progress,
                    now,
                  )
                  return (
                    <tr key={g.id} className="border-b-2 border-line-soft last:border-b-0">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5 font-semibold">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-line font-mono text-xs">
                            {g.n}
                          </span>
                          <span dir="auto">{g.title}</span>
                        </span>
                      </td>
                      {!g.built ? (
                        <td colSpan={3} className="px-4 py-3 text-ink-muted">
                          {t('deck.notBuilt')}
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            {c.total ? (
                              <MasteryBar
                                className="max-w-56"
                                mastered={c.mastered}
                                learning={c.learning}
                                fresh={c.newCards}
                                label={t('deck.barLabel', {
                                  mastered: c.mastered,
                                  learning: c.learning,
                                  fresh: c.newCards,
                                })}
                              />
                            ) : (
                              <span className="text-ink-muted">{t('deck.noCardsHere')}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-end tabular-nums">{c.due}</td>
                          <td className="px-4 py-3 text-end tabular-nums">{c.newCards}</td>
                        </>
                      )}
                      <td className="px-4 py-3 text-end">
                        {!g.built ? (
                          <Link
                            to={`/maps/${mapId}`}
                            className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                          >
                            {t('deck.openMap')}
                          </Link>
                        ) : c.total > 0 ? (
                          <Link
                            to={`/maps/${mapId}/study?chapter=${g.id}`}
                            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                          >
                            {t('ws.study')}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="max-w-3xl text-sm text-ink-muted">{t('deck.footnote')}</p>
    </div>
  )
}
