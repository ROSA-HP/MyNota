import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Logo, Panel } from '@/components/ui'
import { LanguageSelect } from '@/features/settings/LanguageSelect'
import { ThemeToggle } from '@/features/settings/ThemeToggle'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useTranslation()
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
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0"
      >
        <div className="w-full max-w-[26rem]">
          <Panel shadow="lg" className="p-6 sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-ink-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </Panel>
          {footer && <div className="mt-5 text-center text-sm text-ink-muted">{footer}</div>}
          <p className="mt-4 text-center text-xs text-ink-muted">
            <Link to="/terms" className="underline underline-offset-2 hover:text-ink">
              {t('legal.terms.title')}
            </Link>{' '}
            ·{' '}
            <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">
              {t('legal.privacy.title')}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
