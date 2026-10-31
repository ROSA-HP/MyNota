import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CircleCheck,
  Combine,
  Library,
  ScanText,
  Scissors,
  TriangleAlert,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { PALETTE } from '@/ai/pipeline/convert'
import { renderPage, type Extracted } from '@/ai/pipeline/extract'
import { chapterParagraphs, mergeWithNext, splitAt } from '@/ai/pipeline/extract/chapters'
import type { ChapterDraft } from '@/ai/pipeline/extract/types'
import { detectLanguage, estimateRun, fitsInOneRequest } from '@/ai/pipeline/prepare'
import { estimateCost } from '@/ai/pricing'
import { PROVIDERS, testProvider } from '@/ai/providers'
import { Alert, Badge, Button, Panel } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { useAiKey } from '@/features/settings/aiKeyStore'
import { chapterColor } from '@/features/workspace/canvas/visuals'
import { createBookMap } from '@/features/workspace/mapRepo'
import { cn } from '@/lib/cn'
import type { AiProvider } from '@/lib/database.types'
import { localDb } from '@/lib/localdb'
import type { BookBuildRequest } from './buildRequest'
import { DetailPicker, EstimateBox, LanguageFields, ModelSelect, type Detail } from './options'

export interface BookFile {
  name: string
  size: number
  hash: string
  type: string
  blobs: Blob[]
}

