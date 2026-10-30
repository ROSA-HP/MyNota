import { useState, type FormEvent, type ReactNode } from 'react'
import type { ParseKeys } from 'i18next'
import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Panel, SelectField, TextField, toast } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import {
  fieldErrors,
  nameSchema,
  normalizeUsernameInput,
  usernameSchema,
} from '@/features/auth/schemas'
import { UsernameStatus } from '@/features/auth/UsernameStatus'
import { useUsernameAvailability } from '@/features/auth/useUsernameAvailability'
import { LANGUAGE_NAMES } from '@/lib/i18n'
import { LANGUAGES, LanguageSchema } from '@/lib/preferences'
import { PROFILE_COLUMNS, supabase } from '@/lib/supabase'
import { z } from 'zod'
import { usePreferences } from './preferencesStore'
import { ThemeToggle } from './ThemeToggle'

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      <div className="mt-5">{children}</div>
    </Panel>
  )
}

const profileSchema = z.object({ name: nameSchema, username: usernameSchema })

function ProfileForm() {
  const { t } = useTranslation()
  const profile = useAuth((s) => s.profile)
  const setProfile = useAuth((s) => s.setProfile)
  const [name, setName] = useState(profile?.name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<ParseKeys | null>(null)
  const [saving, setSaving] = useState(false)
  const availability = useUsernameAvailability(username, profile?.username)

  if (!profile) return null
  const dirty = name !== profile.name || username !== profile.username

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setFormError(null)
    const parsed = profileSchema.safeParse({ name, username })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    if (availability === 'taken') return
    setErrors({})
    setSaving(true)
    const { data, error } = await supabase
      .from('profiles')
      .update(parsed.data)
      .eq('id', profile.id)
      .select(PROFILE_COLUMNS)
      .single()
    setSaving(false)
    if (error || !data) {
      if (error?.code === '23505') setErrors({ username: 'auth.errors.usernameTaken' })
      else setFormError('common.errorGeneric')
      return
    }
    setProfile(data)
    toast(t('common.saved'), 'success')
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="danger">{t(formError)}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label={t('auth.signUp.name')}
          autoComplete="name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name ? t(errors.name as ParseKeys) : null}
        />
        <TextField
          label={t('auth.signUp.username')}
          autoCapitalize="none"
          spellCheck={false}
          ltr
          value={username}
          onChange={(e) => setUsername(normalizeUsernameInput(e.target.value))}
          hint={t('auth.signUp.usernameHint')}
          error={
            errors.username
              ? t(errors.username as ParseKeys)
              : availability === 'taken'
                ? t('auth.errors.usernameTaken')
                : null
          }
          status={<UsernameStatus state={availability} />}
        />
      </div>
      <div>
        <Button
          type="submit"
          loading={saving}
          disabled={!dirty || availability === 'taken' || availability === 'checking'}
        >
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const session = useAuth((s) => s.session)
  const signOut = useAuth((s) => s.signOut)
  const { language, setLanguage } = usePreferences()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8">
      <h1 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h1>

      <Section title={t('settings.profile')} hint={t('settings.profileHint')}>
        <ProfileForm />
      </Section>

      <Section title={t('settings.appearance')} hint={t('settings.appearanceHint')}>
        <div className="grid gap-5 md:grid-cols-2">
          <SelectField
            label={t('common.language')}
            value={language}
            onChange={(e) => {
              const parsed = LanguageSchema.safeParse(e.target.value)
              if (parsed.success) setLanguage(parsed.data)
            }}
            options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l], lang: l }))}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t('common.theme')}</span>
            <ThemeToggle showLabels className="self-start" />
          </div>
        </div>
      </Section>

      <Section title={t('settings.account')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-ink-muted">
            {t('settings.signedInAs', { email: '⁨' + (session?.user.email ?? '') + '⁩' })}
          </p>
          <Button
            variant="secondary"
            icon={<LogOut size={18} aria-hidden className="rtl:-scale-x-100" />}
            onClick={() => void signOut()}
          >
            {t('common.signOut')}
          </Button>
        </div>
      </Section>
    </div>
  )
}
