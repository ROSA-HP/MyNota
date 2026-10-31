/**
 * Scrubbing for error reports (Phase 7.6, docs/security.md › "Error tracking must scrub keys and
 * map content"). Runs in the browser before anything is sent, so the server never receives:
 * - AI keys or tokens (Gemini `AIza…`, `sk-…`, `sk-ant-…`, bearer tokens, JWTs, long secrets)
 * - map content: any quoted text in messages (model output and validation errors quote it),
 *   and everything in stack frames except file names and line numbers
 * - email addresses, query strings and fragments of URLs, ids in routes
 */

const MAX_MESSAGE = 300
const MAX_STACK = 2000
const MAX_FRAMES = 15

const SECRETS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{20,}/g, // Google API keys
  /sk-ant-[0-9A-Za-z_-]{10,}/g, // Anthropic
  /sk-[0-9A-Za-z_-]{16,}/g, // OpenAI-style
  /\bBearer\s+[^\s"'`]+/gi,
  /\beyJ[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+/g, // JWT
  /\b(?:api[_-]?key|key|token|secret|password|authorization)\s*[:=]\s*[^\s,;&"'`]+/gi,
  /\b[0-9A-Za-z_-]{40,}\b/g, // any other long opaque string
]

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// Quoted text of any kind, including the typographic quotes used in de/ar.
const QUOTED = /"[^"]*"|'[^']*'|`[^`]*`|“[^”]*”|„[^“”]*[“”]|«[^»]*»|‘[^’]*’/g

/** A URL without query string or fragment (they can carry tokens). */
function bareUrls(text: string): string {
  return text.replace(/\b(https?:\/\/[^\s?#)"'`]+)[?#][^\s)"'`]*/g, '$1')
}

function scrubSecrets(text: string): string {
  let out = text
  for (const re of SECRETS) out = out.replace(re, '[secret]')
  return out.replace(EMAIL, '[email]')
}

export function scrubMessage(message: string): string {
  const cleaned = scrubSecrets(bareUrls(message))
    .replace(QUOTED, '[text]')
    .replace(UUID, ':id')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > MAX_MESSAGE ? cleaned.slice(0, MAX_MESSAGE - 1) + '…' : cleaned
}

/**
 * Keeps only the location of each frame ("at fn (file:line:col)" / "fn@file:line:col"), with
 * the file reduced to its path on our own origin; anything else in the stack is dropped.
 */
export function scrubStack(stack: string | undefined): string {
  if (!stack) return ''
  const frames: string[] = []
  for (const line of stack.split('\n')) {
    const m =
      /(?:at\s+([\w$.<>[\] ]{0,80}?)\s*\(?|^([\w$.<>[\]]{0,80})@)(\S+?):(\d+):(\d+)\)?\s*$/.exec(
        line.trim(),
      )
    if (!m) continue
    const fn = (m[1] ?? m[2] ?? '').trim() || '?'
    let file = m[3] ?? ''
    try {
      file = new URL(file).pathname
    } catch {
      /* already a path */
    }
    file = file.replace(UUID, ':id')
    frames.push(`${scrubSecrets(fn)} ${file}:${m[4]}:${m[5]}`)
    if (frames.length >= MAX_FRAMES) break
  }
  const out = frames.join('\n')
  return out.length > MAX_STACK ? out.slice(0, MAX_STACK) : out
}

/** The route without ids or share tokens: `/maps/:id`, `/s/:token`. */
export function scrubRoute(pathname: string): string {
  return pathname
    .replace(/^\/s\/[^/]+/, '/s/:token')
    .replace(UUID, ':id')
    .replace(/[?#].*$/, '')
    .slice(0, 200)
}

/** "Firefox 140 on Windows" style, nothing more identifying. */
export function shortBrowser(ua: string): string {
  const m =
    /(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/.exec(ua) ??
    (/Safari\//.test(ua) ? ['', 'Safari', ''] : null)
  const name = m
    ? ({ Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[m[1] ?? ''] ?? m[1])
    : 'Browser'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux|CrOS/.test(ua)
            ? 'Linux'
            : ''
  return [name, m?.[2], os && `on ${os}`].filter(Boolean).join(' ').slice(0, 60)
}
