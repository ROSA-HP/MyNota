import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { authRedirect, supabase } from '@/lib/supabase'
import { authErrorKey } from './errors'

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"
      />
    </svg>
  )
}

export function GoogleButton({ onError }: { onError: (key: string) => void }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  return (
    <Button
      variant="secondary"
      fullWidth
      loading={loading}
      icon={<GoogleMark />}
      onClick={async () => {
        setLoading(true)
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: authRedirect('/auth/callback') },
        })
        // On success the browser navigates away to Google.
        if (error) {
          setLoading(false)
          onError(authErrorKey(error))
        }
      }}
    >
      {t('auth.google')}
    </Button>
  )
}

export function OrDivider() {
  const { t } = useTranslation()
  return (
    <div
      className="my-5 flex items-center gap-3 text-sm font-semibold text-ink-muted"
      role="separator"
    >
      <span className="h-0.5 flex-1 bg-line-soft" />
      {t('common.or')}
      <span className="h-0.5 flex-1 bg-line-soft" />
    </div>
  )
}
