import { useEffect, useMemo, useRef, useState } from 'react'
import type { ParseKeys } from 'i18next'
import { ArrowLeft, GitMerge, RotateCcw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { isAbortError, AiError } from '@/ai/errors'
import type { ExtractProgress } from '@/ai/pipeline/extract'
import type { OcrLanguage } from '@/ai/pipeline/extract/ocr'
import { applyPlan, nextParagraphOffset, type PlanItem } from '@/ai/pipeline/merge'
import { splitParagraphs } from '@/ai/pipeline/prepare'
import type { Paragraph } from '@/ai/prompts/shared'
import { Alert, Button, SelectField, Spinner, toast } from '@/components/ui'
import {
  ExtractProgressPanel,
  OcrLanguageSelect,
  PdfPicker,
  PhotoPicker,
  SourceTabs,
  type SourceKind,
} from '@/features/new-map/SourcePicker'
import { useAiKey } from '@/features/settings/aiKeyStore'
import { cn } from '@/lib/cn'
import type { NodeRow, SourceRow } from '@/lib/database.types'
import { useNow } from '../BuildBanner'
import { useCanvasUi } from '../canvas/canvasUi'
import { findRoot } from '../canvas/layout'
import { useLinks } from '../linksStore'
import { addSource } from '../mapRepo'
import { useWorkspace } from '../workspaceStore'
import { MAX_MERGE_CHARS, MAX_MERGE_NOTES, planMerge } from './mergeRun'

type Step = 'input' | 'placing' | 'review' | 'applying'

/** Category of a plan item in the preview (and the color of its notes on the left). */
const groupOf = (i: PlanItem) =>
  i.action === 'skip' ? 'skip' : i.action === 'new_section' ? 'new' : 'attach'
const NOTE_TONE = {
  attach: 'border-success bg-success-soft',
  new: 'border-line-soft bg-ch-sky',
  skip: 'border-line-soft bg-paper-sunken text-ink-muted',
} as const

/** Path of a node below the chapter / map root: "Transport › Passive Transport". */
function pathOf(nodes: Record<string, NodeRow>, rootId: string, id: string | null): string {
  const parts: string[] = []
  let cur = id ? nodes[id] : undefined
  while (cur && cur.id !== rootId) {
    parts.unshift(cur.title)
    cur = cur.parent_id ? nodes[cur.parent_id] : undefined
  }
  return parts.join(' › ')
}

/** Sections and blocks under the root, indented, for the "Change" place picker. */
function placeOptions(nodes: Record<string, NodeRow>, rootId: string, blocksOnly: boolean) {
  const kids = new Map<string, NodeRow[]>()
  for (const n of Object.values(nodes)) {
    if (!n.parent_id) continue
    const list = kids.get(n.parent_id) ?? []
    list.push(n)
    kids.set(n.parent_id, list)
  }
  const out: Array<{ value: string; label: string }> = []
  const walk = (pid: string, depth: number) => {
    for (const n of (kids.get(pid) ?? []).sort((a, b) => a.sort_order - b.sort_order)) {
      if (!blocksOnly || depth > 0)
        out.push({ value: n.id, label: `${' '.repeat(depth)}${n.title}` })
      walk(n.id, depth + 1)
    }
  }
  walk(rootId, 0)
  return out
}

const NoteTags = ({ notes }: { notes: number[] }) => (
  <span className="font-mono text-[11px] font-bold text-ink-muted" dir="ltr">
    {notes.map((n) => `N${n}`).join(' ')}
  </span>
)

/**
 * "Add notes" (merge mode): new notes go into an existing map. The AI proposes a place for
 * each piece; the student reviews, changes or unticks items, then applies.
 */
export function AddNotesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const nodes = useWorkspace((s) => s.nodes)
  const map = useWorkspace((s) => s.map)
  const selectedId = useWorkspace((s) => s.selectedId)
  const key = useAiKey((s) => s.key)
  const root = useMemo(() => findRoot(Object.values(nodes)), [nodes])
  const book = root?.level === 'book'
  const chapters = useMemo(
    () =>
      book && root
        ? Object.values(nodes)
            .filter((n) => n.parent_id === root.id)
            .sort((a, b) => a.sort_order - b.sort_order)
        : [],
    [book, root, nodes],
  )
  const [step, setStep] = useState<Step>('input')
  const [source, setSource] = useState<SourceKind>('paste')
  const [text, setText] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>(
    i18n.language.startsWith('ar') ? 'ar' : i18n.language.startsWith('de') ? 'de' : 'en',
  )
  const [progress, setProgress] = useState<ExtractProgress | null>(null)
  const [chapterChoice, setChapter] = useState<string | null>(null)
  const [notes, setNotes] = useState<Paragraph[]>([])
  const [items, setItems] = useState<PlanItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [waitUntil, setWaitUntil] = useState<number | null>(null)
  const [changing, setChanging] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  const now = useNow(waitUntil !== null)

  // Default chapter: the one holding the selected node, else the first built one.
  const defaultChapter = useMemo(() => {
    if (!book || !root) return null
    let cur = selectedId ? nodes[selectedId] : undefined
    while (cur?.parent_id && cur.parent_id !== root.id) cur = nodes[cur.parent_id]
    if (cur?.parent_id === root.id) return cur.id
    const built = chapters.find((c) => Object.values(nodes).some((n) => n.parent_id === c.id))
    return (built ?? chapters[0])?.id ?? null
  }, [book, root, selectedId, nodes, chapters])
  const targetRoot = book ? (chapterChoice ?? defaultChapter) : (root?.id ?? null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  function reset() {
    ctrl.current?.abort()
    setStep('input')
    setText('')
    setPdf(null)
    setPhotos([])
    setNotes([])
    setItems([])
    setError(null)
    setChanging(null)
    setWaitUntil(null)
  }
  function close() {
    if (step === 'applying') return
    reset()
    onClose()
  }

  async function readNotes(): Promise<Paragraph[] | null> {
    if (source === 'paste') return splitParagraphs(text)
    const files = source === 'pdf' ? (pdf ? [pdf] : []) : photos
    if (!files.length) {
      setError(source === 'pdf' ? t('newMap.source.errNoPdf') : t('newMap.source.errNoPhotos'))
      return null
    }
    const c = new AbortController()
    ctrl.current = c
    setProgress({ read: 0, total: files.length, ocrTotal: 0, ocrDone: 0 })
    try {
      const { extractPdf, extractImages } = await import('@/ai/pipeline/extract')
      const opts = { ocrLanguage, signal: c.signal, onProgress: setProgress }
      const result =
        source === 'pdf' && pdf ? await extractPdf(pdf, opts) : await extractImages(photos, opts)
      return result.paragraphs.map((p, i) => ({ n: i + 1, text: p.text }))
    } catch (e) {
      if (!isAbortError(e))
        setError(
          t(`newMap.source.errors.${(e as { kind?: string }).kind ?? 'unreadable'}` as ParseKeys, {
            pages: 300,
            mb: 50,
          }),
        )
      return null
    } finally {
      setProgress(null)
    }
  }

  async function place(list?: Paragraph[]) {
    if (!map || !targetRoot) return
    setError(null)
    const read = list ?? (await readNotes())
    if (!read) return
    if (!read.length) return setError(t('ws.merge.empty'))
    const chars = read.reduce((n, p) => n + p.text.length, 0)
    if (read.length > MAX_MERGE_NOTES || chars > MAX_MERGE_CHARS)
      return setError(t('ws.merge.tooLong', { max: MAX_MERGE_NOTES }))
    if (!key) return
    setNotes(read)
    setStep('placing')
    const c = new AbortController()
    ctrl.current = c
    try {
      const ws = useWorkspace.getState()
      const plan = await planMerge({
        mapId: map.id,
        mapTitle: book ? `${map.title} › ${ws.nodes[targetRoot]?.title ?? ''}` : map.title,
        rootId: targetRoot,
        nodes: ws.nodes,
        notes: read,
        language: map.languages[0] ?? root?.lang ?? null,
        fallbackTitle: t('ws.merge.moreNotes'),
        key,
        signal: c.signal,
        onWait: setWaitUntil,
      })
      setItems(plan)
      setStep('review')
    } catch (e) {
      if (isAbortError(e)) return
      setError(
        `${t('ws.merge.failed')} ${e instanceof AiError ? t(`ai.errors.${e.kind}` as ParseKeys) : ''}`,
      )
      setStep('input')
    } finally {
      setWaitUntil(null)
    }
  }

  async function apply() {
    if (!map || !targetRoot) return
    const ws = useWorkspace.getState()
    setStep('applying')
    try {
      const offset = nextParagraphOffset(ws.sources, targetRoot)
      const lang = map.languages[0] ?? root?.lang ?? null
      const { add, patches } = applyPlan(items, {
        mapId: map.id,
        rootId: targetRoot,
        nodes: ws.nodes,
        notes,
        offset,
        lang,
      })
      // The text first: if it cannot be saved, the map is left untouched.
      const row: SourceRow = await addSource({
        map_id: map.id,
        chapter_node_id: targetRoot,
        kind: source === 'paste' ? 'text' : source === 'pdf' ? 'pdf' : 'images',
        paragraphs: notes.map((p) => ({ n: offset + p.n, text: p.text })),
      })
      useWorkspace.setState((s) => ({ sources: [...s.sources, row] }))
      if (add.length) ws.addNodes(add, { saveNow: true, ai: true })
      if (patches.length) ws.updateNodes(patches, { ai: true })
      useCanvasUi.getState().setSpotlight(add.filter((n) => n.level === 'block').map((n) => n.id))
      toast(t('ws.merge.applied', { count: changes }), 'success')
      reset()
      onClose()
      // New blocks may connect to the rest of the chapter: look for links again.
      if (key && add.length)
        void useLinks.getState().run({ kind: 'chapter', chapterId: targetRoot }, key)
    } catch {
      setError(t('ws.merge.applyFailed'))
      setStep('review')
    }
  }

  const update = (k: string, patch: Partial<PlanItem>) =>
    setItems((list) => list.map((i) => (i.key === k ? { ...i, ...patch } : i)))
  const changes = items.filter((i) => i.include).length
  const groups = {
    attach: items.filter((i) => groupOf(i) === 'attach'),
    new: items.filter((i) => groupOf(i) === 'new'),
    skip: items.filter((i) => groupOf(i) === 'skip'),
  }
  const toneOfNote = (n: number) => {
    const item = items.find((i) => i.notes.includes(n))
    if (!item) return NOTE_TONE.skip
    return item.include || groupOf(item) === 'skip' ? NOTE_TONE[groupOf(item)] : NOTE_TONE.skip
  }
  const skipAdded = groups.skip.length > 0 && groups.skip.every((i) => i.include)
  const lastNote = notes.at(-1)?.n ?? 0

  /** Title line of a plan item. */
  const itemTitle = (i: PlanItem) =>
    i.action === 'detail'
      ? (i.detail ?? '')
      : i.action === 'new_section'
        ? (i.section?.title ?? '')
        : i.blocks.map((b) => b.title).join(', ')
  /** Where it goes, in words. */
  const itemWhere = (i: PlanItem) => {
    if (!targetRoot) return ''
    if (i.action === 'detail')
      return t('ws.merge.detailOn', { title: nodes[i.targetId ?? '']?.title ?? '' })
    if (i.action === 'new_section')
      return t('ws.merge.newSectionWith', {
        titles: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
          i.blocks.map((b) => b.title),
        ),
      })
    const where = t('ws.merge.under', { path: pathOf(nodes, targetRoot, i.parentId) })
    return i.afterId
      ? `${where}, ${t('ws.merge.after', { title: nodes[i.afterId]?.title ?? '' })}`
      : where
  }

  const renderItem = (item: PlanItem) => {
    const blocksOnly = item.action === 'detail'
    const current =
      item.action === 'detail'
        ? (item.targetId ?? '')
        : item.action === 'new_section'
          ? 'new'
          : (item.parentId ?? '')
    return (
      <li key={item.key} className="rounded-neo-lg border-2 border-line bg-surface">
        <div className="flex items-start gap-3 p-3">
          <input
            type="checkbox"
            checked={item.include}
            onChange={(e) => update(item.key, { include: e.target.checked })}
            aria-label={itemTitle(item)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
          />
          <div className={cn('min-w-0 flex-1', !item.include && 'opacity-55')}>
            <p className="flex flex-wrap items-baseline gap-x-2 font-bold" dir="auto">
              <span>{itemTitle(item)}</span>
              <NoteTags notes={item.notes} />
            </p>
            <p className="text-sm text-ink-muted" dir="auto">
              {itemWhere(item)}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            aria-expanded={changing === item.key}
            onClick={() => setChanging(changing === item.key ? null : item.key)}
          >
            {t('ws.merge.change')}
          </Button>
        </div>
        {changing === item.key && targetRoot && (
          <div className="border-t-2 border-line-soft p-3">
            <SelectField
              label={t('ws.merge.placeLabel')}
              value={current}
              options={[
                ...(blocksOnly ? [] : [{ value: 'new', label: t('ws.merge.placeNew') }]),
                ...placeOptions(nodes, targetRoot, blocksOnly),
              ]}
              onChange={(e) => {
                const v = e.target.value
                if (item.action === 'detail') update(item.key, { targetId: v })
                else if (v === 'new')
                  update(item.key, {
                    action: 'new_section',
                    parentId: null,
                    afterId: null,
                    section: item.section ?? {
                      title: item.blocks[0]?.title ?? t('ws.merge.moreNotes'),
                      summary: '',
                      shape: 'tree',
                    },
                  })
                else update(item.key, { action: 'attach', parentId: v, afterId: null })
                setChanging(null)
              }}
            />
          </div>
        )}
      </li>
    )
  }

  const title = map ? t('ws.merge.title', { title: map.title }) : ''
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      className="m-auto flex h-[min(92dvh,860px)] w-[min(96vw,1120px)] flex-col rounded-neo-lg border-2 border-line bg-surface p-0 text-ink neo-shadow-lg backdrop:bg-[#121c1b]/50 [&:not([open])]:hidden"
    >
      <header className="flex items-start gap-3 border-b-2 border-line px-5 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-neo border-2 border-line bg-ch-mint">
          <GitMerge size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold" dir="auto">
            {title}
          </h2>
          <p className="text-sm text-ink-muted">
            {step === 'review' ? t('ws.merge.reviewSub') : t('ws.merge.intro')}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t('common.close')}
          className="flex size-10 cursor-pointer items-center justify-center rounded-neo hover:bg-paper-sunken pointer-coarse:size-11"
        >
          <X size={20} />
        </button>
      </header>

      {(step === 'input' || step === 'placing') && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {book && chapters.length > 0 && (
            <SelectField
              label={t('ws.merge.chapter')}
              value={targetRoot ?? ''}
              disabled={step === 'placing'}
              options={chapters.map((c, i) => ({ value: c.id, label: `${i + 1} · ${c.title}` }))}
              onChange={(e) => setChapter(e.target.value)}
            />
          )}
          <SourceTabs value={source} onChange={(v) => (setSource(v), setError(null))} />
          {source === 'paste' ? (
            <textarea
              dir="auto"
              rows={12}
              value={text}
              disabled={step === 'placing'}
              onChange={(e) => setText(e.target.value)}
              aria-label={t('newMap.pasteLabel')}
              placeholder={t('ws.merge.pastePlaceholder')}
              className="min-h-48 w-full flex-1 resize-y rounded-neo-lg border-2 border-line bg-surface p-3.5 text-[15px] leading-relaxed focus:outline-none focus:neo-shadow-sm"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {source === 'pdf' ? (
                <PdfPicker file={pdf} onFile={setPdf} />
              ) : (
                <PhotoPicker photos={photos} onPhotos={setPhotos} />
              )}
              <OcrLanguageSelect
                value={ocrLanguage}
                onChange={setOcrLanguage}
                forPhotos={source === 'photos'}
              />
            </div>
          )}
          {progress && (
            <ExtractProgressPanel
              progress={progress}
              photos={source === 'photos'}
              onCancel={() => ctrl.current?.abort()}
            />
          )}
          {step === 'placing' && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-neo-lg border-2 border-line bg-paper p-3"
            >
              <Spinner size={18} />
              <div>
                <p className="font-bold">{t('ws.merge.placing')}</p>
                <p className="text-sm text-ink-muted">
                  {waitUntil
                    ? t('ws.build.waiting', {
                        s: Math.max(1, Math.ceil((waitUntil - now) / 1000)),
                      })
                    : t('ws.merge.placingHint', { count: notes.length })}
                </p>
              </div>
            </div>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          {!key && (
            <Alert tone="warning">
              <Link to="/settings" className="font-semibold underline">
                {t('ws.merge.needKey')}
              </Link>
            </Alert>
          )}
        </div>
      )}

      {(step === 'review' || step === 'applying') && (
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section
            aria-labelledby="merge-notes-h"
            className="min-h-0 overflow-y-auto border-line bg-paper px-5 py-4 max-md:max-h-[34dvh] max-md:border-b-2 md:border-e-2"
          >
            <h3 id="merge-notes-h" className="mb-3 font-bold">
              {t('ws.merge.yourNotes', { count: notes.length })}
            </h3>
            <ol className="flex flex-col gap-2">
              {notes.map((p) => (
                <li key={p.n} className="flex items-start gap-2">
                  <span className="w-8 shrink-0 pt-2 font-mono text-xs font-bold" dir="ltr">
                    N{p.n}
                  </span>
                  <p
                    dir="auto"
                    className={cn(
                      'rounded-neo border-2 px-3 py-2 text-sm leading-relaxed',
                      toneOfNote(p.n),
                    )}
                  >
                    {p.text.length > 360 ? `${p.text.slice(0, 360)}…` : p.text}
                  </p>
                </li>
              ))}
            </ol>
          </section>
          <section className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
            {groups.attach.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 font-bold">
                  <span
                    aria-hidden
                    className="size-3.5 rounded-[3px] border-2 border-success bg-success-soft"
                  />
                  {t('ws.merge.attachGroup', { n: groups.attach.length })}
                </h3>
                <ul className="flex flex-col gap-2">{groups.attach.map((i) => renderItem(i))}</ul>
              </div>
            )}
            {groups.new.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 font-bold">
                  <span
                    aria-hidden
                    className="size-3.5 rounded-[3px] border-2 border-line bg-ch-sky"
                  />
                  {t('ws.merge.newGroup', { n: groups.new.length })}
                </h3>
                <ul className="flex flex-col gap-2">{groups.new.map((i) => renderItem(i))}</ul>
              </div>
            )}
            {groups.skip.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 font-bold">
                  <span
                    aria-hidden
                    className="size-3.5 rounded-[3px] border-2 border-line-soft bg-paper-sunken"
                  />
                  {t('ws.merge.skipGroup', { n: groups.skip.length })}
                </h3>
                <div className="flex flex-col gap-1.5 rounded-neo-lg border-2 border-dashed border-line-soft p-3 text-sm text-ink-muted">
                  {groups.skip.map((i) => (
                    <p key={i.key} dir="auto">
                      {t('ws.merge.matches', {
                        notes: i.notes.map((n) => `N${n}`).join(', '),
                        title: nodes[i.duplicateOfId ?? '']?.title ?? '…',
                      })}
                    </p>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setItems((list) =>
                        list.map((i) => (i.action === 'skip' ? { ...i, include: !skipAdded } : i)),
                      )
                    }
                    className="mt-1 cursor-pointer self-start font-semibold text-brand underline underline-offset-4"
                  >
                    {skipAdded ? t('ws.merge.skipAgain') : t('ws.merge.addAnyway')}
                  </button>
                </div>
              </div>
            )}
            {error && <Alert tone="danger">{error}</Alert>}
          </section>
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-3 border-t-2 border-line px-5 py-3">
        <p className="me-auto text-sm text-ink-muted">
          {step === 'review' || step === 'applying'
            ? t('ws.merge.footnote', { last: lastNote })
            : t('ws.merge.privacy')}
        </p>
        {step === 'review' || step === 'applying' ? (
          <>
            <Button
              variant="secondary"
              disabled={step === 'applying'}
              icon={<ArrowLeft size={16} aria-hidden className="rtl:-scale-x-100" />}
              onClick={() => setStep('input')}
            >
              {t('newMap.back')}
            </Button>
            <Button
              loading={step === 'applying'}
              disabled={changes === 0}
              onClick={() => void apply()}
            >
              {t('ws.merge.apply', { count: changes })}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            {error && notes.length > 0 && step === 'input' ? (
              <Button icon={<RotateCcw size={16} aria-hidden />} onClick={() => void place(notes)}>
                {t('ws.merge.tryAgain')}
              </Button>
            ) : (
              <Button
                loading={step === 'placing' || Boolean(progress)}
                disabled={!key || step === 'placing' || Boolean(progress)}
                onClick={() => void place()}
              >
                {t('ws.merge.find')}
              </Button>
            )}
          </>
        )}
      </footer>
    </dialog>
  )
}
