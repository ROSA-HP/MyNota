import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { Link, useNavigate } from 'react-router'
import {
  detectLanguage,
  estimateRun,
  fitsInOneRequest,
  MAX_PASTE_CHARS,
  splitParagraphs,
} from '@/ai/pipeline/prepare'
import { estimateCost, type CostEstimate } from '@/ai/pricing'
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
import type { AiProvider, MapRow } from '@/lib/database.types'
import type { BuildRequest } from './buildRequest'

type Kind = MapRow['type']
type Detail = BuildRequest['detailLevel']

const LANG_LABEL: Record<string, string> = { en: 'English', ar: 'العربية', de: 'Deutsch' }
const DETAIL_LABEL: Record<Detail, ParseKeys> = {
  brief: 'newMap.detailBrief',
  standard: 'newMap.detailStandard',
  detailed: 'newMap.detailDetailed',
}

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
              <span
                aria-hidden
                className={cn('h-0.5 w-8', n <= step ? 'bg-line' : 'bg-line-soft')}
              />
            )}
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-full border-2 font-mono text-xs font-bold',
                done
                  ? 'border-line bg-brand text-brand-ink'
                  : current
                    ? 'border-line bg-ink text-paper'
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
        'neo-btn flex cursor-pointer flex-col gap-2 rounded-neo-lg border-2 border-line bg-surface p-4',
        checked ? 'neo-shadow outline-3 outline-offset-2 outline-brand' : 'hover:bg-surface-muted',
      )}
    >
      <span className="flex items-center justify-between">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-neo border-2 border-line text-ink',
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
  const [step, setStep] = useState<1 | 2>(1)
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
        subjectId: null,
        language: null,
        paragraphs: [],
      })
      navigate(`/maps/${mapId}`, { replace: true })
    } catch {
      setErrors({ form: t('newMap.errCreate') })
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
        subjectId: null,
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
      }
      navigate(`/maps/${mapId}`, { replace: true, state: { build: request } })
    } catch {
      setErrors({ form: t('newMap.errCreate') })
      setBusy(false)
    }
  }

  const visible = showAll ? paragraphs : paragraphs.slice(0, 60)
  const numberFmt = new Intl.NumberFormat(i18n.language)

  return (
    <div className="min-h-dvh bg-paper">
      <header className="flex h-16 items-center gap-3 border-b-2 border-line bg-surface px-4 sm:px-6">
        <Link to="/library" className="rounded-neo">
          <Logo />
        </Link>
        <Link
          to="/library"
          className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'ms-auto' })}
        >
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
        <Steps step={step} />

        {step === 1 && (
          <>
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

            {kind !== 'blank' && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="paste" className="text-sm font-semibold">
                    {t('newMap.pasteLabel')}
                  </label>
                  <span className="font-mono text-xs font-bold text-ink-muted">
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
                  disabled={!key}
                  iconEnd={<ArrowRight size={18} aria-hidden className="rtl:-scale-x-100" />}
                  onClick={() => validateStep1() && setStep(2)}
                >
                  {t('newMap.continue')}
                </Button>
              )}
            </div>
          </>
        )}

        {step === 2 && (
          <div className="flex flex-wrap items-start gap-6">
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
              <p className="font-mono text-xs font-bold text-ink-muted">
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

            <Panel
              shadow="lg"
              className="flex min-w-[300px] max-w-[400px] flex-[1_1_340px] flex-col gap-4 p-5"
            >
              <h2 className="text-lg font-bold">{t('newMap.options')}</h2>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">{t('newMap.detail')}</span>
                <div
                  role="radiogroup"
                  aria-label={t('newMap.detail')}
                  className="flex rounded-neo border-2 border-line p-0.5"
                >
                  {(['brief', 'standard', 'detailed'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={detail === d}
                      onClick={() => setDetail(d)}
                      className={cn(
                        'min-h-10 flex-1 cursor-pointer rounded-[7px] text-sm font-semibold',
                        detail === d ? 'bg-ink text-paper' : 'hover:bg-paper-sunken',
                      )}
                    >
                      {t(DETAIL_LABEL[d])}
                    </button>
                  ))}
                </div>
              </div>

              <SelectField
                label={t('newMap.textLanguage')}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                options={[
                  { value: 'en', label: 'English', lang: 'en' },
                  { value: 'ar', label: 'العربية', lang: 'ar' },
                  { value: 'de', label: 'Deutsch', lang: 'de' },
                  { value: 'other', label: t('newMap.otherLanguage') },
                ]}
              />
              <SelectField
                label={t('newMap.explanationsIn')}
                value={explanations}
                onChange={(e) => setExplanations(e.target.value)}
                options={[
                  { value: 'same', label: t('newMap.sameAsText') },
                  { value: 'en', label: 'English', lang: 'en' },
                  { value: 'ar', label: 'العربية', lang: 'ar' },
                  { value: 'de', label: 'Deutsch', lang: 'de' },
                ]}
              />

              {configured.length > 0 && key && (
                <SelectField
                  label={t('newMap.aiModel')}
                  value={key.provider}
                  onChange={(e) => setProviderChoice(e.target.value as AiProvider)}
                  options={configured.map((p) => ({
                    value: p,
                    label: `${t(`settings.providers.${p}.name`)} · ${keys[p]?.model ?? ''}`,
                  }))}
                  hint={configured.length === 1 ? t('newMap.aiModelHint') : undefined}
                />
              )}

              <div className="flex flex-col gap-2 rounded-neo border-2 border-line bg-surface-muted p-3">
                <span className="text-sm font-bold">{t('newMap.estimate')}</span>
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-ink-muted">{t('newMap.estTokens')}</dt>
                    <dd className="font-mono text-lg font-bold">
                      ~{numberFmt.format(Math.round(estimate.tokensSent / 100) * 100)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">{t('newMap.estRequests')}</dt>
                    <dd className="font-mono text-lg font-bold" dir="ltr">
                      {estimate.requestsMin}–{estimate.requestsMax}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-ink-muted">{t('newMap.estCost')}</dt>
                    <dd className="text-sm font-bold">
                      {key ? <CostLabel cost={costOf(key.provider, key.model)} /> : null}
                    </dd>
                  </div>
                </dl>
              </div>

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

function CostLabel({ cost }: { cost: CostEstimate }) {
  const { t, i18n } = useTranslation()
  if (cost.kind === 'free') return <span className="text-success">{t('newMap.costFree')}</span>
  if (cost.kind === 'unknown')
    return <span className="text-ink-muted">{t('newMap.costUnknown')}</span>
  const usd = new Intl.NumberFormat(i18n.language, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cost.usd < 1 ? 3 : 2,
  }).format(cost.usd)
  return <span>{t('newMap.costPaid', { usd })}</span>
}
