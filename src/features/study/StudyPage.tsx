import { CalendarClock, Layers } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Alert, Button, Panel, Spinner, buttonClasses } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import type { CardRow } from '@/lib/database.types'
import { useDeck } from './deckStore'
import { buildQueue } from './queue'
import { SessionHeader, SessionView } from './SessionView'
import { flushWrites, useSession } from './sessionStore'
import { Summary } from './Summary'
import { useStudyData, type StudyData } from './useStudyData'

/** Why there is no session: no cards at all, or nothing due (and when the next one is). */
interface Empty {
  kind: 'noCards' | 'nothingDue'
  at: number
  next?: number
}

/** How many cards "Practice anyway" takes when nothing is due. */
const PRACTICE_SIZE = 20

function inScope(c: CardRow, scope: Set<string> | null) {
  return !c.suspended && (!scope || (c.node_id !== null && scope.has(c.node_id)))
}

/** The blocks under a chapter (or any node), for studying one chapter. */
function blocksUnder(data: StudyData, rootId: string): Set<string> {
  const kids = new Map<string, string[]>()
  for (const n of data.nodes) {
    if (!n.parent_id) continue
    kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n.id])
  }
  const out = new Set<string>()
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop() as string
    out.add(id)
    stack.push(...(kids.get(id) ?? []))
  }
  return out
}

export function StudyPage() {
  const { mapId = '' } = useParams()
  const state = useStudyData(mapId)
  const { t } = useTranslation()

  useEffect(() => () => useSession.getState().reset(), [mapId])

  if (state.status === 'loading')
    return (
      <Frame>
        <div className="flex flex-1 items-center justify-center gap-3 text-ink-muted">
          <Spinner /> {t('study.loading')}
        </div>
      </Frame>
    )
  if (state.status === 'error')
    return (
      <Frame>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4">
          <Alert tone="danger">{t('study.loadFailed')}</Alert>
          <Link to={`/maps/${mapId}`} className={buttonClasses({ variant: 'secondary' })}>
            {t('study.backToMap')}
          </Link>
        </div>
      </Frame>
    )
  return <Study key={mapId} mapId={mapId} data={state.data} />
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="paper-dots flex min-h-dvh flex-col">{children}</div>
}

