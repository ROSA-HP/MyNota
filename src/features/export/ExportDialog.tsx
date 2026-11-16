import { useReactFlow } from '@xyflow/react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Dialog, SelectField, toast } from '@/components/ui'
import { useDeck } from '@/features/study/deckStore'
import { useCanvasUi } from '@/features/workspace/canvas/canvasUi'
import { useWorkspace } from '@/features/workspace/workspaceStore'
import { cn } from '@/lib/cn'
import type { NodeRow, RelationRow } from '@/lib/database.types'
import { captureMap, download, fileName } from './capture'
import { outlineItems, toMarkdown } from './outline'
import type { Paper } from './pdf'
import type { PaperTone, StudyLabels, StudyPreset } from './studypdf/types'

type Format = 'pdf' | 'png' | 'md'
const FORMATS: Format[] = ['pdf', 'png', 'md']
const PRESETS: StudyPreset[] = ['notes', 'summary', 'cards', 'maps']
const PAPERS: Paper[] = [
  'a4-mixed',
  'a4-portrait',
  'a4-landscape',
  'letter-mixed',
  'letter-portrait',
  'letter-landscape',
]
const TONES: PaperTone[] = ['mint', 'white']

interface ExportOpts {
  details: boolean
  links: boolean
  cards: boolean
  sources: boolean
  aiTags: boolean
  answersAtEnd: boolean
  light: boolean
}

/** Every node under (and including) `id`. */
function subtree(nodes: Record<string, NodeRow>, id: string): Set<string> {
  const kids = new Map<string, string[]>()
  for (const n of Object.values(nodes))
    if (n.parent_id) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n.id])
  const out = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop() as string
    out.add(cur)
    stack.push(...(kids.get(cur) ?? []))
  }
  return out
}

