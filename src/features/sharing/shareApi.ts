import type { ParseKeys } from 'i18next'

/** Error codes raised by the sharing functions (supabase/migrations/…_sharing.sql). */
const CODES: Record<string, ParseKeys> = {
  MN400: 'share.errors.invalid',
  MN403: 'share.errors.switchedOff',
  MN404: 'share.errors.notFound',
  MN409: 'share.errors.already',
  MN410: 'share.errors.linkOff',
  MN429: 'share.errors.tooMany',
  '42501': 'share.errors.notAllowed',
}

/** The message key for a failed sharing call (falls back to the generic error). */
export function shareError(error: { code?: string } | null | undefined): ParseKeys {
  return (error?.code && CODES[error.code]) || 'common.errorGeneric'
}

/** The address a share link opens. */
export const shareUrl = (token: string) => `${window.location.origin}/s/${token}`
