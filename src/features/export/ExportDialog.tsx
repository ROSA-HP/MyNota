import { useReactFlow } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Dialog, SelectField, toast } from '@/components/ui'
import { useDeck } from '@/features/study/deckStore'
import { useCanvasUi } from '@/features/workspace/canvas/canvasUi'
import { useWorkspace } from '@/features/workspace/workspaceStore'
import { cn } from '@/lib/cn'
import type { NodeRow, RelationRow } from '@/lib/database.types'
import { captureMap, download, fileName } from './capture'
import { buildVectorMindMapPages, type VectorMapPageData } from './mindmapSvg'
import { outlineItems, toMarkdown } from './outline'
import type { Paper } from './pdf'
import type { PreparedStudyPdf } from './studypdf'
import type { ExportWarning } from './studypdf/cleanup'
import { bodyBoxPx, pageSizePx } from './studypdf/tokens'
import type { PaperTone, StatKey, StudyLabels, StudyPreset } from './studypdf/types'

type Format = 'pdf' | 'png' | 'md'
type DialogTab = 'settings' | 'preview'
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

function formatExportDate(lang: string): string {
  const locale = lang.startsWith('en') ? 'en-GB' : lang
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date())
}

function resolveDocLang(lang: string, dir: 'ltr' | 'rtl'): 'en' | 'de' | 'ar' {
  if (dir === 'rtl' || lang.startsWith('ar')) return 'ar'
  if (lang.startsWith('de')) return 'de'
  return 'en'
}