/** Export the map: designed Study PDF, PNG picture, or Markdown outline. All on the device. */
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const rf = useReactFlow()
  const map = useWorkspace((s) => s.map)
  const nodes = useWorkspace((s) => s.nodes)
  const relations = useWorkspace((s) => s.relations)
  const [format, setFormat] = useState<Format>('pdf')
  const [preset, setPreset] = useState<StudyPreset>('notes')
  const [scope, setScope] = useState('all')
  const [paper, setPaper] = useState<Paper>('a4-mixed')
  const [tone, setTone] = useState<PaperTone>('mint')
  const [opts, setOpts] = useState<ExportOpts>({
    details: true,
    links: true,
    cards: false,
    sources: true,
    aiTags: true,
    answersAtEnd: false,
    light: true,
  })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const root = useMemo(
    () => Object.values(nodes).find((n) => !n.parent_id || !nodes[n.parent_id]),
    [nodes],
  )
  const parts = useMemo(
    () =>
      root
        ? Object.values(nodes)
            .filter((n) => n.parent_id === root.id)
            .sort((a, b) => a.sort_order - b.sort_order)
        : [],
    [nodes, root],
  )
  const book = map?.type === 'book'
  if (!map || !root) return null

  const relationLabel = (r: RelationRow) => r.label || t(`ws.relations.${r.type}`)
  const scopeNode = scope === 'all' || scope === 'screen' ? root : (nodes[scope] ?? root)
  const title = scopeNode.id === root.id ? map.title : `${map.title} – ${scopeNode.title}`
  const dir = i18n.dir()
  const noScreenScope = format === 'md' || (format === 'pdf' && preset === 'cards')

  function buildLabels(dateLabel: string): StudyLabels {
    return {
      madeWith: t('export.madeWith', { date: dateLabel }),
      contents: t('export.study.contents'),
      chapter: t('export.study.chapter'),
      chapterShort: (n) => t('export.study.chapterShort', { n }),
      continued: t('export.study.continued'),
      addedByAi: t('export.study.addedByAi'),
      flashcards: t('export.study.flashcards'),
      answers: t('export.study.answers'),
      q: t('export.study.q'),
      a: t('export.study.a'),
      page: (n) => t('export.study.page', { n }),
      more: (count) => t('export.study.more', { count }),
      importance: {
        core: t('ws.core'),
        extra: t('ws.extra'),
      },
      kind: {
        book: t('export.study.kind.book'),
        notes: t('export.study.kind.notes'),
        blank: t('export.study.kind.blank'),
      },
      sticker: {
        notes: t('export.presets.notes.name'),
        summary: t('export.presets.summary.name'),
        cards: t('export.presets.cards.name'),
        maps: t('export.presets.maps.name'),
      },
      stats: {
        chapters: t('export.study.stats.chapters'),
        sections: t('export.study.stats.sections'),
        blocks: t('export.study.stats.blocks'),
        formulas: t('export.study.stats.formulas'),
        cards: t('export.study.stats.cards'),
      },
      types: {
        definition: t('ws.types.definition'),
        concept: t('ws.types.concept'),
        process_step: t('ws.types.process_step'),
        event: t('ws.types.event'),
        person: t('ws.types.person'),
        formula: t('ws.types.formula'),
        example: t('ws.types.example'),
        comparison: t('ws.types.comparison'),
        key_fact: t('ws.types.key_fact'),
        warning: t('ws.types.warning'),
        vocabulary: t('ws.types.vocabulary'),
      },
      empty: t('export.study.empty'),
    }
  }

  function cancelOrClose() {
    if (busy) {
      abortRef.current?.abort()
      return
    }
    onClose()
  }

  async function run() {
    if (!map || !root) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setFailed(null)
    setProgress(format === 'pdf' ? t('export.preparing') : null)
    // A clean picture: no selection, focus, filter or covered blocks while it is taken.
    const ui = useCanvasUi.getState()
    const ws = useWorkspace.getState()
    const saved = { focus: ui.focusId, filter: ui.filter, cover: ui.cover, selected: ws.selectedId }
    try {
      const needDetails =
        format === 'md'
          ? opts.details
          : format === 'pdf'
            ? preset === 'summary'
              ? true
              : preset === 'notes' && opts.details
            : false
      const needLinks =
        format === 'md' ? opts.links : format === 'pdf' && preset === 'notes' && opts.links
      const needCards =
        format === 'md'
          ? opts.cards
          : format === 'pdf'
            ? preset === 'cards' || (preset === 'notes' && opts.cards)
            : false

      const items =
        format === 'png'
          ? []
          : outlineItems({
              nodes,
              relations,
              cards: Object.values(useDeck.getState().cards),
              rootId: scopeNode.id,
              options: {
                details: needDetails,
                links: needLinks,
                cards: needCards,
              },
              relationLabel,
            })

      const dateLabel = new Date().toLocaleDateString(i18n.language)
      if (format === 'md') {
        const text = toMarkdown(items, {
          cards: t('ws.cards.title'),
          source: t('export.madeWith', { date: dateLabel }),
        })
        download(fileName(title, 'md'), new Blob([text], { type: 'text/markdown;charset=utf-8' }))
        toast(t('export.done'), 'success')
        return onClose()
      }

      const needPictures = format === 'png' || (format === 'pdf' && preset !== 'cards')
      const pictures: Array<{ dataUrl: string; width: number; height: number; caption: string }> =
        []

      if (needPictures) {
        ui.setFocus(null)
        ui.setFilter('')
        ui.setCover(false)
        ws.select(null)
        const shot = async (ids: Set<string> | null, caption: string, screen = false) => {
          const p = await captureMap(rf, { ids, screen, light: opts.light, links: opts.links })
          pictures.push({ ...p, caption })
        }
        if (scope === 'screen') await shot(null, map.title, true)
        else if (scope !== 'all') await shot(subtree(nodes, scope), title)
        else if (book && format === 'pdf') {
          // A book: one page per built chapter, so every chapter stays readable.
          for (const ch of parts)
            if (Object.values(nodes).some((n) => n.parent_id === ch.id))
              await shot(subtree(nodes, ch.id), ch.title)
          if (!pictures.length) await shot(null, map.title)
        } else await shot(null, map.title)
      }

      if (format === 'png') {
        const p = pictures[0]
        if (p) download(fileName(title, 'png'), p.dataUrl)
      } else {
        const { buildStudyPdf } = await import('./pdf')
        const blob = await buildStudyPdf({
          title,
          kind: map.type,
          dateLabel,
          preset,
          paper,
          tone,
          dir,
          items,
          pictures,
          include: {
            links: opts.links,
            cards: opts.cards,
            sources: opts.sources,
            aiTags: opts.aiTags,
          },
          answersAtEnd: opts.answersAtEnd,
          labels: buildLabels(dateLabel),
          signal: controller.signal,
          onProgress: (p) => {
            setProgress(
              p.phase === 'prepare'
                ? t('export.preparing')
                : t('export.progress', { done: p.done, total: p.total }),
            )
          },
        })
        download(fileName(title, 'pdf'), blob)
      }
      toast(t('export.done'), 'success')
      onClose()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setFailed(e instanceof Error ? e.message : String(e))
    } finally {
      abortRef.current = null
      ui.setFocus(saved.focus)
      ui.setFilter(saved.filter)
      if (saved.cover) ui.setCover(true)
      if (saved.selected) ws.select(saved.selected)
      setProgress(null)
      setBusy(false)
    }
  }

  const check = (k: keyof ExportOpts, label: string, show: boolean) =>
    show && (
      <label
        key={k}
        className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold"
      >
        <input
          type="checkbox"
          checked={opts[k]}
          disabled={busy}
          onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })}
          className="size-5 accent-[var(--brand)]"
        />
        {label}
      </label>
    )

  return (
    <Dialog
      open={open}
      onClose={cancelOrClose}
      title={t('export.title', { title: map.title })}
      className="w-[min(94vw,40rem)]"
      footer={
        <>
          <Button variant="ghost" onClick={cancelOrClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void run()} loading={busy}>
            {t(`export.download.${format}`)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t('export.format')}</legend>
          {FORMATS.map((f) => (
            <label
              key={f}
              className={cn(
                'flex cursor-pointer gap-3 rounded-neo border-2 p-3',
                format === f
                  ? 'border-line bg-brand-soft/50'
                  : 'border-line-soft hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                name="export-format"
                checked={format === f}
                disabled={busy}
                onChange={() => {
                  setFormat(f)
                  if ((f === 'md' || (f === 'pdf' && preset === 'cards')) && scope === 'screen') {
                    setScope('all')
                  }
                }}
                className="mt-1 size-4 accent-[var(--brand)]"
              />
              <span className="flex flex-col">
                <span className="font-bold">{t(`export.formats.${f}.name`)}</span>
                <span className="text-sm text-ink-muted">{t(`export.formats.${f}.hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {format === 'pdf' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">{t('export.preset')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((p) => (
                <label
                  key={p}
                  className={cn(
                    'flex cursor-pointer gap-2.5 rounded-neo border-2 p-2.5',
                    preset === p
                      ? 'border-line bg-brand-soft/50'
                      : 'border-line-soft hover:bg-surface-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="export-preset"
                    checked={preset === p}
                    disabled={busy}
                    onChange={() => {
                      setPreset(p)
                      if (p === 'cards' && scope === 'screen') setScope('all')
                    }}
                    className="mt-1 size-4 accent-[var(--brand)]"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold">{t(`export.presets.${p}.name`)}</span>
                    <span className="text-xs text-ink-muted">{t(`export.presets.${p}.hint`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('export.include')}
            value={scope}
            disabled={busy}
            onChange={(e) => setScope(e.target.value)}
            options={[
              { value: 'all', label: book ? t('export.scope.book') : t('export.scope.map') },
              ...parts.map((p, i) => ({
                value: p.id,
                label: `${book ? t('export.scope.chapter', { n: i + 1 }) : t('export.scope.section', { n: i + 1 })} · ${p.title}`,
              })),
              ...(noScreenScope ? [] : [{ value: 'screen', label: t('export.scope.screen') }]),
            ]}
          />
          {format === 'pdf' && (
            <SelectField
              label={t('export.paper')}
              value={paper}
              disabled={busy}
              onChange={(e) => setPaper(e.target.value as Paper)}
              options={PAPERS.map((p) => ({ value: p, label: t(`export.papers.${p}`) }))}
            />
          )}
        </div>

        {format === 'pdf' && (
          <SelectField
            label={t('export.tone')}
            value={tone}
            disabled={busy}
            onChange={(e) => setTone(e.target.value as PaperTone)}
            options={TONES.map((tn) => ({ value: tn, label: t(`export.tones.${tn}`) }))}
          />
        )}

        <div className="grid gap-x-4 sm:grid-cols-2">
          {check(
            'details',
            t('export.opts.details'),
            format === 'md' || (format === 'pdf' && preset === 'notes'),
          )}
          {check(
            'links',
            t('export.opts.links'),
            format !== 'pdf' || preset === 'notes' || preset === 'maps',
          )}
          {check(
            'cards',
            t('export.opts.cards'),
            format === 'md' || (format === 'pdf' && preset === 'notes'),
          )}
          {check(
            'sources',
            t('export.opts.sources'),
            format === 'pdf' && (preset === 'notes' || preset === 'summary'),
          )}
          {check(
            'aiTags',
            t('export.opts.aiTags'),
            format === 'pdf' && (preset === 'notes' || preset === 'summary'),
          )}
          {check(
            'answersAtEnd',
            t('export.opts.answersAtEnd'),
            format === 'pdf' && preset === 'cards',
          )}
          {check(
            'light',
            t('export.opts.light'),
            format === 'png' || (format === 'pdf' && preset !== 'cards'),
          )}
        </div>

        {progress && <p className="text-sm font-medium text-ink">{progress}</p>}
        {failed && <Alert tone="danger">{t('export.failed', { error: failed })}</Alert>}
        <p className="text-sm text-ink-muted">{t('export.local')}</p>
      </div>
    </Dialog>
  )
}
