import { supabase } from '@/lib/supabase'
import { scrubMessage, scrubRoute, scrubStack, shortBrowser } from './scrub'

/**
 * Sends scrubbed error reports to MyNota's own table (Phase 7.6; read in Admin › Errors).
 * Everything is scrubbed here, before it leaves the browser (./scrub.ts). At most 10 reports per
 * page load, and the same message only once.
 */

type Kind = 'error' | 'rejection' | 'render'

const MAX_PER_PAGE = 10
const sent = new Set<string>()

export interface ErrorReport {
  kind: Kind
  message: string
  stack: string
  route: string
  version: string
  browser: string
}

/** The report that would be sent for an error (also used by tests). */
export function buildReport(
  kind: Kind,
  error: unknown,
  pathname: string,
  ua: string,
): ErrorReport | null {
  const e = error instanceof Error ? error : null
  const raw = e ? `${e.name}: ${e.message}` : typeof error === 'string' ? error : 'Unknown error'
  const message = scrubMessage(raw)
  if (!message) return null
  return {
    kind,
    message,
    stack: scrubStack(e?.stack),
    route: scrubRoute(pathname),
    version: String(import.meta.env.VITE_APP_VERSION ?? 'dev'),
    browser: shortBrowser(ua),
  }
}

export function reportError(kind: Kind, error: unknown): void {
  if (sent.size >= MAX_PER_PAGE || typeof window === 'undefined') return
  const r = buildReport(kind, error, window.location.pathname, navigator.userAgent)
  if (!r || sent.has(r.message)) return
  sent.add(r.message)
  // Not in development: errors there are seen in the console.
  if (import.meta.env.DEV) return
  void supabase
    .rpc('report_client_error', {
      p_kind: r.kind,
      p_message: r.message,
      p_stack: r.stack,
      p_route: r.route,
      p_version: r.version,
      p_browser: r.browser,
    })
    .then(
      () => undefined,
      () => undefined,
    )
}

let installed = false

/** Reports uncaught errors and rejected promises. Call once at start-up. */
export function installErrorReporting(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => {
    // Resource loading errors (images, scripts) have no error object: not app errors.
    if (e.error) reportError('error', e.error)
  })
  window.addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason))
}