/** Step 2 for books: check chapters, skip pages, choose what to build now. */
export function BookReview({
  extracted,
  title,
  file,
  photos,
  onBack,
  subjectId = null,
}: {
  extracted: Extracted
  title: string
  file: BookFile
  photos: File[]
  onBack: () => void
  /** The subject the new book is filed under (null: none). */
  subjectId?: string | null
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const userId = useAuth((s) => s.session?.user.id)
  const keys = useAiKey((s) => s.keys)
  const defaultKey = useAiKey((s) => s.key)
  const [providerChoice, setProviderChoice] = useState<AiProvider | null>(null)
  const key = (providerChoice && keys[providerChoice]) || defaultKey
  const configured = PROVIDERS.filter((p) => keys[p])

  const [drafts, setDrafts] = useState<ChapterDraft[]>(extracted.chapters)
  const [skippedPages, setSkippedPages] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<string | null>(
    extracted.chapters.find((d) => d.kind === 'chapter')?.key ?? extracted.chapters[0]?.key ?? null,
  )
  const [detail, setDetail] = useState<Detail>('standard')
  const [languageChoice, setLanguage] = useState<string | null>(null)
  const [explanations, setExplanations] = useState('same')
  const [modelLimit, setModelLimit] = useState<number | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detected = useMemo(
    () =>
      detectLanguage(
        extracted.paragraphs
          .map((p) => p.text)
          .join('\n\n')
          .slice(0, 30000),
      ),
    [extracted.paragraphs],
  )
  const language = languageChoice ?? detected.lang ?? 'other'

  useEffect(() => {
    if (!key) return
    const ctrl = new AbortController()
    testProvider(key, ctrl.signal)
      .then((r) => setModelLimit(r.models.find((m) => m.id === key.model)?.inputTokenLimit))
      .catch(() => undefined)
    return () => ctrl.abort()
  }, [key])

  const stats = useMemo(
    () =>
      Object.fromEntries(
        drafts.map((d) => {
          const paras = chapterParagraphs(extracted.paragraphs, d, skippedPages)
          return [
            d.key,
            { paras, estimate: estimateRun(paras), fits: fitsInOneRequest(paras, modelLimit) },
          ] as const
        }),
      ),
    [drafts, extracted.paragraphs, skippedPages, modelLimit],
  )

  const toBuild = drafts.filter((d) => d.build)
  const total = toBuild.reduce(
    (acc, d) => {
      const e = stats[d.key]?.estimate
      return e
        ? {
            tokensSent: acc.tokensSent + e.tokensSent,
            tokensOut: acc.tokensOut + e.tokensOut,
            min: acc.min + e.requestsMin,
            max: acc.max + e.requestsMax,
          }
        : acc
    },
    { tokensSent: 0, tokensOut: 0, min: 0, max: 0 },
  )
  const tooLong = toBuild.filter((d) => stats[d.key] && !stats[d.key]?.fits)
  const empty = toBuild.filter((d) => !stats[d.key]?.paras.length)
  const laterCount = drafts.filter((d) => d.kind === 'chapter' && !d.build).length

  const update = (k: string, patch: Partial<ChapterDraft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === k ? { ...d, ...patch } : d)))

  const numberOf = (d: ChapterDraft) =>
    drafts.filter((x) => x.kind === 'chapter').findIndex((x) => x.key === d.key) + 1

  const titleOf = (d: ChapterDraft) =>
    d.title.trim() ||
    (d.kind === 'front'
      ? t('newMap.book.frontMatter')
      : d.kind === 'back'
        ? t('newMap.book.backMatter')
        : t('newMap.book.chapterN', { n: numberOf(d) }))

  async function build() {
    if (!key || busy) return
    if (!toBuild.length) return setError(t('newMap.book.errNothing'))
    const firstEmpty = empty[0]
    if (firstEmpty) return setError(t('newMap.book.errEmpty', { title: titleOf(firstEmpty) }))
    const firstLong = tooLong[0]
    if (firstLong) return setError(t('newMap.book.errTooLong', { title: titleOf(firstLong) }))
    setBusy(true)
    setError(null)
    const sourceLanguage = language === 'other' ? null : language
    try {
      const included = drafts.filter((d) => d.kind === 'chapter' || d.build)
      const { mapId, chapterIds } = await createBookMap({
        title: title.trim(),
        subjectId,
        language: sourceLanguage,
        kind: extracted.kind,
        file: { name: file.name, size: file.size, hash: file.hash },
        chapters: included.map((d) => ({
          title: titleOf(d),
          pages: d.lastPage - d.firstPage + 1,
          paragraphs: stats[d.key]?.paras ?? [],
        })),
      })
      if (userId) {
        // The original stays on this device only, for page previews later.
        await localDb.files
          .put({
            id: `${userId}:${file.hash}`,
            userId,
            hash: file.hash,
            name: file.name,
            type: file.type,
            size: file.size,
            blobs: file.blobs,
            mapId,
            savedAt: new Date().toISOString(),
          })
          .catch(() => undefined)
      }
      const request: BookBuildRequest = {
        book: true,
        chapterIds: included.flatMap((d, i) => (d.build && chapterIds[i] ? [chapterIds[i]] : [])),
        bookTitle: title.trim(),
        sourceLanguage,
        explanationLanguage: explanations === 'same' ? sourceLanguage : explanations,
        detailLevel: detail,
        provider: key.provider,
      }
      void extracted.doc?.loadingTask.destroy()
      navigate(`/maps/${mapId}`, { replace: true, state: { build: request } })
    } catch {
      setError(t('newMap.errCreate'))
      setBusy(false)
    }
  }

  const sel = drafts.find((d) => d.key === selected) ?? null
  const fmt = new Intl.NumberFormat(i18n.language)
  const kFmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 })
  const sourceBadge =
    extracted.chapterSource === 'outline'
      ? t('newMap.book.fromOutline', { count: drafts.filter((d) => d.kind === 'chapter').length })
      : extracted.chapterSource === 'headings'
        ? t('newMap.book.fromHeadings', {
            count: drafts.filter((d) => d.kind === 'chapter').length,
          })
        : t('newMap.book.oneChapter')

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section
        aria-labelledby="chapters-h"
        className="flex min-w-0 flex-[999_1_640px] flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h1 id="chapters-h" className="text-2xl font-bold">
            {t('newMap.book.title')}
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-ch-mint px-2.5 py-0.5 text-sm font-bold text-ink">
            <Library size={15} aria-hidden /> {sourceBadge}
          </span>
          {extracted.ocrPages.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-ch-sky px-2.5 py-0.5 text-sm font-bold text-ink">
              <ScanText size={15} aria-hidden />
              {t('newMap.book.ocrPages', { count: extracted.ocrPages.length })}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-muted">{t('newMap.book.hint')}</p>

        <div className="overflow-hidden rounded-neo-lg border-2 border-line bg-surface">
          <div className="grid grid-cols-[44px_34px_minmax(0,1fr)_96px_104px_40px] items-center gap-2 border-b-2 border-line bg-paper-sunken px-3 py-2 text-xs font-bold text-ink-muted max-sm:hidden">
            <span>{t('newMap.book.colBuild')}</span>
            <span>#</span>
            <span>{t('newMap.book.colChapter')}</span>
            <span>{t('newMap.book.colPages')}</span>
            <span>{t('newMap.book.colSize')}</span>
            <span />
          </div>
          <ul>
            {drafts.map((d, i) => {
              const st = stats[d.key]
              const content = d.kind === 'chapter'
              const n = numberOf(d)
              const color = chapterColor(PALETTE[(n - 1) % PALETTE.length] ?? 'yellow')
              const isSel = d.key === selected
              const next = drafts[i + 1]
              return (
                <li
                  key={d.key}
                  className={cn(
                    'grid grid-cols-[44px_34px_minmax(0,1fr)_96px_104px_40px] items-center gap-2 border-b-2 border-line-soft px-3 py-2 last:border-b-0 max-sm:grid-cols-[40px_30px_minmax(0,1fr)_40px]',
                    isSel && 'bg-ch-yellow/30',
                    !content && !d.build && 'text-ink-faint',
                  )}
                  onClick={() => setSelected(d.key)}
                >
                  <input
                    type="checkbox"
                    checked={d.build}
                    onChange={(e) => update(d.key, { build: e.target.checked })}
                    aria-label={t('newMap.book.buildNow', { title: titleOf(d) })}
                    className="size-5 accent-[var(--brand)]"
                  />
                  {content ? (
                    <span
                      className="flex size-7 items-center justify-center rounded-lg border-2 border-line font-mono text-xs font-bold text-ink"
                      style={{ background: color.fill }}
                    >
                      {n}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <input
                      value={d.title}
                      placeholder={titleOf(d)}
                      dir="auto"
                      maxLength={200}
                      aria-label={t('newMap.book.chapterTitle')}
                      onFocus={() => setSelected(d.key)}
                      onChange={(e) => update(d.key, { title: e.target.value })}
                      className={cn(
                        'h-9 min-w-0 rounded-lg border-2 border-transparent bg-transparent px-2 text-[15px] font-semibold hover:border-line-soft focus:border-line focus:bg-surface focus:outline-none',
                        !content && !d.build && 'line-through',
                      )}
                    />
                    {d.build && st && !st.fits && (
                      <span className="inline-flex items-center gap-1 px-2 text-xs font-semibold text-warning">
                        <TriangleAlert size={13} aria-hidden /> {t('newMap.book.tooLong')}
                      </span>
                    )}
                    {!content && d.title.trim() && (
                      <span className="px-2 text-xs font-semibold">
                        {d.kind === 'front'
                          ? t('newMap.book.frontMatter')
                          : t('newMap.book.backMatter')}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-xs font-bold max-sm:hidden" dir="ltr">
                    {d.firstPage === d.lastPage ? d.firstPage : `${d.firstPage}–${d.lastPage}`}
                  </span>
                  <span className="text-xs text-ink-muted max-sm:hidden">
                    {t('newMap.book.size', {
                      paras: fmt.format(st?.paras.length ?? 0),
                      tokens: kFmt.format((st?.estimate.textTokens ?? 0) / 1000),
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={!next}
                    aria-label={t('newMap.book.mergeNext', { title: titleOf(d) })}
                    title={t('newMap.book.mergeNextShort')}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDrafts((ds) => mergeWithNext(ds, d.key))
                    }}
                    className="flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-paper-sunken disabled:cursor-default disabled:opacity-25"
                  >
                    <Combine size={16} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {sel && (
          <PageStrip
            draft={sel}
            title={titleOf(sel)}
            extracted={extracted}
            photos={photos}
            skipped={skippedPages}
            onToggle={(p) =>
              setSkippedPages((prev) => {
                const next = new Set(prev)
                if (next.has(p)) next.delete(p)
                else next.add(p)
                return next
              })
            }
            onSplit={(p) =>
              setDrafts((ds) => splitAt(ds, p, t('newMap.book.newChapterAt', { page: p })))
            }
          />
        )}
      </section>

      <Panel
        shadow="lg"
        className="flex min-w-[300px] max-w-[400px] flex-[1_1_340px] flex-col gap-4 p-5"
      >
        <h2 className="text-lg font-bold">{t('newMap.options')}</h2>
        <ModelSelect
          activeKey={key}
          configured={configured}
          keys={keys}
          onChange={setProviderChoice}
        />
        <DetailPicker value={detail} onChange={setDetail} />
        <LanguageFields
          language={language}
          onLanguage={setLanguage}
          explanations={explanations}
          onExplanations={setExplanations}
        />
        <EstimateBox
          title={t('newMap.book.estimateFor', { count: toBuild.length })}
          tokens={total.tokensSent}
          requests={`${total.min}–${total.max}`}
          cost={
            key ? estimateCost(key.provider, key.model, total.tokensSent, total.tokensOut) : null
          }
          note={key?.provider === 'gemini' ? t('newMap.book.freeKeyNote') : undefined}
        />
        <p className="text-xs leading-relaxed text-ink-muted">
          {t('newMap.privacy', {
            provider: t(`settings.providers.${key?.provider ?? 'gemini'}.name`),
          })}
        </p>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={<ArrowLeft size={17} aria-hidden className="rtl:-scale-x-100" />}
            onClick={onBack}
            disabled={busy}
          >
            {t('newMap.back')}
          </Button>
          <Button
            className="flex-1"
            loading={busy}
            disabled={!key || toBuild.length === 0}
            icon={busy ? undefined : <CircleCheck size={18} aria-hidden />}
            onClick={() => void build()}
          >
            {busy ? t('newMap.creating') : t('newMap.book.build', { count: toBuild.length })}
          </Button>
        </div>
        {laterCount > 0 && (
          <p className="text-center text-xs text-ink-muted">
            {t('newMap.book.later', { count: laterCount })}
          </p>
        )}
        {!key && <Badge tone="warning">{t('ai.errors.no_key')}</Badge>}
      </Panel>
    </div>
  )
}

/** Thumbnails of a chapter's pages: tap a page to skip it, or start a new chapter there. */
function PageStrip({
  draft,
  title,
  extracted,
  photos,
  skipped,
  onToggle,
  onSplit,
}: {
  draft: ChapterDraft
  title: string
  extracted: Extracted
  photos: File[]
  skipped: ReadonlySet<number>
  onToggle: (page: number) => void
  onSplit: (page: number) => void
}) {
  const { t } = useTranslation()
  const pages = Array.from(
    { length: draft.lastPage - draft.firstPage + 1 },
    (_, i) => draft.firstPage + i,
  )
  const ocr = new Set(extracted.ocrPages)
  return (
    <div className="flex flex-col gap-3 rounded-neo-lg border-2 border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 dir="auto" className="text-base font-bold">
          {t('newMap.book.pagesOf', { title })}
        </h2>
        <span className="text-sm text-ink-muted">{t('newMap.book.pagesHint')}</span>
      </div>
      <ol className="flex gap-2.5 overflow-x-auto pb-2">
        {pages.map((p) => {
          const isSkipped = skipped.has(p)
          return (
            <li key={p} className="flex shrink-0 items-end gap-2.5">
              {p > draft.firstPage && (
                <button
                  type="button"
                  onClick={() => onSplit(p)}
                  aria-label={t('newMap.book.splitAt', { page: p })}
                  title={t('newMap.book.splitAt', { page: p })}
                  className="group flex h-[118px] w-3 cursor-pointer items-center justify-center rounded-full hover:bg-brand-soft focus-visible:bg-brand-soft"
                >
                  <Scissors
                    size={13}
                    aria-hidden
                    className="text-ink-faint opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </button>
              )}
              <button
                type="button"
                aria-pressed={isSkipped}
                aria-label={t(isSkipped ? 'newMap.book.pageSkipped' : 'newMap.book.page', {
                  page: p,
                })}
                onClick={() => onToggle(p)}
                className={cn(
                  'relative flex h-[118px] w-[84px] cursor-pointer flex-col overflow-hidden rounded-md border-2 bg-surface',
                  isSkipped ? 'border-dashed border-danger' : 'border-line',
                )}
              >
                <Thumb extracted={extracted} photos={photos} page={p} dim={isSkipped} />
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-surface/90 py-0.5 font-mono text-[11px] font-bold">
                  {p}
                  {ocr.has(p) && (
                    <span className="rounded border border-line bg-ch-sky px-0.5 text-[9px]">
                      OCR
                    </span>
                  )}
                </span>
                {isSkipped && (
                  <span className="absolute inset-x-1 top-1/3 rounded bg-danger-soft py-0.5 text-center text-[11px] font-bold text-danger">
                    {t('newMap.skipped')}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** A page thumbnail, rendered only when it scrolls into view. */
function Thumb({
  extracted,
  photos,
  page,
  dim,
}: {
  extracted: Extracted
  photos: File[]
  page: number
  dim: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    let url: string | null = null
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry?.isIntersecting) return
      io.disconnect()
      try {
        if (extracted.kind === 'images') {
          const f = photos[page - 1]
          if (f) url = URL.createObjectURL(f)
        } else if (extracted.doc) {
          const canvas = await renderPage(extracted.doc, page, { width: 160 })
          url = canvas.toDataURL('image/jpeg', 0.7)
        }
        if (!cancelled && url) setSrc(url)
      } catch {
        /* thumbnail is optional */
      }
    })
    io.observe(el)
    return () => {
      cancelled = true
      io.disconnect()
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }, [extracted, photos, page])
  return (
    <span ref={ref} className="block size-full bg-paper-sunken">
      {src && (
        <img
          src={src}
          alt=""
          className={cn('size-full object-cover object-top', dim && 'opacity-40')}
        />
      )}
    </span>
  )
}
