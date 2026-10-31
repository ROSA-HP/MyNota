import { ArrowRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Alert, Panel, Spinner, buttonClasses } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { COVER, SubjectDot, useUpdated } from '@/features/library/mapBits'
import { dueToday, useOverview, type Overview } from '@/features/study/overviewStore'
import { streak } from '@/features/study/limits'
import { cn } from '@/lib/cn'
import type { DeckStatsRow, MapRow } from '@/lib/database.types'

function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The first screen after sign-in: what is due, how the week went, where to continue. */
export function HomePage() {
  const { t } = useTranslation()
  const userId = useAuth((s) => s.session?.user.id)
  const status = useOverview((s) => s.status)
  const data = useOverview((s) => s.data)

  useEffect(() => {
    if (userId) void useOverview.getState().load(userId)
  }, [userId])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-8">
      <Greeting />
      {status === 'error' && !data ? (
        <Alert tone="danger">
          {t('home.loadFailed')}{' '}
          <button
            type="button"
            className="cursor-pointer font-semibold underline"
            onClick={() => userId && void useOverview.getState().load(userId)}
          >
            {t('library.retry')}
          </button>
        </Alert>
      ) : !data ? (
        <div className="flex items-center gap-3 text-ink-muted">
          <Spinner /> {t('common.loading')}
        </div>
      ) : data.maps.length === 0 ? (
        <FirstMap />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <DueToday data={data} />
            <ThisWeek data={data} />
          </div>
          <Continue data={data} />
          <Subjects data={data} />
        </>
      )}
    </div>
  )
}

