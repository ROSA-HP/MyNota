import { useEffect, useState, type FormEvent } from 'react'
import type { ParseKeys } from 'i18next'
import { CircleCheck, ExternalLink, KeyRound, Trash } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AiError } from '@/ai/errors'
import { testGeminiKey } from '@/ai/providers/gemini'
import type { ModelInfo } from '@/ai/types'
import { Alert, Badge, Button, PasswordField, SelectField, toast } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { useAiKey } from './aiKeyStore'

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey'

/** Settings → AI provider: paste the Gemini key, test it, choose a model, remember or not. */
export function AiKeySection() {
  const { t, i18n } = useTranslation()
  const userId = useAuth((s) => s.session?.user.id)
  const { key, loaded, load, save, setModel, remove } = useAiKey()
  const [draft, setDraft] = useState('')
  const [remember, setRemember] = useState(true)
  const [editing, setEditing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<ParseKeys | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])

  useEffect(() => {
    if (userId) void load(userId)
  }, [userId, load])

  const showForm = !key || editing

  async function onTest(e: FormEvent) {
    e.preventDefault()
    const apiKey = draft.trim()
    if (!apiKey) return
    setTesting(true)
    setError(null)
    try {
      const result = await testGeminiKey(apiKey)
      setModels(result.models)
      const model = result.models[0]?.id ?? ''
      await save({
        provider: 'gemini',
        apiKey,
        model,
        remembered: remember,
        testedAt: new Date().toISOString(),
      })
      setDraft('')
      setEditing(false)
      toast(t('settings.works'), 'success')
    } catch (err) {
      setError(`ai.errors.${err instanceof AiError ? err.kind : 'unknown'}` as ParseKeys)
    } finally {
      setTesting(false)
    }
  }

  // Model list for a remembered key: refreshed quietly on open so the picker is accurate.
  useEffect(() => {
    if (!key || models.length) return
    const ctrl = new AbortController()
    testGeminiKey(key.apiKey, undefined, ctrl.signal)
      .then((r) => setModels(r.models))
      .catch(() => undefined)
    return () => ctrl.abort()
  }, [key, models.length])

  if (!loaded && userId) return null

  const modelOptions = (
    models.length ? models : key ? [{ id: key.model, label: key.model }] : []
  ).map((m) => ({
    value: m.id,
    label: m.label === m.id ? m.id : `${m.label} (${m.id})`,
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-neo border-2 border-line bg-surface-muted p-3">
        <span className="flex size-10 items-center justify-center rounded-neo border-2 border-line bg-ch-sky text-ink">
          <KeyRound size={20} aria-hidden />
        </span>
        <span className="font-bold">{t('settings.gemini')}</span>
        <Badge tone="brand">{t('settings.recommended')}</Badge>
        <span className="text-sm text-ink-muted">{t('settings.moreProviders')}</span>
      </div>

      {key && !editing && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
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
            <span className="font-mono text-sm text-ink-muted" dir="ltr">
              {key.apiKey.slice(0, 4)}…{key.apiKey.slice(-4)}
            </span>
          </div>
          <SelectField
            label={t('settings.model')}
            value={key.model}
            onChange={(e) => void setModel(e.target.value)}
            options={modelOptions}
            className="max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('settings.replace')}
            </Button>
            <Button
              variant="ghost"
              icon={<Trash size={17} aria-hidden />}
              onClick={async () => {
                await remove()
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
          {error && <Alert tone="danger">{t(error)}</Alert>}
          <PasswordField
            label={t('settings.keyLabel')}
            placeholder={t('settings.keyPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            hint={
              <a
                href={AI_STUDIO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-ink underline underline-offset-4"
              >
                {t('settings.getKey')} <ExternalLink size={14} aria-hidden />
              </a>
            }
          />
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
            <Button type="submit" loading={testing} disabled={!draft.trim()}>
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
    </div>
  )
}
