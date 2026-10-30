import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftRight, ArrowRight, MoveHorizontal, Plus, Search, Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { RELATION_TYPES } from '@/ai/schemas/common'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { NodeRow, RelationType } from '@/lib/database.types'
import { matchesQuery, normalizeForSearch } from '@/lib/searchText'
import { useCanvasUi, type Anchor } from './canvas/canvasUi'
import { createLinkedBlock, existingLink, linkMany, recentLabels } from './canvas/linking'
import { findRoot } from './canvas/layout'
import { chapterColor } from './canvas/visuals'
import { useWorkspace } from './workspaceStore'

const WIDTH = 400

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[4px] border-[1.5px] border-line-soft px-1 font-mono text-[10px] font-bold text-ink-muted">
      {children}
    </kbd>
  )
}

/** Keeps a popover on screen next to its anchor: below if it fits, else above. */
function usePlacement(anchor: Anchor, width: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 360
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = Math.min(Math.max(8, anchor.x - width / 2), vw - width - 8)
    const below = anchor.y + 18
    const top = below + h <= vh - 8 ? below : Math.max(8, anchor.y - h - 18)
    setPos({ left, top })
  }, [anchor, width])
  return {
    ref,
    style: { left: pos.left, top: pos.top, width: Math.min(width, window.innerWidth - 16) },
  }
}

/** Closes on a pointer-down outside the popover. */
function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    // Defer so the click that opened the popover doesn't close it.
    const id = setTimeout(() => window.addEventListener('pointerdown', onDown), 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [ref, onOutside])
}

/** The inline link picker: kind (1–9), label, arrow, swap. Edits the link live. */
export function LinkPicker() {
  const picker = useCanvasUi((s) => s.picker)
  if (!picker) return null
  return <LinkPickerInner key={picker.relationId} {...picker} />
}