function Greeting() {
  const { t, i18n } = useTranslation()
  const profile = useAuth((s) => s.profile)
  const [now] = useState(() => new Date())
  const hour = now.getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const name = profile?.name?.split(' ')[0] || profile?.username || ''
  return (
    <div>
      <p className="font-semibold text-ink-muted">
        {new Intl.DateTimeFormat(i18n.language, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(now)}
      </p>
      <h1 dir="auto" className="text-3xl font-bold tracking-tight sm:text-4xl">
        {t(`home.greeting.${part}`, { name })}
      </h1>
    </div>
  )
}

function FirstMap() {
  const { t } = useTranslation()
  return (
    <Panel className="flex flex-col items-start gap-4 p-6 sm:p-8">
      <h2 className="text-2xl font-bold tracking-tight">{t('home.first.title')}</h2>
      <p className="max-w-xl text-ink-muted">{t('home.first.body')}</p>
      <Link to="/new" className={buttonClasses({})}>
        <Plus size={18} aria-hidden />
        {t('library.newMap')}
      </Link>
    </Panel>
  )
}

/** Maps with something to study now, most due first. */
function studyList(maps: MapRow[], decks: Record<string, DeckStatsRow>) {
  return maps
    .map((m) => ({ map: m, deck: decks[m.id] }))
    .filter((x): x is { map: MapRow; deck: DeckStatsRow } =>
      Boolean(x.deck && (x.deck.due > 0 || x.deck.new_cards > 0)),
    )
    .sort((a, b) => b.deck.due - a.deck.due || b.deck.new_cards - a.deck.new_cards)
}

function DueToday({ data }: { data: Overview }) {
  const { t } = useTranslation()
  const today = dueToday(data)
  const list = useMemo(() => studyList(data.maps, data.decks), [data])
  const first = list[0]
  const nothing = today.reviews + today.fresh === 0

  return (
    <Panel className="flex flex-col gap-5 p-5 sm:p-6" aria-labelledby="due-h">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="due-h" className="text-lg font-bold">
            {t('home.due.title')}
          </h2>
          {data.studyReady ? (
            <>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="text-4xl font-bold tabular-nums">{today.reviews}</span>
                <span className="text-ink-muted">
                  {t('home.due.reviews', { count: today.reviews })}
                </span>
                <span dir="ltr" className="text-2xl font-bold text-brand tabular-nums">
                  +{today.fresh}
                </span>
                <span className="text-ink-muted">{t('home.due.new', { count: today.fresh })}</span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {nothing
                  ? t('home.due.nothing')
                  : t('home.due.minutes', { count: Math.max(1, today.minutes) })}{' '}
                <Link to="/settings#study" className="underline underline-offset-2 hover:text-ink">
                  {t('home.due.limits', {
                    newLimit: data.limits.daily_new_limit,
                    reviewLimit: data.limits.daily_review_limit,
                  })}
                </Link>
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">{t('home.due.notReady')}</p>
          )}
        </div>
        {first && !nothing && (
          <Link to={`/maps/${first.map.id}/study`} className={buttonClasses({ size: 'lg' })}>
            {t('home.due.studyNow')}
            <ArrowRight size={18} aria-hidden className="rtl:-scale-x-100" />
          </Link>
        )}
      </div>
      {list.length > 0 && (
        <ul className="flex flex-col divide-y-2 divide-line-soft border-t-2 border-line-soft">
          {list.slice(0, 5).map(({ map, deck }) => (
            <li key={map.id} className="flex items-center gap-3 py-2.5">
              <span
                aria-hidden
                className={cn(
                  'size-3 shrink-0 rounded-full border-[1.5px] border-line',
                  COVER[map.cover_color],
                )}
              />
              <Link
                to={`/maps/${map.id}/deck`}
                dir="auto"
                className="min-w-0 flex-1 truncate font-semibold hover:underline"
              >
                {map.title}
              </Link>
              <span className="shrink-0 text-sm text-ink-muted tabular-nums">
                {t('home.due.mapCounts', { due: deck.due, fresh: deck.new_cards })}
              </span>
              <Link
                to={`/maps/${map.id}/study`}
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                {t('ws.study')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ThisWeek({ data }: { data: Overview }) {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => new Date())
  const byDay = new Map(data.activity.map((a) => [a.day, a.reviews]))
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - 6 + i)
    const key = localDay(d)
    return {
      key,
      label: new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(d),
      reviews: byDay.get(key) ?? 0,
    }
  })
  const max = Math.max(1, ...week.map((w) => w.reviews))
  const total = week.reduce((s, w) => s + w.reviews, 0)
  const days = streak(data.activity, localDay(now))
  const mastered = Object.values(data.decks).reduce((s, d) => s + d.mastered, 0)

  return (
    <Panel className="flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="week-h">
      <h2 id="week-h" className="text-lg font-bold">
        {t('home.week.title')}
      </h2>
      <p className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums">{days}</span>
        <span className="text-ink-muted">{t('home.week.streak', { count: days })}</span>
      </p>
      <div
        role="img"
        aria-label={t('home.week.chart', {
          list: week.map((w) => `${w.label} ${w.reviews}`).join(', '),
        })}
        className="flex h-28 items-end gap-2"
      >
        {week.map((w) => (
          <span key={w.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span
              className={cn(
                'w-full rounded-t-md border-2 border-b-0 border-line',
                w.reviews ? 'bg-brand' : 'bg-paper-sunken',
              )}
              style={{ height: `${Math.max(6, (w.reviews / max) * 100)}%` }}
            />
            <span className="text-xs text-ink-muted">{w.label}</span>
          </span>
        ))}
      </div>
      <p className="text-sm text-ink-muted">
        {t('home.week.total', { count: total })} · {t('home.week.mastered', { count: mastered })}
      </p>
    </Panel>
  )
}

function Continue({ data }: { data: Overview }) {
  const { t } = useTranslation()
  const updated = useUpdated()
  const recent = data.maps.slice(0, 3)
  return (
    <section aria-labelledby="cont-h" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="cont-h" className="text-lg font-bold">
          {t('home.continue')}
        </h2>
        <Link to="/library" className="text-sm font-semibold text-brand hover:underline">
          {t('home.allMaps')}
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recent.map((m) => {
          const d = data.decks[m.id]
          return (
            <Link
              key={m.id}
              to={`/maps/${m.id}`}
              className="neo-btn flex overflow-hidden rounded-neo-lg border-2 border-line bg-surface text-ink neo-shadow"
            >
              <span
                aria-hidden
                className={cn('w-3 shrink-0 border-e-2 border-line', COVER[m.cover_color])}
              />
              <span className="flex min-w-0 flex-col gap-1 p-4">
                <span dir="auto" className="truncate font-bold">
                  {m.title}
                </span>
                <span className="text-sm text-ink-muted">{updated(m.updated_at)}</span>
                {d && d.total > 0 && (
                  <span className="mt-1 flex flex-wrap gap-x-3 text-xs font-semibold tabular-nums">
                    <Legend
                      tone="bg-success"
                      label={t('home.mastery.mastered', { count: d.mastered })}
                    />
                    <Legend
                      tone="bg-warning"
                      label={t('home.mastery.learning', { count: d.learning })}
                    />
                    <Legend
                      tone="bg-paper-sunken"
                      label={t('home.mastery.new', { count: d.new_cards })}
                    />
                  </span>
                )}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

const Legend = ({ tone, label }: { tone: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span aria-hidden className={cn('size-2.5 rounded-full border-[1.5px] border-line', tone)} />
    {label}
  </span>
)

function Subjects({ data }: { data: Overview }) {
  const { t } = useTranslation()
  if (!data.subjects.length) return null
  return (
    <section aria-labelledby="subj-h" className="flex flex-col gap-3">
      <h2 id="subj-h" className="text-lg font-bold">
        {t('home.subjects')}
      </h2>
      <div className="flex flex-wrap gap-2.5">
        {data.subjects.map((s) => {
          const maps = data.maps.filter((m) => m.subject_id === s.id)
          const due = maps.reduce((n, m) => n + (data.decks[m.id]?.due ?? 0), 0)
          return (
            <Link
              key={s.id}
              to={`/library?subject=${s.id}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-line bg-surface px-4 font-semibold hover:bg-surface-muted"
            >
              <SubjectDot color={s.color} />
              <span dir="auto">{s.name}</span>
              <span className="text-sm font-normal text-ink-muted tabular-nums">
                {t('home.subjectCounts', { count: maps.length, due })}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