function Study({ mapId, data }: { mapId: string; data: StudyData }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const userId = useAuth((s) => s.session?.user.id) ?? ''
  const chapterId = params.get('chapter')
  const dueOnly = params.get('due') === '1'
  const practiceAll = params.get('practice') === '1'
  const chapter = chapterId ? data.nodes.find((n) => n.id === chapterId) : undefined
  const [scope] = useState(() => (chapter ? blocksUnder(data, chapter.id) : null))
  const started = useSession((s) => s.mapId === mapId)
  const finished = useSession((s) => s.finished)
  const answered = useSession((s) => s.history.length)
  const practice = useSession((s) => s.practice)

  const ordered = () =>
    Object.values(useDeck.getState().cards)
      .filter((c) => inScope(c, scope))
      .sort(
        (a, b) =>
          (data.order.get(a.node_id ?? '') ?? Infinity) -
            (data.order.get(b.node_id ?? '') ?? Infinity) ||
          a.created_at.localeCompare(b.created_at),
      )

  // Today's queue is built once, when the page opens.
  const [plan] = useState<{ ids: string[]; practice?: boolean } | Empty>(() => {
    const cards = ordered()
    const now = Date.now()
    if (!cards.length) return { kind: 'noCards', at: now }
    if (practiceAll) return { ids: cards.map((c) => c.id), practice: true }
    const progress = useDeck.getState().progress
    const q = buildQueue({
      cards,
      progress,
      now: new Date(now),
      scope: null, // already filtered
      newLeft: data.limits.daily_new_limit - data.today.newDone,
      reviewLeft: data.limits.daily_review_limit - data.today.reviewsDone,
      dueOnly,
    })
    if (q.ids.length) return { ids: q.ids }
    const next = cards
      .map((c) => progress[c.id]?.due)
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime())
      .filter((d) => d > now)
      .sort((a, b) => a - b)[0]
    return { kind: 'nothingDue', at: now, next }
  })
  const [emptyState, setEmptyState] = useState<null | Empty>('kind' in plan ? plan : null)
  const empty = emptyState?.kind ?? null

  useEffect(() => {
    if ('ids' in plan && useSession.getState().mapId !== mapId)
      useSession.getState().start({ mapId, userId, ids: plan.ids, practice: plan.practice })
  }, [plan, mapId, userId])

  const startPractice = (ids: string[]) => {
    setEmptyState(null)
    useSession.getState().start({ mapId, userId, ids, practice: true })
  }

  const practiceAnyway = () => {
    const progress = useDeck.getState().progress
    const ids = ordered()
      .sort(
        (a, b) =>
          new Date(progress[a.id]?.due ?? 0).getTime() -
          new Date(progress[b.id]?.due ?? 0).getTime(),
      )
      .slice(0, PRACTICE_SIZE)
      .map((c) => c.id)
    startPractice(ids)
  }

  const end = () => {
    if (answered > 0 && !finished) useSession.getState().finish()
    else void flushWrites().then(() => navigate(`/maps/${mapId}`))
  }

  const scopeLabel = practice
    ? t('study.scopePractice')
    : dueOnly
      ? t('study.scopeDue')
      : chapter
        ? t('study.scopeChapter', { name: chapter.title })
        : t('study.scopeAll')

  if (empty) {
    const next = emptyState?.next
    const at = emptyState?.at ?? 0
    const limitHit =
      data.today.newDone >= data.limits.daily_new_limit ||
      data.today.reviewsDone >= data.limits.daily_review_limit
    const rel = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
    const whenText = (ms: number) => {
      const h = (ms - at) / 3_600_000
      return h < 24
        ? rel.format(Math.max(1, Math.round(h)), 'hour')
        : rel.format(Math.round(h / 24), 'day')
    }
    return (
      <Frame>
        <SessionHeader
          title={data.title}
          scope={scopeLabel}
          onEnd={() => navigate(`/maps/${mapId}`)}
          counts={false}
        />
        <main
          id="main"
          className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10"
        >
          <Panel className="flex flex-col gap-4 p-6 sm:p-8">
            <span className="flex size-12 items-center justify-center rounded-full border-2 border-line bg-ch-sky">
              {empty === 'noCards' ? (
                <Layers size={22} aria-hidden />
              ) : (
                <CalendarClock size={22} aria-hidden />
              )}
            </span>
            <h1 className="text-2xl font-bold tracking-tight">{t(`study.${empty}.title`)}</h1>
            <p className="text-ink-muted">
              {empty === 'noCards'
                ? t('study.noCards.body')
                : limitHit
                  ? t('study.nothingDue.limit', {
                      newLimit: data.limits.daily_new_limit,
                      reviewLimit: data.limits.daily_review_limit,
                    })
                  : t('study.nothingDue.body')}
            </p>
            {empty === 'nothingDue' && next !== undefined && (
              <p className="text-sm font-semibold">
                {t('study.nothingDue.next', { when: whenText(next) })}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Link to={`/maps/${mapId}`} className={buttonClasses({ variant: 'secondary' })}>
                {t('study.backToMap')}
              </Link>
              {empty === 'nothingDue' && (
                <Button onClick={practiceAnyway}>{t('study.nothingDue.practice')}</Button>
              )}
            </div>
          </Panel>
        </main>
      </Frame>
    )
  }

  if (!started) return <Frame>{null}</Frame>

  return (
    <Frame>
      <SessionHeader title={data.title} scope={scopeLabel} onEnd={end} />
      {finished ? (
        <Summary mapId={mapId} title={data.title} onPractice={startPractice} />
      ) : (
        <SessionView mapId={mapId} places={data.places} />
      )}
    </Frame>
  )
}
