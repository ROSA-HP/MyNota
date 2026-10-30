import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { CostEstimate } from '@/ai/pricing'
import { SelectField } from '@/components/ui'
import type { ActiveKey } from '@/features/settings/aiKeyStore'
import { cn } from '@/lib/cn'
import type { AiProvider } from '@/lib/database.types'

export type Detail = 'brief' | 'standard' | 'detailed'

const DETAIL_LABEL: Record<Detail, ParseKeys> = {
  brief: 'newMap.detailBrief',
  standard: 'newMap.detailStandard',
  detailed: 'newMap.detailDetailed',
}

export function DetailPicker({
  value,
  onChange,
}: {
  value: Detail
  onChange: (d: Detail) => void
}) {
  const { t } = useTranslation()
  return (
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
            aria-checked={value === d}
            onClick={() => onChange(d)}
            className={cn(
              'min-h-10 flex-1 cursor-pointer rounded-[7px] text-sm font-semibold',
              value === d ? 'bg-ink text-paper' : 'hover:bg-paper-sunken',
            )}
          >
            {t(DETAIL_LABEL[d])}
          </button>
        ))}
      </div>
    </div>
  )
}

export function LanguageFields({
  language,
  onLanguage,
  explanations,
  onExplanations,
}: {
  language: string
  onLanguage: (v: string) => void
  explanations: string
  onExplanations: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <SelectField
        label={t('newMap.textLanguage')}
        value={language}
        onChange={(e) => onLanguage(e.target.value)}
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
        onChange={(e) => onExplanations(e.target.value)}
        options={[
          { value: 'same', label: t('newMap.sameAsText') },
          { value: 'en', label: 'English', lang: 'en' },
          { value: 'ar', label: 'العربية', lang: 'ar' },
          { value: 'de', label: 'Deutsch', lang: 'de' },
        ]}
      />
    </>
  )
}

export function ModelSelect({
  activeKey,
  configured,
  keys,
  onChange,
}: {
  activeKey: ActiveKey | null
  configured: AiProvider[]
  keys: Partial<Record<AiProvider, ActiveKey>>
  onChange: (p: AiProvider) => void
}) {
  const { t } = useTranslation()
  if (!configured.length || !activeKey) return null
  return (
    <SelectField
      label={t('newMap.aiModel')}
      value={activeKey.provider}
      onChange={(e) => onChange(e.target.value as AiProvider)}
      options={configured.map((p) => ({
        value: p,
        label: `${t(`settings.providers.${p}.name`)} · ${keys[p]?.model ?? ''}`,
      }))}
      hint={configured.length === 1 ? t('newMap.aiModelHint') : undefined}
    />
  )
}

export function CostLabel({ cost }: { cost: CostEstimate }) {
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

export function EstimateBox({
  title,
  tokens,
  requests,
  cost,
  note,
}: {
  title: string
  tokens: number
  requests: string
  cost: CostEstimate | null
  note?: string
}) {
  const { t, i18n } = useTranslation()
  const fmt = new Intl.NumberFormat(i18n.language)
  return (
    <div className="flex flex-col gap-2 rounded-neo border-2 border-line bg-surface-muted p-3">
      <span className="text-sm font-bold">{title}</span>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-ink-muted">{t('newMap.estTokens')}</dt>
          <dd className="font-mono text-lg font-bold">
            ~{fmt.format(Math.round(tokens / 100) * 100)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">{t('newMap.estRequests')}</dt>
          <dd className="font-mono text-lg font-bold" dir="ltr">
            {requests}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-ink-muted">{t('newMap.estCost')}</dt>
          <dd className="text-sm font-bold">{cost ? <CostLabel cost={cost} /> : null}</dd>
        </div>
      </dl>
      {note && <p className="text-xs leading-relaxed text-ink-muted">{note}</p>}
    </div>
  )
}
