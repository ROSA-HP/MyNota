import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ParseKeys } from 'i18next'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  FileText,
  KeyRound,
  Languages,
  Square,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createErrorKey } from './createError'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  detectLanguage,
  estimateRun,
  fitsInOneRequest,
  MAX_PASTE_CHARS,
  splitParagraphs,
} from '@/ai/pipeline/prepare'
import { estimateCost } from '@/ai/pricing'
import { PROVIDERS, testProvider } from '@/ai/providers'
import {
  Alert,
  Badge,
  Button,
  Logo,
  Panel,
  SelectField,
  TextField,
  buttonClasses,
} from '@/components/ui'
import { useAiKey } from '@/features/settings/aiKeyStore'
import { createMap } from '@/features/workspace/mapRepo'
import { cn } from '@/lib/cn'
import type { AiProvider, MapRow, SubjectRow } from '@/lib/database.types'
import { SUBJECT_COLUMNS, supabase } from '@/lib/supabase'
import type { BuildRequest } from './buildRequest'
import type { Extracted, ExtractProgress } from '@/ai/pipeline/extract'
import type { OcrLanguage } from '@/ai/pipeline/extract/ocr'
import { ThemeButton } from '@/features/settings/ThemeToggle'
import { BookReview, type BookFile } from './BookReview'
import { DetailPicker, EstimateBox, LanguageFields, ModelSelect } from './options'
import {
  DevicePrivacyNote,
  ExtractProgressPanel,
  OcrLanguageSelect,
  PdfPicker,
  PhotoPicker,
  SourceTabs,
  type SourceKind,
} from './SourcePicker'

type Kind = MapRow['type']
type Detail = BuildRequest['detailLevel']

const LANG_LABEL: Record<string, string> = { en: 'English', ar: 'العربية', de: 'Deutsch' }

