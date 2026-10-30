import { useEffect, useState, type FormEvent } from 'react'
import type { ParseKeys } from 'i18next'
import { CircleCheck, ExternalLink, KeyRound, Link2, Trash } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AiError } from '@/ai/errors'
import { KEY_URLS, PROVIDERS, testProvider } from '@/ai/providers'
import { normalizeBaseUrl } from '@/ai/providers/openaiCompatible'
import type { ModelInfo } from '@/ai/types'
import { Alert, Badge, Button, PasswordField, SelectField, TextField, toast } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { cn } from '@/lib/cn'
import type { AiProvider } from '@/lib/database.types'
import { useAiKey } from './aiKeyStore'

const CHIP: Record<AiProvider, string> = {
  gemini: 'bg-ch-sky',
  anthropic: 'bg-ch-orange',
  openai_compatible: 'bg-ch-lime',
}

/** Settings → AI providers: one card per provider, a default for new maps. */
export function AiProvidersSection() {
  const userId = useAuth((s) => s.session?.user.id)
  const { loaded, load } = useAiKey()

  useEffect(() => {
    if (userId) void load(userId)
  }, [userId, load])

  if (!loaded && userId) return null
  return (
    <div className="flex flex-col gap-4">
      {PROVIDERS.map((p) => (
        <ProviderCard key={p} provider={p} />
      ))}
    </div>
  )
}

function errorKey(err: unknown): ParseKeys {
  return `ai.errors.${err instanceof AiError ? err.kind : 'unknown'}` as ParseKeys
}

