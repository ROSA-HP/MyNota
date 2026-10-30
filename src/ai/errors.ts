/**
 * Every AI failure becomes an AiError with a `kind` the UI can translate. Messages are
 * scrubbed: they never contain the API key or the student's source text.
 */
export type AiErrorKind =
  | 'no_key'
  | 'invalid_key'
  | 'rate_limited'
  | 'overloaded'
  | 'blocked'
  | 'truncated'
  | 'invalid_output'
  | 'too_long'
  | 'network'
  /** A custom endpoint that can't be reached from the browser (CORS, wrong URL, server down). */
  | 'unreachable'
  | 'aborted'
  | 'bad_request'
  | 'unknown'

export class AiError extends Error {
  readonly kind: AiErrorKind
  /** For rate limits: how long the provider asked us to wait. */
  readonly retryAfterMs?: number
  readonly status?: number

  constructor(
    kind: AiErrorKind,
    message: string,
    opts: { retryAfterMs?: number; status?: number } = {},
  ) {
    super(scrubSecrets(message))
    this.name = 'AiError'
    this.kind = kind
    this.retryAfterMs = opts.retryAfterMs
    this.status = opts.status
  }

  get retryable(): boolean {
    return this.kind === 'rate_limited' || this.kind === 'overloaded' || this.kind === 'network'
  }
}

const KEY_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{20,}/g, // Google
  /sk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic
  /sk-[A-Za-z0-9_-]{16,}/g, // OpenAI-style
]

/** "api_key: …", "x-goog-api-key=…", "Bearer …": keep the label, hide the value. */
const LABELLED_KEY =
  /(api[_-]?key|x-goog-api-key|authorization|bearer)(["'\s:=]+)[A-Za-z0-9._-]{12,}/gi

const knownSecrets = new Set<string>()

/** Registers the active key so it is removed from any text, whatever its format. */
export function registerSecret(secret: string): void {
  if (secret.length >= 8) knownSecrets.add(secret)
}

export function forgetSecret(secret: string): void {
  knownSecrets.delete(secret)
}

export function scrubSecrets(text: string): string {
  let out = text
  for (const s of knownSecrets) out = out.split(s).join('[key]')
  for (const p of KEY_PATTERNS) out = out.replace(p, '[key]')
  return out.replace(LABELLED_KEY, '$1$2[key]')
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}