function LinkPickerInner({
  relationId,
  anchor,
  isNew,
}: {
  relationId: string
  anchor: Anchor
  isNew: boolean
}) {
  const { t } = useTranslation()
  const relation = useWorkspace((s) => s.relations[relationId])
  const nodes = useWorkspace((s) => s.nodes)
  const update = useWorkspace((s) => s.updateRelation)
  const remove = useWorkspace((s) => s.deleteRelation)
  const close = useCanvasUi((s) => s.closePicker)
  const [label, setLabel] = useState(relation?.label ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const { ref, style } = usePlacement(anchor, WIDTH)
  const recent = useMemo(() => recentLabels(relation?.label ?? ''), [relation?.label])

  const save = () => close()
  const cancel = () => {
    if (isNew) remove(relationId)
    close()
  }
  useOutside(ref, save)

  useEffect(() => inputRef.current?.focus(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
        return
      }
      const inInput = document.activeElement === inputRef.current
      if (/^[1-9]$/.test(e.key) && (!inInput || !inputRef.current?.value)) {
        const type = RELATION_TYPES[Number(e.key) - 1]
        if (type) {
          e.preventDefault()
          update(relationId, { type })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!relation) return null
  const from = nodes[relation.from_node]
  const to = nodes[relation.to_node]
  const words = label.trim() ? label.trim().split(/\s+/u).length : 0
  const setLabelLive = (v: string) => {
    setLabel(v)
    update(relationId, { label: v.slice(0, 40) })
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={isNew ? t('ws.link.newTitle') : t('ws.link.editTitle')}
      className="fixed z-50 flex flex-col overflow-hidden rounded-neo-lg border-[2.5px] border-line bg-surface text-ink neo-shadow-lg"
      style={style}
    >
      <div className="flex items-center gap-2 border-b-2 border-line-soft px-3.5 py-2.5">
        <span dir="auto" className="min-w-0 truncate text-[13px] font-bold">
          {from?.title}
        </span>
        <ArrowRight
          size={16}
          strokeWidth={2.6}
          aria-hidden
          className="shrink-0 text-brand rtl:-scale-x-100"
        />
        <span dir="auto" className="min-w-0 truncate text-[13px] font-bold">
          {to?.title}
        </span>
        <button
          type="button"
          aria-label={t('ws.link.swap')}
          title={t('ws.link.swap')}
          onClick={() =>
            update(relationId, { from_node: relation.to_node, to_node: relation.from_node })
          }
          className="ms-auto flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-line bg-surface hover:bg-paper-sunken"
        >
          <ArrowLeftRight size={15} aria-hidden />
        </button>
      </div>

      <form
        className="flex flex-col gap-3 px-3.5 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="flex h-11 items-center gap-2 rounded-neo border-[2.5px] border-brand bg-surface px-3">
          <Tag size={15} aria-hidden className="shrink-0 text-ink-muted" />
          <span className="sr-only">{t('ws.link.label')}</span>
          <input
            ref={inputRef}
            value={label}
            maxLength={40}
            dir="auto"
            placeholder={t('ws.link.labelPlaceholder')}
            onChange={(e) => setLabelLive(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-ink-faint"
          />
          {words > 0 && (
            <span
              className={cn(
                'font-mono text-[10px] font-bold',
                words > 3 ? 'text-warning' : 'text-ink-muted',
              )}
            >
              {t('ws.link.words', { count: words })}
            </span>
          )}
        </label>

        {recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-ink-muted">{t('ws.link.recent')}</span>
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                dir="auto"
                onClick={() => setLabelLive(r)}
                className="h-7 cursor-pointer rounded-full border-[1.5px] border-line bg-surface-muted px-2.5 text-xs font-semibold hover:bg-paper-sunken"
              >
                {r}
              </button>
            ))}
          </div>
        )}

        <div role="radiogroup" aria-label={t('ws.link.kind')} className="grid grid-cols-3 gap-1.5">
          {RELATION_TYPES.map((type, i) => {
            const on = relation.type === type
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => update(relationId, { type: type as RelationType })}
                className={cn(
                  'flex h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-start text-[13px]',
                  on
                    ? 'border-[2.5px] border-line bg-brand-soft font-bold neo-shadow-sm'
                    : 'border-2 border-line-soft font-semibold hover:bg-paper-sunken',
                )}
              >
                <span className={cn('font-mono text-[10px] font-bold', !on && 'text-ink-faint')}>
                  {i + 1}
                </span>
                <span className="truncate">{t(`ws.kinds.${type}`)}</span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{t('ws.link.arrow')}</span>
          <div
            role="radiogroup"
            aria-label={t('ws.link.arrow')}
            className="flex overflow-hidden rounded-lg border-2 border-line"
          >
            {(
              [
                ['forward', ArrowRight, t('ws.link.oneWay')],
                ['both', MoveHorizontal, t('ws.link.bothWays')],
              ] as const
            ).map(([dir, Icon, name], i) => {
              const on =
                dir === 'both' ? relation.direction === 'both' : relation.direction !== 'both'
              return (
                <button
                  key={dir}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={name}
                  title={name}
                  onClick={() => update(relationId, { direction: dir })}
                  className={cn(
                    'flex h-9 w-11 cursor-pointer items-center justify-center',
                    i > 0 && 'border-s-2 border-line',
                    on ? 'bg-ink text-paper' : 'bg-surface hover:bg-paper-sunken',
                  )}
                >
                  <Icon size={16} strokeWidth={2.4} aria-hidden className="rtl:-scale-x-100" />
                </button>
              )
            })}
          </div>
        </div>
        <button type="submit" hidden />
      </form>

      <div className="flex items-center gap-2 border-t-2 border-line-soft bg-surface-muted px-3.5 py-2.5">
        <span className="hidden text-xs text-ink-muted sm:inline">
          <Kbd>1–9</Kbd> {t('ws.link.kindKey')} · <Kbd>Enter</Kbd> {t('ws.link.saveKey')}
        </span>
        <Button variant="ghost" size="sm" className="ms-auto" onClick={cancel}>
          {isNew ? t('common.cancel') : t('ws.link.close')}
        </Button>
        <Button size="sm" onClick={save}>
          {t('ws.link.save')}
        </Button>
      </div>
    </div>
  )
}

/** The section a node sits in (null for the map title). */
function sectionOf(nodes: Record<string, NodeRow>, rootId: string | undefined, id: string) {
  let cur = nodes[id]
  while (cur?.parent_id && cur.parent_id !== rootId) cur = nodes[cur.parent_id]
  return cur && cur.parent_id === rootId ? cur : null
}

/** "Link to…": find a block anywhere on the map by name and link to it. */
export function LinkSearch() {
  const search = useCanvasUi((s) => s.search)
  if (!search) return null
  return <LinkSearchInner key={search.fromIds.join(',')} {...search} />
}

function LinkSearchInner({ fromIds, anchor }: { fromIds: string[]; anchor: Anchor }) {
  const { t } = useTranslation()
  const nodes = useWorkspace((s) => s.nodes)
  const close = useCanvasUi((s) => s.closeSearch)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'section'>('all')
  const [active, setActive] = useState(0)
  const { ref, style } = usePlacement(anchor, 460)
  useOutside(ref, close)

  const rootId = useMemo(() => findRoot(Object.values(nodes))?.id, [nodes])
  const single = fromIds.length === 1 ? fromIds[0] : undefined
  const source = single ? nodes[single] : undefined
  const sourceSection = single ? sectionOf(nodes, rootId, single) : null

  const results = useMemo(() => {
    const q = normalizeForSearch(query)
    return Object.values(nodes)
      .filter((n) => n.id !== rootId && !fromIds.includes(n.id))
      .filter((n) => scope === 'all' || sectionOf(nodes, rootId, n.id)?.id === sourceSection?.id)
      .filter((n) => matchesQuery(`${n.title} ${n.summary}`, query))
      .map((n) => {
        const title = normalizeForSearch(n.title)
        const rank =
          (q && title.startsWith(q) ? 0 : q && title.includes(q) ? 1 : 2) +
          (sectionOf(nodes, rootId, n.id)?.id === sourceSection?.id ? 0 : 0.5)
        return { n, rank }
      })
      .sort((a, b) => a.rank - b.rank || a.n.title.localeCompare(b.n.title))
      .slice(0, 8)
      .map((r) => r.n)
  }, [nodes, rootId, fromIds, scope, sourceSection, query])

  const canCreate = Boolean(single && query.trim())
  const count = results.length + (canCreate ? 1 : 0)
  const choose = (i: number) => {
    const target = results[i]
    if (target) linkMany(fromIds, target.id, anchor)
    else if (canCreate && single) createLinkedBlock(single, query, anchor)
  }

  const pathOf = (n: NodeRow) => {
    const section = sectionOf(nodes, rootId, n.id)
    const parent = n.parent_id ? nodes[n.parent_id] : undefined
    if (!section || section.id === n.id) return t('ws.link.isSection')
    return parent && parent.id !== section.id ? `${section.title} › ${parent.title}` : section.title
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('ws.link.searchLabel')}
      className="fixed z-50 flex flex-col overflow-hidden rounded-neo-lg border-[2.5px] border-line bg-surface text-ink neo-shadow-lg"
      style={style}
    >
      <div className="flex flex-col gap-2 border-b-2 border-line-soft px-3.5 pt-3 pb-2.5">
        <span className="text-xs font-bold text-ink-muted">
          {source ? (
            <>
              {t('ws.link.linkFrom')}{' '}
              <span dir="auto" className="text-ink">
                {source.title}
              </span>
            </>
          ) : (
            t('ws.link.linkSeveral', { count: fromIds.length })
          )}
        </span>
        <label className="flex h-12 items-center gap-2 rounded-neo border-[2.5px] border-brand px-3">
          <Search size={16} aria-hidden className="text-ink-muted" />
          <span className="sr-only">{t('ws.link.searchPlaceholder')}</span>
          <input
            autoFocus
            value={query}
            dir="auto"
            role="combobox"
            aria-expanded
            aria-controls="link-results"
            aria-activedescendant={count ? `link-opt-${active}` : undefined}
            placeholder={t('ws.link.searchPlaceholder')}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, count - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (count) choose(active)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-ink-faint"
          />
        </label>
        {sourceSection && (
          <div role="radiogroup" aria-label={t('ws.link.scope')} className="flex gap-1.5">
            {(['all', 'section'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={scope === s}
                onClick={() => {
                  setScope(s)
                  setActive(0)
                }}
                className={cn(
                  'h-8 cursor-pointer rounded-full border-2 border-line px-3 text-xs font-semibold',
                  scope === s ? 'bg-ink text-paper' : 'bg-surface hover:bg-paper-sunken',
                )}
              >
                {s === 'all' ? t('ws.link.scopeAll') : t('ws.link.scopeSection')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        id="link-results"
        role="listbox"
        className="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-1.5"
      >
        {results.map((n, i) => {
          const section = sectionOf(nodes, rootId, n.id)
          const c = chapterColor(section?.color ?? null)
          const linked = single ? Boolean(existingLink(single, n.id)) : false
          return (
            <div
              key={n.id}
              id={`link-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-neo px-2.5 py-2',
                i === active ? 'border-2 border-line bg-brand-soft' : 'border-2 border-transparent',
              )}
            >
              <span
                aria-hidden
                className="size-6 shrink-0 rounded-[7px] border-2 border-line"
                style={{ background: c.fill }}
              />
              <span className="flex min-w-0 flex-col">
                <span dir="auto" className="truncate text-sm font-semibold">
                  {n.title}
                </span>
                <span dir="auto" className="truncate text-xs text-ink-muted">
                  {pathOf(n)}
                </span>
              </span>
              {linked ? (
                <span className="ms-auto shrink-0 text-xs font-semibold text-ink-muted">
                  {t('ws.link.alreadyLinked')}
                </span>
              ) : (
                i === active && (
                  <span className="ms-auto shrink-0">
                    <Kbd>Enter</Kbd>
                  </span>
                )
              )}
            </div>
          )
        })}
        {results.length === 0 && !canCreate && (
          <p className="px-3 py-4 text-sm text-ink-muted">{t('ws.link.noResults')}</p>
        )}
        {canCreate && (
          <div
            id={`link-opt-${results.length}`}
            role="option"
            aria-selected={active === results.length}
            onPointerEnter={() => setActive(results.length)}
            onClick={() => choose(results.length)}
            className={cn(
              'mt-1 flex cursor-pointer items-center gap-2.5 rounded-neo border-2 border-dashed px-2.5 py-2 text-sm font-semibold',
              active === results.length ? 'border-line bg-brand-soft' : 'border-line-soft',
            )}
          >
            <Plus size={16} aria-hidden />
            <span dir="auto" className="truncate">
              {t('ws.link.createAndLink', { title: query.trim() })}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 border-t-2 border-line-soft bg-surface-muted px-3.5 py-2 text-xs text-ink-muted">
        <span>
          <Kbd>↑↓</Kbd> {t('ws.link.chooseKey')}
        </span>
        <span>
          <Kbd>Enter</Kbd> {t('ws.link.linkKey')}
        </span>
        <span>
          <Kbd>Esc</Kbd> {t('ws.link.closeKey')}
        </span>
      </div>
    </div>
  )
}