function ProviderCard({ provider }: { provider: AiProvider }) {
  const { t, i18n } = useTranslation()
  const key = useAiKey((s) => s.keys[provider])
  const isDefault = useAiKey((s) => s.key?.provider === provider)
  const { save, setModel, setDefault, remove } = useAiKey()
  const isCustom = provider === 'openai_compatible'

  const [editing, setEditing] = useState(false)
  const [draftKey, setDraftKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(key?.baseUrl ?? '')
  const [modelName, setModelName] = useState('')
  const [remember, setRemember] = useState(true)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<ParseKeys | null>(null)
  const [urlError, setUrlError] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])

  // Refresh the model list for a remembered key so the picker is accurate. Listing models
  // costs no tokens.
  useEffect(() => {
    if (!key || models.length) return
    const ctrl = new AbortController()
    testProvider(key, ctrl.signal)
      .then((r) => setModels(r.models))
      .catch(() => undefined)
    return () => ctrl.abort()
  }, [key, models.length])

  const showForm = !key || editing
  const canSubmit = isCustom ? Boolean(baseUrl.trim()) : Boolean(draftKey.trim())

  async function onTest(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const apiKey = draftKey.trim()
    let base: string | undefined
    if (isCustom) {
      base = normalizeBaseUrl(baseUrl) ?? undefined
      setUrlError(!base)
      if (!base) return
    }
    setTesting(true)
    setError(null)
    try {
      const result = await testProvider({
        provider,
        apiKey,
        baseUrl: base,
        model: modelName.trim() || undefined,
      })
      setModels(result.models)
      await save({
        provider,
        apiKey,
        baseUrl: base,
        model: modelName.trim() || result.models[0]?.id || '',
        remembered: remember,
        testedAt: new Date().toISOString(),
      })
      setDraftKey('')
      setEditing(false)
      toast(t('settings.works'), 'success')
    } catch (err) {
      setError(errorKey(err))
    } finally {
      setTesting(false)
    }
  }

  const modelOptions = (
    models.length ? models : key ? [{ id: key.model, label: key.model }] : []
  ).map((m) => ({ value: m.id, label: m.label === m.id ? m.id : `${m.label} (${m.id})` }))

  const keyUrl = KEY_URLS[provider]
  const masked = key?.apiKey ? `${key.apiKey.slice(0, 4)}…${key.apiKey.slice(-4)}` : null

  return (
    <section
      aria-labelledby={`prov-${provider}`}
      className={cn(
        'flex flex-col gap-4 rounded-neo-lg border-2 border-line bg-surface p-4',
        isDefault && 'border-[2.5px] neo-shadow',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-neo border-2 border-line text-ink',
            CHIP[provider],
          )}
        >
          {isCustom ? <Link2 size={20} aria-hidden /> : <KeyRound size={20} aria-hidden />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span id={`prov-${provider}`} className="font-bold">
            {t(`settings.providers.${provider}.name`)}
          </span>
          <span className="text-sm text-ink-muted">{t(`settings.providers.${provider}.note`)}</span>
        </span>
        {provider === 'gemini' && <Badge tone="brand">{t('settings.recommended')}</Badge>}
        <label
          className={cn(
            'ms-auto inline-flex items-center gap-2 text-sm font-semibold',
            key ? 'cursor-pointer' : 'cursor-not-allowed text-ink-faint',
          )}
        >
          <input
            type="radio"
            name="default-provider"
            checked={isDefault}
            disabled={!key}
            onChange={() => void setDefault(provider)}
            className="size-5 accent-[var(--brand)]"
          />
          {t('settings.default')}
        </label>
      </div>

      {key && !editing && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-bold text-success">
              <CircleCheck size={18} aria-hidden /> {t('settings.works')}
            </span>
            <span className="text-sm text-ink-muted">
              {t('settings.testedOn', {
                date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                  new Date(key.testedAt),
                ),
              })}
              {' · '}
              {key.remembered ? t('settings.storedHere') : t('settings.memoryOnly')}
            </span>
            {masked && (
              <span className="font-mono text-sm text-ink-muted" dir="ltr">
                {masked}
              </span>
            )}
            {key.baseUrl && (
              <span className="truncate font-mono text-sm text-ink-muted" dir="ltr">
                {key.baseUrl}
              </span>
            )}
          </div>
          <SelectField
            label={t('settings.model')}
            value={key.model}
            onChange={(e) => void setModel(provider, e.target.value)}
            options={modelOptions}
            className="max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setBaseUrl(key.baseUrl ?? '')
                setEditing(true)
              }}
            >
              {t('settings.replace')}
            </Button>
            <Button
              variant="ghost"
              icon={<Trash size={17} aria-hidden />}
              onClick={async () => {
                await remove(provider)
                setModels([])
                toast(t('settings.removed'))
              }}
            >
              {t('settings.remove')}
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={onTest} noValidate className="flex max-w-xl flex-col gap-4">
          {error && (
            <Alert tone="danger">
              <span className="block font-semibold">{t(error)}</span>
              {error === 'ai.errors.unreachable' && (
                <span className="mt-1 block text-sm">{t('settings.unreachableHelp')}</span>
              )}
            </Alert>
          )}
          {isCustom && (
            <TextField
              label={t('settings.baseUrl')}
              placeholder="https://…/v1"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              ltr
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value)
                setUrlError(false)
              }}
              hint={t('settings.baseUrlHint')}
              error={urlError ? t('settings.baseUrlInvalid') : undefined}
            />
          )}
          <PasswordField
            label={isCustom ? t('settings.keyLabelOptional') : t('settings.keyLabel')}
            placeholder={t('settings.keyPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            hint={
              keyUrl ? (
                <a
                  href={keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-ink underline underline-offset-4"
                >
                  {t(`settings.providers.${provider}.getKey` as ParseKeys)}{' '}
                  <ExternalLink size={14} aria-hidden />
                </a>
              ) : undefined
            }
          />
          {isCustom && (
            <TextField
              label={t('settings.modelName')}
              autoComplete="off"
              spellCheck={false}
              ltr
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              hint={t('settings.modelNameHint')}
            />
          )}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="mt-1 size-5 accent-[var(--brand)]"
            />
            <span>
              <span className="block font-semibold">{t('settings.remember')}</span>
              <span className="block text-sm text-ink-muted">{t('settings.rememberHint')}</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={testing} disabled={!canSubmit}>
              {testing ? t('settings.testing') : t('settings.test')}
            </Button>
            {key && (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
