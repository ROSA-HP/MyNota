import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Spinner } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { MfaChallengePage } from '@/features/auth/MfaChallengePage'

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper text-ink">
      <Spinner size={28} />
    </div>
  )
}

/**
 * Signed-in only. Sends visitors to sign-in and brings them back afterwards. Accounts with
 * two-factor sign-in see the code step first (Phase 7.2).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status)
  const mfaNeeded = useAuth((s) => s.mfaNeeded)
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedOut') {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />
  }
  if (mfaNeeded) return <MfaChallengePage />
  return children
}

/** Signed-out only (landing, sign-in, sign-up). */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status)
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedIn') return <Navigate to="/home" replace />
  return children
}
