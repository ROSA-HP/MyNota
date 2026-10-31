import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Spinner } from '@/components/ui'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './authStore'

/**
 * Landing page for email confirmation and Google sign-in links. supabase-js exchanges the
 * ?code= for a session on load (detectSessionInUrl); we only wait for the result.
 */
export function AuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const status = useAuth((s) => s.status)

  const urlError = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    return params.get('error') ?? hash.get('error')
  }, [])

  useEffect(() => {
    if (!urlError && status === 'signedIn') navigate('/home', { replace: true })
  }, [status, urlError, navigate])

  const failed = Boolean(urlError) || status === 'signedOut'

  return (
    <AuthLayout title={failed ? t('auth.callback.failed') : t('auth.callback.working')}>
      {failed ? (
        <div className="flex flex-col gap-4">
          <Link to="/sign-in" className="font-bold underline underline-offset-4">
            {t('auth.callback.back')}
          </Link>
        </div>
      ) : (
        <div className="flex justify-center py-6">
          <Spinner size={28} />
        </div>
      )}
    </AuthLayout>
  )
}
