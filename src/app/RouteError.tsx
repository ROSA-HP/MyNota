import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Button, Logo, Panel } from '@/components/ui'
import { reportError } from '@/lib/errors/report'
import { NotFoundPage } from './NotFoundPage'

/**
 * Shown when a page crashes while drawing (instead of a blank screen). The error is reported,
 * scrubbed, to Admin › Errors (Phase 7.6); the student can reload and carry on.
 */
export function RouteError() {
  const { t } = useTranslation()
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  useEffect(() => {
    if (!notFound) reportError('render', error)
  }, [error, notFound])

  if (notFound) return <NotFoundPage />
  return (
    <main
      id="main"
      className="paper-dots flex min-h-dvh flex-col items-center justify-center gap-6 px-4"
    >
      <Logo />
      <Panel shadow="lg" className="max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">{t('crash.title')}</h1>
        <p className="mt-2 text-ink-muted">{t('crash.body')}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>{t('crash.reload')}</Button>
          <a href="/home" className="self-center text-sm font-semibold underline">
            {t('notFound.home')}
          </a>
        </div>
      </Panel>
    </main>
  )
}
