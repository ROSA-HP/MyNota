import { Plus, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Panel, SelectField } from '@/components/ui'
import { controlClasses } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import type { CardRow, CardType } from '@/lib/database.types'
import { matchesQuery } from '@/lib/searchText'
import { cardFaces } from '../cardFace'
import { useDeck } from '../deckStore'
import { interval } from '../fsrs'
import { cardMastery, type Mastery } from '../mastery'
import { deckGroups } from '../outline'
import type { StudyData } from '../useStudyData'
import { CardEditor } from './CardEditor'
import { MakeCardsDialog } from './MakeCardsDialog'

const MASTERY_DOT: Record<Mastery, string> = {
  new: 'bg-paper-sunken',
  learning: 'bg-warning',
  struggling: 'bg-danger',
  mastered: 'bg-success',
}

function plain(c: Pick<CardRow, 'type' | 'front' | 'back'>, side: 'front' | 'back') {
  const parts = cardFaces(c)[side]
  return parts.map((p) => (p.kind === 'formula' ? p.latex : p.text)).join('')
}

type Filter = 'all' | 'due' | 'struggling'

/** Every card of the deck: search, filter, and edit one at a time. */
export function CardBrowser({ mapId, data }: { mapId: string; data: StudyData }) {
  const { t } = useTranslation()
  const cards = useDeck((s) => s.cards)
  const progress = useDeck((s) => s.progress)
  const canEdit = data.role === 'owner' || data.role === 'editor'
  const groups = useMemo(() => deckGroups(data.nodes), [data.nodes])
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [type, setType] = useState<'all' | CardType>('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | 'new' | null>(null)
  const [making, setMaking] = useState(false)
  const [now] = useState(() => new Date())

  const visible = useMemo(
    () =>
      Object.values(cards)
        .filter((c) => !c.suspended)
        .sort(
          (a, b) =>
            (data.order.get(a.node_id ?? '') ?? Infinity) -
              (data.order.get(b.node_id ?? '') ?? Infinity) ||
            a.created_at.localeCompare(b.created_at),
        ),
    [cards, data.order],
  )
  const isDue = (c: CardRow) => {
    const p = progress[c.id]
    return !!p && p.state !== 0 && new Date(p.due) <= now
  }
  const isStruggling = (c: CardRow) => cardMastery(progress[c.id]) === 'struggling'
  const dueCount = visible.filter(isDue).length
  const strugglingCount = visible.filter(isStruggling).length
  const scope = groups.find((g) => g.id === group)
  const shown = visible.filter(
    (c) =>
      (!scope || (c.node_id !== null && scope.blocks.has(c.node_id))) &&
      (type === 'all' || c.type === type) &&
      (filter === 'all' || (filter === 'due' ? isDue(c) : isStruggling(c))) &&
      (!query || matchesQuery(`${c.front} ${c.back}`, query)),
  )

  const chip = (k: Filter, label: string) => (
    <button
      type="button"
      aria-pressed={filter === k}
      onClick={() => setFilter(filter === k ? 'all' : k)}
      className={cn(
        'min-h-11 cursor-pointer rounded-full border-2 border-line px-4 text-sm font-semibold',
        filter === k ? 'bg-ink text-paper' : 'bg-surface hover:bg-surface-muted',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">{t('deck.search')}</span>
          <Search
            size={17}
            aria-hidden
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('deck.search')}
            className={cn(controlClasses(), 'ps-10')}
          />
        </label>
        {groups.length > 1 && (
          <SelectField
            label={<span className="sr-only">{t('deck.col.chapter')}</span>}
            className="w-52"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            options={[
              {
                value: 'all',
                label: data.type === 'book' ? t('deck.allChapters') : t('deck.allSections'),
              },
              ...groups.map((g) => ({ value: g.id, label: `${g.n} · ${g.title}` })),
            ]}
          />
        )}
        <SelectField
          label={<span className="sr-only">{t('deck.editor.type')}</span>}
          className="w-40"
          value={type}
          onChange={(e) => setType(e.target.value as 'all' | CardType)}
          options={[
            { value: 'all', label: t('deck.allTypes') },
            ...(['basic', 'reversed', 'cloze', 'vocab'] as const).map((v) => ({
              value: v,
              label: t(`deck.types.${v}`),
            })),
          ]}
        />
        {chip('due', t('deck.filterDue', { count: dueCount }))}
        {chip('struggling', t('deck.filterStruggling', { count: strugglingCount }))}
        {canEdit && (
          <span className="ms-auto flex gap-2">
            <Button
              variant="secondary"
              icon={<Sparkles size={17} aria-hidden />}
              onClick={() => setMaking(true)}
            >
              {t('deck.make.open')}
            </Button>
            <Button icon={<Plus size={18} aria-hidden />} onClick={() => setSelected('new')}>
              {t('deck.newCard')}
            </Button>
          </span>
        )}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted" aria-live="polite">
            {t('deck.showing', { count: shown.length })}
          </p>
          {shown.length === 0 ? (
            <Panel className="p-6 text-ink-muted">{t('deck.noMatch')}</Panel>
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-neo-lg border-2 border-line bg-surface">
              {shown.map((c) => {
                const p = progress[c.id]
                const m = cardMastery(p)
                const due = p ? new Date(p.due) : null
                const next = !p
                  ? t('deck.next.new')
                  : due && due <= now
                    ? t('deck.next.now')
                    : due
                      ? t('deck.next.in', {
                          when: t(`study.units.${interval(now, due).unit}`, {
                            n: interval(now, due).value,
                          }),
                        })
                      : ''
                return (
                  <li key={c.id} className="border-b-2 border-line-soft last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setSelected(c.id)}
                      aria-current={selected === c.id || undefined}
                      className={cn(
                        'grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 text-start sm:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]',
                        selected === c.id ? 'bg-brand-soft' : 'hover:bg-surface-muted',
                      )}
                    >
                      <span
                        role="img"
                        aria-label={t(`deck.mastery.${m}`)}
                        className={cn(
                          'size-3 rounded-full border-[1.5px] border-line',
                          MASTERY_DOT[m],
                        )}
                      />
                      <span dir="auto" className="truncate font-semibold">
                        {plain(c, 'front')}
                      </span>
                      <span dir="auto" className="hidden truncate text-sm text-ink-muted sm:block">
                        {plain(c, 'back')}
                      </span>
                      <span className="hidden rounded-md border-[1.5px] border-line px-1.5 text-xs font-semibold sm:inline">
                        {t(`deck.types.${c.type}`)}
                      </span>
                      <span className="text-end text-xs text-ink-muted tabular-nums">{next}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {selected && (
          <aside
            aria-label={t('deck.editor.title')}
            className="z-40 rounded-neo-lg border-2 border-line bg-surface max-xl:fixed max-xl:inset-y-0 max-xl:end-0 max-xl:w-[min(400px,92vw)] max-xl:overflow-y-auto max-xl:rounded-none max-xl:neo-shadow-lg xl:sticky xl:top-4"
          >
            <CardEditor
              key={selected}
              mapId={mapId}
              cardId={selected === 'new' ? null : selected}
              data={data}
              canEdit={canEdit}
              onClose={() => setSelected(null)}
              onCreated={(id) => setSelected(id)}
            />
          </aside>
        )}
      </div>
      {canEdit && (
        <MakeCardsDialog open={making} onClose={() => setMaking(false)} mapId={mapId} data={data} />
      )}
    </div>
  )
}
