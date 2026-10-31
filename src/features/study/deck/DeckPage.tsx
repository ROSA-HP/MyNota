import { ChevronRight, Network } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { Alert, Spinner, buttonClasses } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useDeck } from '../deckStore'
import { useStudyData } from '../useStudyData'
import { CardBrowser } from './CardBrowser'
import { DeckOverview } from './DeckOverview'

/** One map's deck: an overview by chapter, and every card to browse and edit. */
export function DeckPage() {
  const { t } = useTranslation()
  const { mapId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'cards' ? 'cards' : 'overview'
  const state = useStudyData(mapId)
  const total = useDeck((s) => Object.values(s.cards).filter((c) => !c.suspended).length)

  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.data.title} · ${t('nav.flashcards')}`
  }, [state, t])

  const setTab = (next: 'overview' | 'cards') => {
    const p = new URLSearchParams(params)
    if (next === 'cards') p.set('tab', 'cards')
    else p.delete('tab')
    setParams(p, { replace: true })
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <nav
        aria-label={t('deck.breadcrumb')}
        className="flex flex-wrap items-center gap-1.5 text-sm"
      >
        <Link
          to="/flashcards"
          className="font-semibold text-ink-muted hover:text-ink hover:underline"
        >
          {t('nav.flashcards')}
        </Link>
        <ChevronRight size={14} aria-hidden className="text-ink-faint rtl:-scale-x-100" />
        <span dir="auto" className="font-semibold">
          {state.status === 'ready' ? state.data.title : '…'}
        </span>
      </nav>

      {state.status === 'loading' && (
        <div className="flex items-center gap-3 text-ink-muted">
          <Spinner /> {t('common.loading')}
        </div>
      )}
      {state.status === 'error' && <Alert tone="danger">{t('study.loadFailed')}</Alert>}

      {state.status === 'ready' && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink-muted">
                {t(`library.types.${state.data.type}`)} · {t('deck.cardCount', { count: total })}
              </p>
              <h1 dir="auto" className="text-3xl font-bold tracking-tight">
                {state.data.title}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div
                role="tablist"
                aria-label={t('deck.tabs')}
                className="inline-flex rounded-neo border-2 border-line bg-surface p-0.5"
              >
                {(['overview', 'cards'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={cn(
                      'min-h-10 cursor-pointer rounded-[7px] px-4 text-sm font-semibold',
                      tab === k ? 'bg-selected text-selected-ink' : 'hover:bg-paper-sunken',
                    )}
                  >
                    {k === 'overview' ? t('deck.overview') : t('deck.cards', { count: total })}
                  </button>
                ))}
              </div>
              <Link
                to={`/maps/${mapId}`}
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                <Network size={16} aria-hidden />
                {t('deck.openMap')}
              </Link>
            </div>
          </div>
          <div role="tabpanel">
            {tab === 'overview' ? (
              <DeckOverview mapId={mapId} data={state.data} onBrowse={() => setTab('cards')} />
            ) : (
              <CardBrowser mapId={mapId} data={state.data} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
