import { BookOpen, FileText, Search, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Spinner } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { SearchResultRow } from '@/lib/database.types'
import { normalizeForSearch } from '@/lib/searchText'
import { supabase } from '@/lib/supabase'
import { Highlight } from './highlight'
import { resultHref, useSearch } from './searchStore'

type Tab = 'all' | 'blocks' | 'cards' | 'sources'
const TABS: Tab[] = ['all', 'blocks', 'cards', 'sources']
const inTab = (r: SearchResultRow, tab: Tab) =>
  tab === 'all' ||
  (tab === 'blocks' && (r.kind === 'node' || r.kind === 'map')) ||
  (tab === 'cards' && r.kind === 'card') ||
  (tab === 'sources' && r.kind === 'source')

const TYPE_ICON = { book: BookOpen, notes: FileText, blank: Square }

type State =
  | { status: 'idle' }
  | { status: 'loading'; rows: SearchResultRow[] }
  | { status: 'ready'; rows: SearchResultRow[] }
  | { status: 'error' }

/** Ctrl/Cmd+K: search every map the student can open; results grouped by map. */
export function SearchPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const open = useSearch((s) => s.open)
  const setOpen = useSearch((s) => s.setOpen)
  const ref = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [state, setState] = useState<State>({ status: 'idle' })
  const [active, setActive] = useState(0)

  // Ctrl/Cmd+K from anywhere toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useSearch.getState().setOpen(!useSearch.getState().open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      inputRef.current?.select()
    }
    if (!open && el.open) el.close()
  }, [open])

  // Debounced search; a newer query wins over a slower older one.
  const q = query.trim()
  const short = normalizeForSearch(q).length < 2
  useEffect(() => {
    if (short) return
    let alive = true
    const id = setTimeout(() => {
      setState((s) => ({
        status: 'loading',
        rows: s.status === 'ready' || s.status === 'loading' ? s.rows : [],
      }))
      void supabase.rpc('search_all', { q, max_results: 60 }).then(({ data, error }) => {
        if (!alive) return
        setActive(0)
        setState(error ? { status: 'error' } : { status: 'ready', rows: data })
      })
    }, 180)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [q, short])

  const rows = useMemo(
    () => (!short && (state.status === 'ready' || state.status === 'loading') ? state.rows : []),
    [state, short],
  )
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: rows.length, blocks: 0, cards: 0, sources: 0 }
    for (const r of rows) for (const k of TABS) if (k !== 'all' && inTab(r, k)) c[k] += 1
    return c
  }, [rows])
  const shown = rows.filter((r) => inTab(r, tab))
  // Grouped by map, maps in the order of their best result.
  const groups = useMemo(() => {
    const m = new Map<string, SearchResultRow[]>()
    for (const r of shown) m.set(r.map_id, [...(m.get(r.map_id) ?? []), r])
    return [...m.values()]
  }, [shown])
  const flat = groups.flat()

  const close = () => setOpen(false)
  const go = (r: SearchResultRow | undefined) => {
    if (!r) return
    close()
    navigate(resultHref(r))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(flat.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(flat[active])
    }
  }

  useEffect(() => {
    ref.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const kindLabel = (r: SearchResultRow) => t(`search.kinds.${r.kind}`)

  return (
    <dialog
      ref={ref}
      aria-label={t('search.title')}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === ref.current) close()
      }}
      className="mx-auto mt-[8vh] mb-auto w-[min(94vw,44rem)] rounded-neo-lg border-2 border-line bg-surface p-0 text-ink neo-shadow-lg backdrop:bg-[#121c1b]/45"
    >
      {open && (
        <div className="flex max-h-[80vh] flex-col" onKeyDown={onKeyDown}>
          <label className="flex items-center gap-3 border-b-2 border-line px-4">
            <Search size={20} aria-hidden className="shrink-0 text-ink-muted" />
            <span className="sr-only">{t('search.placeholder')}</span>
            <input
              ref={inputRef}
              type="search"
              dir="auto"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              aria-controls="search-results"
              aria-activedescendant={flat.length ? `search-r-${active}` : undefined}
              className="min-h-14 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:appearance-none"
            />
            {state.status === 'loading' && <Spinner />}
            <button
              type="button"
              onClick={close}
              aria-label={t('common.close')}
              className="flex size-9 cursor-pointer items-center justify-center rounded-md hover:bg-paper-sunken pointer-coarse:size-11"
            >
              <X size={18} aria-hidden />
            </button>
          </label>

          {!short && rows.length > 0 && (
            <div
              role="tablist"
              aria-label={t('search.filter')}
              className="flex flex-wrap gap-2 px-4 pt-3"
            >
              {TABS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  disabled={k !== 'all' && counts[k] === 0}
                  onClick={() => {
                    setTab(k)
                    setActive(0)
                  }}
                  className={cn(
                    'min-h-9 cursor-pointer rounded-full border-2 border-line px-3 text-sm font-semibold disabled:cursor-default disabled:border-line-soft disabled:text-ink-faint pointer-coarse:min-h-11',
                    tab === k
                      ? 'bg-selected text-selected-ink'
                      : 'bg-surface hover:bg-surface-muted',
                  )}
                >
                  {t(`search.tabs.${k}`, { count: counts[k] })}
                </button>
              ))}
            </div>
          )}

          <div
            id="search-results"
            role="listbox"
            aria-label={t('search.results')}
            className="min-h-24 overflow-y-auto p-2"
          >
            {short ? (
              <p className="px-3 py-6 text-center text-sm text-ink-muted">{t('search.hint')}</p>
            ) : state.status === 'error' ? (
              <p className="px-3 py-6 text-center text-sm text-danger">{t('search.failed')}</p>
            ) : state.status === 'ready' && rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-muted">
                {t('search.none', { q: '⁨' + q + '⁩' })}
              </p>
            ) : (
              groups.map((g) => {
                const first = g[0] as SearchResultRow
                const Icon = TYPE_ICON[first.map_type]
                return (
                  <div
                    key={first.map_id}
                    role="group"
                    aria-label={first.map_title}
                    className="mb-2"
                  >
                    <h3 className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs font-bold text-ink-muted">
                      <Icon size={14} aria-hidden />
                      <span dir="auto" className="truncate">
                        {first.map_title}
                      </span>
                    </h3>
                    {g.map((r) => {
                      const index = flat.indexOf(r)
                      return (
                        <button
                          key={`${r.kind}:${r.card_id ?? r.node_id ?? ''}:${r.title}`}
                          id={`search-r-${index}`}
                          data-index={index}
                          type="button"
                          role="option"
                          aria-selected={index === active}
                          onMouseMove={() => setActive(index)}
                          onClick={() => go(r)}
                          className={cn(
                            'flex w-full cursor-pointer flex-col gap-0.5 rounded-neo px-3 py-2 text-start',
                            index === active ? 'bg-brand-soft' : 'hover:bg-surface-muted',
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {r.kind !== 'node' && (
                              <span className="shrink-0 rounded-md border-[1.5px] border-line px-1.5 text-[11px] font-semibold">
                                {kindLabel(r)}
                              </span>
                            )}
                            <span dir="auto" className="truncate font-semibold">
                              {r.kind === 'source' ? (
                                t('search.paragraph', { n: r.title })
                              ) : (
                                <Highlight text={r.title} query={q} />
                              )}
                            </span>
                          </span>
                          {r.snippet && (
                            <span dir="auto" className="line-clamp-2 text-sm text-ink-muted">
                              <Highlight text={r.snippet} query={q} />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-line-soft px-4 py-2.5 text-xs text-ink-muted">
            <span>
              <kbd className="font-mono font-bold">↑ ↓</kbd> {t('search.keys.move')}
            </span>
            <span>
              <kbd className="font-mono font-bold">Enter</kbd> {t('search.keys.open')}
            </span>
            <span className="ms-auto">{t('search.scope')}</span>
          </div>
        </div>
      )}
    </dialog>
  )
}

/** The search button in the top bars (wide with the shortcut on desktop, an icon on phones). */
export function SearchButton({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <button
      type="button"
      onClick={() => useSearch.getState().setOpen(true)}
      aria-label={compact ? t('search.title') : undefined}
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        'neo-btn inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-neo border-2 border-line bg-surface text-sm font-semibold text-ink-muted hover:bg-surface-muted',
        compact ? 'w-11 justify-center' : 'px-3 sm:min-w-64',
      )}
    >
      <Search size={18} aria-hidden />
      {!compact && (
        <>
          <span className="hidden sm:inline">{t('search.placeholder')}</span>
          <kbd className="ms-auto hidden rounded-md border-[1.5px] border-line-soft px-1.5 font-mono text-[11px] sm:inline">
            {mac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </>
      )}
    </button>
  )
}
