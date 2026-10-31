import type { ParseKeys } from 'i18next'

/** The message for a map that could not be created: a limit (Phase 7.4) or anything else. */
export function createErrorKey(e: unknown): ParseKeys {
  const code = (e as { code?: unknown } | null)?.code
  return code === 'MN429' ? 'newMap.errLimit' : 'newMap.errCreate'
}
