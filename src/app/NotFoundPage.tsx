import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Logo, Panel, buttonClasses } from '@/components/ui'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <main
      id="main"
      className="paper-dots flex min-h-dvh flex-col items-center justify-center gap-6 px-4"
    >
      <Logo />
      <Panel shadow="lg" className="max-w-md p-8 text-center">
        <p className="font-mono text-5xl font-bold">404</p>
        <h1 className="mt-3 text-2xl font-bold">{t('notFound.title')}</h1>
        <p className="mt-2 text-ink-muted">{t('notFound.body')}</p>
        <Link to="/" className={buttonClasses({ className: 'mt-6' })}>
          {t('notFound.home')}
        </Link>
      </Panel>
    </main>
  )
}
