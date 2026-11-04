import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The project folder. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Drafts: on this computer only, ignored by git, next to the project (never in Supabase). */
export const dataDir = (): string => process.env.MYNOTA_MCP_DATA ?? join(ROOT, 'mcp', '.data')

/** The admin's sign-in. In the home folder, so it can never end up in the repository. */
export const sessionFile = (): string =>
  process.env.MYNOTA_MCP_SESSION ?? join(homedir(), '.mynota-mcp', 'session.json')

/** The app's address, for the link to a published map. Optional. */
export const appUrl = (): string | null => process.env.MYNOTA_APP_URL?.replace(/\/+$/, '') ?? null

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m?.[1]) out[m[1]] = (m[2] ?? '').replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

/**
 * A key that skips row level security must never be used here: it would turn the admin check in
 * the database off. Supabase's new secret keys are recognisable by name, the old ones by the
 * role inside the token.
 */
export function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: unknown
    }
    return claims.role === 'service_role'
  } catch {
    return false
  }
}

/** The project's public address and key: the same public values the web app uses. */
export function supabaseConfig(): { url: string; key: string } {
  const file = { ...readEnvFile(join(ROOT, '.env')), ...readEnvFile(join(ROOT, '.env.local')) }
  const url =
    process.env.MYNOTA_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? file.VITE_SUPABASE_URL
  const key =
    process.env.MYNOTA_SUPABASE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    file.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase is not set up: put VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.',
    )
  }
  if (isSecretKey(key)) {
    throw new Error(
      'This is a Supabase secret key. Use the public (publishable) key: a secret key skips every permission check.',
    )
  }
  return { url, key }
}
