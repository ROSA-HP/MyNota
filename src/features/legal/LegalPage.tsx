import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Logo, Panel } from '@/components/ui'
import { LanguageSelect } from '@/features/settings/LanguageSelect'
import { ThemeToggle } from '@/features/settings/ThemeToggle'

/**
 * Contact for privacy and legal questions, shown on both pages. Set before launch
 * (docs/launch.md); until then the pages say the details are coming.
 */
export const LEGAL_CONTACT = ''
export const LEGAL_UPDATED = '2026-11-01'

const PRIVACY = [
  'who',
  'collect',
  'keys',
  'files',
  'ai',
  'admins',
  'sharing',
  'device',
  'logins',
  'keep',
  'rights',
] as const
const TERMS = [
  'use',
  'account',
  'content',
  'rules',
  'ai',
  'keys',
  'moderation',
  'service',
  'changes',
] as const

/** Privacy policy and terms (Phase 7.5): public pages, in the three app languages. */
export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { t, i18n } = useTranslation()
  const sections = kind === 'privacy' ? PRIVACY : TERMS
  const updated = new Date(LEGAL_UPDATED).toLocaleDateString(i18n.language, { dateStyle: 'long' })
  return (
    <div className="paper-dots flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link to="/" className="rounded-neo">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <LanguageSelect />
        </div>
      </header>
      <main id="main" className="flex justify-center px-4 pb-16">
        <Panel shadow="lg" className="w-full max-w-3xl p-6 sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight">{t(`legal.${kind}.title`)}</h1>
          <p className="mt-2 text-sm text-ink-muted">{t('legal.updated', { date: updated })}</p>
          <p className="mt-6">{t(`legal.${kind}.intro`)}</p>
          {sections.map((s) => (
            <section key={s} className="mt-6">
              <h2 className="text-lg font-bold">
                {t(`legal.${kind}.sections.${s}.title` as 'legal.privacy.sections.who.title')}
              </h2>
              <p className="mt-1.5 leading-relaxed text-ink-muted">
                {t(`legal.${kind}.sections.${s}.body` as 'legal.privacy.sections.who.body')}
              </p>
            </section>
          ))}
          <section className="mt-6">
            <h2 className="text-lg font-bold">{t('legal.contactTitle')}</h2>
            <p className="mt-1.5 text-ink-muted" dir="auto">
              {LEGAL_CONTACT || t('legal.contactSoon')}
            </p>
          </section>
          <p className="mt-8 text-sm">
            <Link
              to={kind === 'privacy' ? '/terms' : '/privacy'}
              className="font-semibold underline"
            >
              {t(kind === 'privacy' ? 'legal.terms.title' : 'legal.privacy.title')}
            </Link>
          </p>
        </Panel>
      </main>
    </div>
  )
}