/** Export the map: designed Study PDF (with live Preview & Warnings), PNG picture, or Markdown outline. All on the device. */
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const rf = useReactFlow()
  const map = useWorkspace((s) => s.map)
  const nodes = useWorkspace((s) => s.nodes)
  const relations = useWorkspace((s) => s.relations)
  const cardsMap = useDeck((s) => s.cards)

  const [format, setFormat] = useState<Format>('pdf')
  const [tab, setTab] = useState<DialogTab>('settings')
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
  const [progressPct, setProgressPct] = useState<number | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<ExportWarning[]>([])
  const [previewData, setPreviewData] = useState<{
    prep: PreparedStudyPdf
    labels: StudyLabels
    components: typeof import('./studypdf/components')
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
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
  const dir = i18n.dir()
  const docLang = resolveDocLang(i18n.language, dir)
  const relationLabel = (r: RelationRow) => r.label || t(`ws.relations.${r.type}`)

  const scopeNode = root ? (scope === 'all' || scope === 'screen' ? root : (nodes[scope] ?? root)) : null
  const title =
    map && root && scopeNode
      ? scopeNode.id === root.id
        ? map.title
        : `${map.title} – ${scopeNode.title}`
      : ''
  const noScreenScope = format === 'md' || (format === 'pdf' && preset === 'cards')

  function buildLabels(dateLabel: string): StudyLabels {
    return {
      madeWith: t('export.madeWith', { date: dateLabel }),
      contents: t('export.study.contents'),
      whatsInside: t('export.study.whatsInside'),
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
      statLabel: (key: StatKey, count: number) => t(`export.study.stats.${key}`, { count }),
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

  function buildPdfMapPages(): VectorMapPageData[] {
    if (!map || !root || !scopeNode) return []
    if (preset === 'cards' || scope === 'screen') return []
    const mapBody = bodyBoxPx(paper, 'map')
    // Account for header bar & frame padding inside VectorMapPage (~60px tall, 24px wide)
    const slotSizePx = {
      w: Math.max(400, mapBody.w - 28),
      h: Math.max(300, mapBody.h - 68),
    }

    if (scope !== 'all') {
      return buildVectorMindMapPages({
        nodes,
        relations,
        rootId: root.id,
        scopeNodeId: scopeNode.id,
        title,
        slotSizePx,
        light: opts.light,
        links: opts.links,
        relationLabel,
      })
    }

    if (book) {
      const chapterPages: VectorMapPageData[] = []
      for (const ch of parts) {
        if (Object.values(nodes).some((n) => n.parent_id === ch.id)) {
          chapterPages.push(
            ...buildVectorMindMapPages({
              nodes,
              relations,
              rootId: root.id,
              scopeNodeId: ch.id,
              title: ch.title,
              slotSizePx,
              light: opts.light,
              links: opts.links,
              relationLabel,
            }),
          )
        }
      }
      if (chapterPages.length > 0) return chapterPages
    }

    return buildVectorMindMapPages({
      nodes,
      relations,
      rootId: root.id,
      title: map.title,
      slotSizePx,
      light: opts.light,
      links: opts.links,
      relationLabel,
    })
  }

  // Prepare live PDF preview & content warnings when switching to Preview tab or opening dialog for PDF
  useEffect(() => {
    if (!open || format !== 'pdf' || !map || !root || !scopeNode) return
    let cancelled = false
    const controller = new AbortController()
    const runPreview = async () => {
      setPreviewLoading(true)
      try {
        const needDetails = preset === 'summary' ? true : preset === 'notes' && opts.details
        const needLinks = preset === 'notes' && opts.links
        const needCards = preset === 'cards' || (preset === 'notes' && opts.cards)
        const items = outlineItems({
          nodes,
          relations,
          cards: Object.values(cardsMap),
          rootId: scopeNode.id,
          options: { details: needDetails, links: needLinks, cards: needCards },
          relationLabel,
        })
        const dateLabel = formatExportDate(i18n.language)
        const labels = buildLabels(dateLabel)
        const mapPages = buildPdfMapPages()
        const [{ prepareStudyPdf }, components] = await Promise.all([
          import('./studypdf'),
          import('./studypdf/components'),
        ])
        const prep = await prepareStudyPdf({
          title,
          kind: map.type,
          dateLabel,
          preset,
          paper,
          tone,
          dir,
          lang: docLang,
          items,
          pictures: [],
          mapPages,
          include: {
            links: opts.links,
            cards: opts.cards,
            sources: opts.sources,
            aiTags: opts.aiTags,
          },
          answersAtEnd: opts.answersAtEnd,
          labels,
          signal: controller.signal,
          onWarnings: (w) => {
            if (!cancelled) setWarnings(w)
          },
        })
        if (!cancelled) {
          setWarnings(prep.warnings)
          if (tab === 'preview') {
            setPreviewData({ prep, labels, components })
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }
    void runPreview()
    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, format, tab, preset, scope, paper, tone, opts, map?.id, nodes, relations, cardsMap, i18n.language])

  if (!map || !root || !scopeNode) return null

  function cancelOrClose() {
    if (busy) {
      abortRef.current?.abort()
      return
    }
    onClose()
  }

  async function run() {
    if (!map || !root || !scopeNode) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setFailed(null)
    setProgressPct(format === 'pdf' ? 0 : null)
    setProgress(format === 'pdf' ? t('export.preparing') : null)
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

      const dateLabel = formatExportDate(i18n.language)
      if (format === 'md') {
        const text = toMarkdown(items, {
          cards: t('ws.cards.title'),
          source: t('export.madeWith', { date: dateLabel }),
        })
        download(fileName(title, 'md'), new Blob([text], { type: 'text/markdown;charset=utf-8' }))
        toast(t('export.done'), 'success')
        return onClose()
      }

      const pictures: Array<{ dataUrl: string; width: number; height: number; caption: string }> =
        []

      const needRasterCapture = format === 'png' || (format === 'pdf' && preset !== 'cards' && scope === 'screen')
      if (needRasterCapture) {
        ui.setFocus(null)
        ui.setFilter('')
        ui.setCover(false)
        ws.select(null)
        const shot = async (ids: Set<string> | null, caption: string, screen = false) => {
          const p = await captureMap(rf, {
            ids,
            screen,
            light: opts.light,
            links: opts.links,
            horizontal: format === 'pdf' && !screen,
          })
          pictures.push({ ...p, caption })
        }
        if (scope === 'screen') await shot(null, map.title, true)
        else if (scope !== 'all') await shot(subtree(nodes, scope), title)
        else await shot(null, map.title)
      }

      if (format === 'png') {
        const p = pictures[0]
        if (p) download(fileName(title, 'png'), p.dataUrl)
      } else {
        const mapPages = scope === 'screen' ? [] : buildPdfMapPages()
        const { buildStudyPdf } = await import('./pdf')
        const blob = await buildStudyPdf({
          title,
          kind: map.type,
          dateLabel,
          preset,
          paper,
          tone,
          dir,
          lang: docLang,
          items,
          pictures,
          mapPages,
          include: {
            links: opts.links,
            cards: opts.cards,
            sources: opts.sources,
            aiTags: opts.aiTags,
          },
          answersAtEnd: opts.answersAtEnd,
          labels: buildLabels(dateLabel),
          signal: controller.signal,
          onWarnings: (w) => setWarnings(w),
          onProgress: (p) => {
            if (p.phase === 'prepare') {
              setProgress(t('export.preparing'))
              setProgressPct(5)
            } else {
              setProgress(t('export.progress', { done: p.done, total: p.total }))
              setProgressPct(Math.min(100, Math.round((p.done / Math.max(1, p.total)) * 100)))
            }
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
      setProgressPct(null)
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

  const coverSize = pageSizePx(paper, 'cover')
  const mapSize = pageSizePx(paper, 'map')
  const mapBody = bodyBoxPx(paper, 'map')
  const notesSize = pageSizePx(paper, 'notes')
  const notesBody = bodyBoxPx(paper, 'notes')

  return (
    <Dialog
      open={open}
      onClose={cancelOrClose}
      title={t('export.title', { title: map.title })}
      className={cn(tab === 'preview' && format === 'pdf' ? 'w-[min(96vw,58rem)]' : 'w-[min(94vw,42rem)]')}
      footer={
        <>
          <Button variant="ghost" onClick={cancelOrClose} className="min-h-11">
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void run()} loading={busy} className="min-h-11">
            {t(`export.download.${format}`)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {format === 'pdf' && (
          <div className="flex items-center justify-between gap-3 border-b-2 border-line-soft pb-3">
            <div className="flex gap-2" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'settings'}
                onClick={() => setTab('settings')}
                className={cn(
                  'min-h-11 rounded-neo border-2 px-4 text-sm font-bold transition-colors',
                  tab === 'settings'
                    ? 'border-line bg-brand-soft text-ink'
                    : 'border-line-soft bg-surface hover:bg-surface-muted',
                )}
              >
                {t('export.preview.tabSettings')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'preview'}
                onClick={() => setTab('preview')}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-neo border-2 px-4 text-sm font-bold transition-colors',
                  tab === 'preview'
                    ? 'border-line bg-brand-soft text-ink'
                    : 'border-line-soft bg-surface hover:bg-surface-muted',
                )}
              >
                {t('export.preview.tabPreview')}
                {warnings.length > 0 && (
                  <span
                    data-testid="export-warnings-badge"
                    className="rounded-full border border-line bg-[#FDE68A] px-2 py-0.5 font-mono text-xs font-bold text-ink"
                  >
                    {warnings.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {tab === 'preview' && format === 'pdf' ? (
          <div className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto pe-1">
            {/* Export Warnings Panel */}
            <div
              data-testid="export-warnings-panel"
              className="rounded-neo border-2 border-line bg-surface p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold">
                  {warnings.length > 0
                    ? t('export.preview.warningsCount', { count: warnings.length })
                    : t('export.preview.noWarnings')}
                </span>
                {previewData && (
                  <span className="font-mono text-xs font-bold text-ink-muted">
                    {t('export.preview.pagesCount', { count: previewData.prep.total })}
                  </span>
                )}
              </div>
              {warnings.length > 0 && (
                <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                  {warnings.map((w) => (
                    <li
                      key={w.id}
                      className="rounded border border-line bg-surface-muted/70 px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span>{t(`export.preview.kinds.${w.kind}`)}: {w.title}</span>
                        <span className="font-mono text-[11px] text-ink-muted">{w.location}</span>
                      </div>
                      <p className="mt-0.5 text-ink-muted">{w.detail}</p>
                      {w.raw && (
                        <code className="mt-1 block truncate rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-ink">
                          {w.raw}
                        </code>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Live Scaled Page Preview (Cover + Vector Maps + Sample Notes) */}
            {previewLoading || !previewData ? (
              <p className="py-8 text-center text-sm font-semibold text-ink-muted">
                {t('export.preview.loading')}
              </p>
            ) : (
              <div className="flex flex-col items-center gap-4">
                {(() => {
                  const { prep, labels, components } = previewData
                  const { CoverPage, VectorMapPage, ContentPage, FlowUnitView } = components
                  const coverScale = 0.56
                  const mapScale = 0.52
                  const statChips = [
                    { key: 'chapters' as const, n: prep.doc.stats.chapters, label: labels.stats.chapters },
                    { key: 'sections' as const, n: prep.doc.stats.sections, label: labels.stats.sections },
                    { key: 'blocks' as const, n: prep.doc.stats.blocks, label: labels.stats.blocks },
                    { key: 'formulas' as const, n: prep.doc.stats.formulas, label: labels.stats.formulas },
                    { key: 'cards' as const, n: prep.doc.stats.cards, label: labels.stats.cards },
                  ]
                  return (
                    <>
                      {/* Cover preview */}
                      <div
                        className="overflow-hidden rounded-neo border-2 border-line shadow-sm"
                        style={{
                          width: Math.round(coverSize.w * coverScale),
                          height: Math.round(coverSize.h * coverScale),
                        }}
                      >
                        <div
                          style={{
                            transform: `scale(${coverScale})`,
                            transformOrigin: 'top left',
                            width: coverSize.w,
                            height: coverSize.h,
                          }}
                        >
                          <CoverPage
                            size={coverSize}
                            tone={tone}
                            dir={dir}
                            title={title}
                            kindLabel={labels.kind[map.type]}
                            stickerLabel={labels.sticker[preset]}
                            stats={statChips}
                            statLabel={labels.statLabel}
                            tabs={prep.doc.tabs}
                            outline={prep.coverOutlineWithPages}
                            outlineLabel={labels.whatsInside ?? labels.contents}
                            moreLabel={
                              prep.doc.tabs.length > 12
                                ? labels.more(prep.doc.tabs.length - 12)
                                : null
                            }
                            formatMore={labels.more}
                            madeWith={labels.madeWith}
                            docLang={prep.docLang}
                          />
                        </div>
                      </div>

                      {/* Vector Map previews */}
                      {prep.vectorMaps.slice(0, 2).map((mp, idx) => (
                        <div
                          key={mp.id}
                          className="overflow-hidden rounded-neo border-2 border-line shadow-sm"
                          style={{
                            width: Math.round(mapSize.w * mapScale),
                            height: Math.round(mapSize.h * mapScale),
                          }}
                        >
                          <div
                            style={{
                              transform: `scale(${mapScale})`,
                              transformOrigin: 'top left',
                              width: mapSize.w,
                              height: mapSize.h,
                            }}
                          >
                            <VectorMapPage
                              size={mapSize}
                              body={mapBody}
                              tone={tone}
                              dir={dir}
                              pageNo={2 + prep.tocPageEntries.length + idx}
                              total={prep.total}
                              pageData={mp}
                              coreLabel={labels.importance.core}
                              extraLabel={labels.importance.extra}
                            />
                          </div>
                        </div>
                      ))}

                      {/* First Notes Page preview */}
                      {prep.notesPages.slice(0, 2).map((pg, idx) => (
                        <div
                          key={`notes-${idx}`}
                          className="overflow-hidden rounded-neo border-2 border-line shadow-sm"
                          style={{
                            width: Math.round(notesSize.w * coverScale),
                            height: Math.round(notesSize.h * coverScale),
                          }}
                        >
                          <div
                            style={{
                              transform: `scale(${coverScale})`,
                              transformOrigin: 'top left',
                              width: notesSize.w,
                              height: notesSize.h,
                            }}
                          >
                            <ContentPage
                              size={notesSize}
                              body={notesBody}
                              tone={tone}
                              dir={dir}
                              headerTitle={title}
                              headerChapter={null}
                              headerTag={null}
                              pageNo={prep.notesStartPageNo + idx}
                              total={prep.total}
                            >
                              {pg.placed.flatMap((pl, pIdx) => {
                                const u = prep.doc.flow[pl.unitIndex]
                                if (!u) return []
                                return [
                                  <FlowUnitView
                                    key={pIdx}
                                    unit={u}
                                    dir={dir}
                                    labels={labels}
                                    aiTags={opts.aiTags}
                                    atTop={pIdx === 0}
                                    rowFrom={pl.rowFrom}
                                    rowTo={pl.rowTo}
                                    continued={pl.continued}
                                    compact={prep.compactNotes}
                                    docLang={prep.docLang}
                                  />,
                                ]
                              })}
                            </ContentPage>
                          </div>
                        </div>
                      ))}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">{t('export.format')}</legend>
              {FORMATS.map((f) => (
                <label
                  key={f}
                  className={cn(
                    'flex min-h-11 cursor-pointer gap-3 rounded-neo border-2 p-3',
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
                      if (f !== 'pdf') setTab('settings')
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
                        'flex min-h-11 cursor-pointer gap-2.5 rounded-neo border-2 p-2.5',
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

            {warnings.length > 0 && format === 'pdf' && (
              <Alert tone="info">
                {t('export.preview.warningsCount', { count: warnings.length })} — {t('export.preview.tabPreview')}
              </Alert>
            )}
          </div>
        )}

        {progress && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-ink">{progress}</p>
            {progressPct !== null && (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPct}
                className="h-2.5 w-full overflow-hidden rounded-full border border-line bg-surface-muted"
              >
                <div
                  className="h-full bg-[#1D635D] transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
        )}
        {failed && <Alert tone="danger">{t('export.failed', { error: failed })}</Alert>}
        <p className="text-sm text-ink-muted">{t('export.local')}</p>
      </div>
    </Dialog>
  )
}
