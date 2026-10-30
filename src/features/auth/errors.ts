import { AuthError, isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js'
import type { ParseKeys } from 'i18next'

/** Maps Supabase auth errors to translation keys. Never shows raw server messages. */
export function authErrorKey(error: unknown): ParseKeys {
  if (isAuthRetryableFetchError(error)) return 'auth.errors.network'
  if (error instanceof TypeError) return 'auth.errors.network' // fetch failed
  if (!(error instanceof AuthError)) return 'common.errorGeneric'

  switch (error.code) {
    case 'invalid_credentials':
      return 'auth.errors.invalidCredentials'
    case 'email_not_confirmed':
      return 'auth.errors.emailNotConfirmed'
    case 'user_already_exists':
    case 'email_exists':
      return 'auth.errors.emailTaken'
    case 'weak_password':
      return 'auth.errors.passwordWeak'
    case 'email_address_invalid':
      return 'auth.errors.emailInvalid'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return 'auth.errors.rateLimited'
    case 'unexpected_failure':
      // The profile trigger rejects a username taken between the availability check and submit.
      if (isAuthApiError(error) && /database error saving new user/i.test(error.message)) {
        return 'auth.errors.usernameTaken'
      }
      return 'common.errorGeneric'
    default:
      return error.status === 429 ? 'auth.errors.rateLimited' : 'common.errorGeneric'
  }
}