function Steps({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation()
  const items = [t('newMap.stepText'), t('newMap.stepReview'), t('newMap.stepBuild')]
  return (
    <ol
      aria-label={t('newMap.title')}
      className="flex flex-wrap items-center gap-2.5 text-sm font-semibold"
    >
      {items.map((label, i) => {
        const n = i + 1
        const done = n < step
        const current = n === step
        return (
          <li
            key={label}
            className="flex items-center gap-2.5"
            aria-current={current ? 'step' : undefined}
          >
            {i > 0 && (
              // The line to a step fills in when you reach it.
              <span aria-hidden className="relative h-0.5 w-8 overflow-hidden bg-line-soft">
                <span
                  className={cn(
                    'absolute inset-0 origin-left bg-line transition-transform duration-500 ease-soft rtl:origin-right',
                    n <= step ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </span>
            )}
            <span
              key={current ? 'current' : done ? 'done' : 'todo'}
              className={cn(
                'flex size-7 items-center justify-center rounded-full border-2 font-mono text-xs font-bold',
                (current || done) && 'animate-pop',
                done
                  ? 'border-line bg-brand text-brand-ink'
                  : current
                    ? 'border-line bg-selected text-selected-ink'
                    : 'border-ink-faint text-ink-muted',
              )}
            >
              {done ? <Check size={14} strokeWidth={3} aria-hidden /> : n}
            </span>
            <span className={cn(!current && !done && 'text-ink-muted')}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function KindCard({
  checked,
  onSelect,
  icon,
  tint,
  title,
  body,
}: {
  checked: boolean
  onSelect: () => void
  icon: ReactNode
  tint: string
  title: string
  body: string
}) {
  return (
    <label
      className={cn(
        'neo-btn group flex cursor-pointer flex-col gap-2 rounded-neo-lg border-2 border-line bg-surface p-4',
        checked ? 'neo-shadow outline-3 outline-offset-2 outline-brand' : 'hover:bg-surface-muted',
      )}
    >
      <span className="flex items-center justify-between">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-neo border-2 border-line text-ink transition-transform duration-300 ease-spring group-hover:-rotate-6',
            checked && 'scale-110 -rotate-6',
            tint,
          )}
        >
          {icon}
        </span>
        <input
          type="radio"
          name="kind"
          checked={checked}
          onChange={onSelect}
          className="size-5 accent-[var(--brand)]"
        />
      </span>
      <span className="text-base font-bold">{title}</span>
      <span className="text-sm text-ink-muted">{body}</span>
    </label>
  )
}

export function NewMapPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const keys = useAiKey((s) => s.keys)
  const defaultKey = useAiKey((s) => s.key)
  const [providerChoice, setProviderChoice] = useState<AiProvider | null>(null)
  const key = (providerChoice && keys[providerChoice]) || defaultKey
  const configured = PROVIDERS.filter((p) => keys[p])
  const [step, setStep] = useState<1 | 2 | 'book'>(1)
  const [sourceChoice, setSource] = useState<SourceKind | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>(
    i18n.language.startsWith('ar') ? 'ar' : i18n.language.startsWith('de') ? 'de' : 'en',
  )
  const [progress, setProgress] = useState<ExtractProgress | null>(null)
  const [extracted, setExtracted] = useState<Extracted | null>(null)
  const [bookFile, setBookFile] = useState<BookFile | null>(null)
  const extractCtrl = useRef<AbortController | null>(null)
  const [kind, setKind] = useState<Kind>('notes')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<{ title?: string; text?: string; form?: string }>({})
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [languageChoice, setLanguage] = useState<string | null>(null)
  const [explanations, setExplanations] = useState<string>('same')
  const [detail, setDetail] = useState<Detail>('standard')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [modelLimit, setModelLimit] = useState<number | undefined>(undefined)
  // Subjects: "New map" from a subject in the library comes with ?subject=…
  const [params] = useSearchParams()
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [subjectChoice, setSubjectChoice] = useState<string | null>(null)
  const fromLink = params.get('subject')
  // null: not chosen yet (use the link's subject); '': "No subject" picked.
  const subjectId =
    subjectChoice === null
      ? subjects.some((s) => s.id === fromLink)
        ? fromLink
        : null
      : subjectChoice || null
  useEffect(() => {
    let cancelled = false
    void supabase
      .from('subjects')
      .select(SUBJECT_COLUMNS)
      .order('sort_order')
      .then(({ data }) => !cancelled && data && setSubjects(data))
    return () => {
      cancelled = true
    }
  }, [])

  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/u).length : 0), [text])
  const paragraphs = useMemo(() => (step === 2 ? splitParagraphs(text) : []), [step, text])
  const detected = useMemo(() => (step === 2 ? detectLanguage(text) : null), [step, text])
  const kept = paragraphs.filter((p) => !skipped.has(p.n))
  // The detected language unless the student picked one.
  const language = languageChoice ?? detected?.lang ?? 'other'
  const estimate = estimateRun(kept)
  const costOf = (provider: AiProvider, model: string) =>
    estimateCost(provider, model, estimate.tokensSent, estimate.tokensOut)

  // The chosen model's context window decides whether the text fits one outline request.
  useEffect(() => {
    if (step !== 2 || !key) return
    const ctrl = new AbortController()
    testProvider(key, ctrl.signal)
      .then((r) => setModelLimit(r.models.find((m) => m.id === key.model)?.inputTokenLimit))
      .catch(() => undefined)
    return () => ctrl.abort()
  }, [step, key])

  // Books start from a PDF, notes from pasted text; the student can switch.
  const source: SourceKind = sourceChoice ?? (kind === 'book' ? 'pdf' : 'paste')

  /** Reads the PDF or photos on this device, then opens the right review step. */
  async function readFile() {
    const next: typeof errors = {}
    const fileTitle = (pdfFile?.name ?? photos[0]?.name ?? '').replace(/\.[a-z0-9]+$/i, '')
    if (!title.trim() && !fileTitle) next.title = t('newMap.errTitle')
    if (source === 'pdf' && !pdfFile) next.text = t('newMap.source.errNoPdf')
    if (source === 'photos' && !photos.length) next.text = t('newMap.source.errNoPhotos')
    setErrors(next)
    if (Object.keys(next).length) return
    if (!title.trim()) setTitle(fileTitle.slice(0, 200))
    const ctrl = new AbortController()
    extractCtrl.current = ctrl
    setProgress({ read: 0, total: source === 'pdf' ? 0 : photos.length, ocrTotal: 0, ocrDone: 0 })
    try {
      const { extractPdf, extractImages, fileHash } = await import('@/ai/pipeline/extract')
      const opts = { ocrLanguage, signal: ctrl.signal, onProgress: setProgress }
      const result =
        source === 'pdf' && pdfFile
          ? await extractPdf(pdfFile, opts)
          : await extractImages(photos, opts)
      const blobs: Blob[] = source === 'pdf' && pdfFile ? [pdfFile] : photos
      const hash = await fileHash(source === 'pdf' && pdfFile ? pdfFile : new Blob(photos))
      setExtracted(result)
      setBookFile({
        name: (pdfFile?.name ?? `${fileTitle || 'photos'} (${photos.length})`).slice(0, 255),
        size: blobs.reduce((n, b) => n + b.size, 0),
        hash,
        type: source === 'pdf' ? 'application/pdf' : 'image/*',
        blobs,
      })
      if (kind === 'book') setStep('book')
      else {
        // Notes from a file: its paragraphs go through the same paragraph review as pasted text.
        setText(
          result.paragraphs
            .map((p) => p.text)
            .join('\n\n')
            .slice(0, MAX_PASTE_CHARS),
        )
        setSkipped(new Set())
        setStep(2)
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        const kindOf = (e as { kind?: string }).kind
        setErrors({
          form: t(`newMap.source.errors.${kindOf ?? 'unreadable'}` as ParseKeys, {
            pages: 300,
            mb: 50,
          }),
        })
      }
    } finally {
      setProgress(null)
      extractCtrl.current = null
    }
  }

  function validateStep1(): boolean {
    const next: typeof errors = {}
    if (!title.trim()) next.title = t('newMap.errTitle')
    if (kind !== 'blank') {
      if (!text.trim()) next.text = t('newMap.errText')
      else if (text.length > MAX_PASTE_CHARS)
        next.text = t('newMap.errTooLong', { count: text.length })
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function createBlank() {
    if (!validateStep1()) return
    setBusy(true)
    try {
      const { mapId } = await createMap({
        title: title.trim(),
        type: 'blank',
        subjectId,
        language: null,
        paragraphs: [],
      })
      navigate(`/maps/${mapId}`, { replace: true })
    } catch (e) {
      setErrors({ form: t(createErrorKey(e)) })
      setBusy(false)
    }
  }

  async function build() {
    if (!key) return
    if (kept.length === 0) return setErrors({ form: t('newMap.errNothingKept') })
    // Renumber the kept paragraphs P1..Pn so citations always point at stored text.
    const numbered = kept.map((p, i) => ({ n: i + 1, text: p.text }))
    if (!fitsInOneRequest(numbered, modelLimit))
      return setErrors({ form: t('newMap.errTooLongModel', { model: key.model }) })
    setBusy(true)
    setErrors({})
    const sourceLanguage = language === 'other' ? null : language || null
    try {
      const { mapId, rootId } = await createMap({
        title: title.trim(),
        type: kind,
        subjectId,
        language: sourceLanguage,
        paragraphs: numbered,
      })
      const request: BuildRequest = {
        rootId,
        title: title.trim(),
        paragraphs: numbered,
        sourceLanguage,
        explanationLanguage: explanations === 'same' ? sourceLanguage : explanations,
        detailLevel: detail,
        provider: key.provider,
        mode: kind === 'notes' ? 'notes' : 'textbook',
      }
      navigate(`/maps/${mapId}`, { replace: true, state: { build: request } })
    } catch (e) {
      setErrors({ form: t(createErrorKey(e)) })
      setBusy(false)
    }
  }

  const visible = showAll ? paragraphs : paragraphs.slice(0, 60)

  return (
    <div className="min-h-dvh bg-paper">
      <header className="flex h-16 items-center gap-3 border-b-2 border-line bg-surface px-4 sm:px-6">
        <Link to="/library" className="rounded-neo">
          <Logo />
        </Link>
        <ThemeButton className="ms-auto" />
        <Link to="/library" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
          <X size={16} aria-hidden /> {t('newMap.cancel')}
        </Link>
      </header>

      <main
        id="main"
        className={cn(
          'mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6',
          step === 1 ? 'max-w-3xl' : 'max-w-6xl',
        )}
      >
        <Steps step={step === 'book' ? 2 : step} />

        {step === 1 && (
          // Each step slides in; its parts rise one after another.
          <div key="step1" className="mynota-stagger flex flex-col gap-6">
            <h1 className="text-3xl font-bold tracking-tight">{t('newMap.title')}</h1>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-sm font-bold">{t('newMap.kindLegend')}</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <KindCard
                  checked={kind === 'notes'}
                  onSelect={() => setKind('notes')}
                  icon={<FileText size={20} aria-hidden />}
                  tint="bg-ch-mint"
                  title={t('newMap.kindNotes')}
                  body={t('newMap.kindNotesBody')}
                />
                <KindCard
                  checked={kind === 'book'}
                  onSelect={() => setKind('book')}
                  icon={<BookOpen size={20} aria-hidden />}
                  tint="bg-ch-yellow"
                  title={t('newMap.kindBook')}
                  body={t('newMap.kindBookBody')}
                />
                <KindCard
                  checked={kind === 'blank'}
                  onSelect={() => setKind('blank')}
                  icon={<Square size={20} aria-hidden />}
                  tint="bg-paper-sunken"
                  title={t('newMap.kindBlank')}
                  body={t('newMap.kindBlankBody')}
                />
              </div>
            </fieldset>

            <TextField
              label={t('newMap.titleLabel')}
              placeholder={t('newMap.titlePlaceholder')}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              dir="auto"
            />

            {subjects.length > 0 && (
              <SelectField
                label={t('newMap.subject')}
                value={subjectId ?? ''}
                onChange={(e) => setSubjectChoice(e.target.value || '')}
                options={[
                  { value: '', label: t('library.noSubject') },
                  ...subjects.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            )}

            {kind !== 'blank' && (
              <SourceTabs
                value={source}
                onChange={(v) => {
                  setSource(v)
                  setErrors({})
                }}
              />
            )}
            {kind !== 'blank' && source === 'paste' && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="paste" className="text-sm font-semibold">
                    {t('newMap.pasteLabel')}
                  </label>
                  <span className="text-xs font-semibold tabular-nums text-ink-muted">
                    {t('newMap.words', { count: words })}
                  </span>
                </div>
                <textarea
                  id="paste"
                  dir="auto"
                  rows={12}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  aria-invalid={Boolean(errors.text) || undefined}
                  aria-describedby="paste-hint"
                  className={cn(
                    'w-full resize-y rounded-neo-lg border-2 bg-surface p-3.5 text-[15px] leading-relaxed text-ink focus:outline-none focus:neo-shadow-sm',
                    errors.text ? 'border-danger' : 'border-line',
                  )}
                />
                {errors.text ? (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {errors.text}
                  </p>
                ) : (
                  <p id="paste-hint" className="text-sm text-ink-muted">
                    {t('newMap.pasteHint')}
                  </p>
                )}
              </div>
            )}

            {kind !== 'blank' && source !== 'paste' && (
              <div className="flex flex-col gap-4">
                {source === 'pdf' ? (
                  <PdfPicker file={pdfFile} onFile={setPdfFile} />
                ) : (
                  <PhotoPicker photos={photos} onPhotos={setPhotos} />
                )}
                {errors.text && (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {errors.text}
                  </p>
                )}
                <OcrLanguageSelect
                  value={ocrLanguage}
                  onChange={setOcrLanguage}
                  forPhotos={source === 'photos'}
                />
                <DevicePrivacyNote />
              </div>
            )}

            {progress && (
              <ExtractProgressPanel
                progress={progress}
                photos={source === 'photos'}
                onCancel={() => extractCtrl.current?.abort()}
              />
            )}

            {kind !== 'blank' &&
              (key ? (
                <div className="flex flex-wrap items-center gap-3 rounded-neo-lg border-2 border-line bg-surface p-3">
                  <span className="flex size-8 items-center justify-center rounded-neo border-2 border-line bg-success-soft">
                    <Check size={16} strokeWidth={3} aria-hidden />
                  </span>
                  <span className="text-sm">
                    <strong>{t('newMap.keyReady')}</strong>{' '}
                    <span className="text-ink-muted">{t('newMap.keyReadyHint')}</span>
                  </span>
                  <Link
                    to="/settings"
                    className="ms-auto text-sm font-semibold underline underline-offset-4"
                  >
                    {t('newMap.changeKey')}
                  </Link>
                </div>
              ) : (
                <Alert tone="warning">
                  <span className="flex flex-wrap items-center gap-3">
                    {t('newMap.keyMissing')}
                    <Link
                      to="/settings"
                      className={buttonClasses({ size: 'sm', variant: 'secondary' })}
                    >
                      <KeyRound size={15} aria-hidden /> {t('newMap.addKey')}
                    </Link>
                  </span>
                </Alert>
              ))}

            {errors.form && <Alert tone="danger">{errors.form}</Alert>}

            <div className="flex justify-end">
              {kind === 'blank' ? (
                <Button size="lg" loading={busy} onClick={() => void createBlank()}>
                  {t('newMap.createBlank')}
                </Button>
              ) : (
                <Button
                  size="lg"
                  disabled={!key || Boolean(progress)}
                  loading={Boolean(progress)}
                  iconEnd={<ArrowRight size={18} aria-hidden className="rtl:-scale-x-100" />}
                  onClick={() =>
                    source === 'paste' ? validateStep1() && setStep(2) : void readFile()
                  }
                >
                  {t('newMap.continue')}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'book' && extracted && bookFile && (
          <div key="book" className="mynota-page">
            <BookReview
              extracted={extracted}
              title={title}
              file={bookFile}
              photos={photos}
              onBack={() => setStep(1)}
              subjectId={subjectId}
            />
          </div>
        )}

        {step === 2 && (
          <div key="step2" className="mynota-page flex flex-wrap items-start gap-6">
            <section
              aria-labelledby="review-h"
              className="flex min-w-0 flex-[999_1_560px] flex-col gap-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h1 id="review-h" className="text-2xl font-bold">
                  {t('newMap.reviewTitle')}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-ch-sky px-2.5 py-0.5 text-sm font-bold text-ink">
                  <Languages size={15} aria-hidden />
                  {detected?.lang
                    ? t('newMap.detected', { lang: LANG_LABEL[detected.lang] ?? detected.lang })
                    : t('newMap.detectedUnknown')}
                </span>
              </div>
              <p className="text-sm text-ink-muted">{t('newMap.skipHint')}</p>
              <p className="text-xs font-semibold tabular-nums text-ink-muted">
                {t('newMap.kept', { count: kept.length, total: paragraphs.length })}
              </p>
              <ul className="overflow-hidden rounded-neo-lg border-2 border-line bg-surface">
                {visible.map((p) => {
                  const isSkipped = skipped.has(p.n)
                  return (
                    <li
                      key={p.n}
                      className={cn(
                        'border-b-2 border-line-soft last:border-b-0',
                        isSkipped && 'bg-paper-sunken',
                      )}
                    >
                      <label className="flex cursor-pointer gap-3 px-3.5 py-3">
                        <input
                          type="checkbox"
                          checked={!isSkipped}
                          onChange={() =>
                            setSkipped((prev) => {
                              const next = new Set(prev)
                              if (next.has(p.n)) next.delete(p.n)
                              else next.add(p.n)
                              return next
                            })
                          }
                          className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
                        />
                        <span className="w-9 shrink-0 pt-0.5 font-mono text-xs font-bold" dir="ltr">
                          P{p.n}
                        </span>
                        <span
                          dir="auto"
                          className={cn(
                            'min-w-0 flex-1 whitespace-pre-line text-sm leading-relaxed',
                            isSkipped && 'text-ink-faint line-through',
                          )}
                        >
                          {p.text.length > 400 ? `${p.text.slice(0, 400)}…` : p.text}
                        </span>
                        {isSkipped && (
                          <span className="shrink-0 text-xs font-bold text-ink-muted">
                            {t('newMap.skipped')}
                          </span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
              {!showAll && paragraphs.length > visible.length && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={() => setShowAll(true)}
                >
                  +{paragraphs.length - visible.length}
                </Button>
              )}
            </section>

            <Panel className="flex min-w-[300px] max-w-[400px] flex-[1_1_340px] flex-col gap-4 p-5">
              <h2 className="text-lg font-bold">{t('newMap.options')}</h2>

              <DetailPicker value={detail} onChange={setDetail} />
              <LanguageFields
                language={language}
                onLanguage={setLanguage}
                explanations={explanations}
                onExplanations={setExplanations}
              />
              <ModelSelect
                activeKey={key}
                configured={configured}
                keys={keys}
                onChange={setProviderChoice}
              />
              <EstimateBox
                title={t('newMap.estimate')}
                tokens={estimate.tokensSent}
                requests={`${estimate.requestsMin}–${estimate.requestsMax}`}
                cost={key ? costOf(key.provider, key.model) : null}
              />

              <p className="text-xs leading-relaxed text-ink-muted">
                {t('newMap.privacy', {
                  provider: t(`settings.providers.${key?.provider ?? 'gemini'}.name`),
                })}
              </p>
              {errors.form && <Alert tone="danger">{errors.form}</Alert>}

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  icon={<ArrowLeft size={17} aria-hidden className="rtl:-scale-x-100" />}
                  onClick={() => setStep(1)}
                  disabled={busy}
                >
                  {t('newMap.back')}
                </Button>
                <Button
                  className="flex-1"
                  loading={busy}
                  icon={busy ? undefined : <CircleCheck size={18} aria-hidden />}
                  onClick={() => void build()}
                >
                  {busy ? t('newMap.creating') : t('newMap.build')}
                </Button>
              </div>
              {!key && <Badge tone="warning">{t('ai.errors.no_key')}</Badge>}
            </Panel>
          </div>
        )}
      </main>
    </div>
  )
}
