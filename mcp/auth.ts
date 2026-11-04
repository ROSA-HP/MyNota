import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sessionFile, supabaseConfig } from './config'

/**
 * The sign-in lives in one small file on this computer. supabase-js keeps it fresh: a two-factor
 * session stays two-factor when its token renews. The password itself is never stored, and
 * never passes through the AI: only `npm run mcp:login`, in the admin's own terminal, sees it.
 */
function readAll(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(sessionFile(), 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

function writeAll(data: Record<string, string>): void {
  const path = sessionFile()
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, JSON.stringify(data), { mode: 0o600 })
  chmodSync(path, 0o600)
}

const fileStorage = {
  getItem: (key: string): string | null => readAll()[key] ?? null,
  setItem: (key: string, value: string): void => writeAll({ ...readAll(), [key]: value }),
  removeItem: (key: string): void =>
    writeAll(Object.fromEntries(Object.entries(readAll()).filter(([k]) => k !== key))),
}

export function makeClient(flowType: 'implicit' | 'pkce' = 'implicit'): SupabaseClient {
  const { url, key } = supabaseConfig()
  return createClient(url, key, {
    auth: {
      storage: fileStorage,
      persistSession: true,
      // The server sits idle between requests; the token renews when it is next needed.
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType,
    },
  })
}

export function forgetSession(): void {
  if (existsSync(sessionFile())) rmSync(sessionFile())
}

export interface Identity {
  signedIn: boolean
  email: string | null
  /** An active admin with a two-factor session, as answered by the database. */
  admin: boolean
}

/** Who this is. Only the database decides whether they are an admin. */
export async function identify(db: SupabaseClient): Promise<Identity> {
  const { data } = await db.auth.getSession()
  if (!data.session) return { signedIn: false, email: null, admin: false }
  const { data: ok, error } = await db.rpc('admin_ok')
  if (error) throw new Error(`Could not check the admin role: ${error.message}`)
  return { signedIn: true, email: data.session.user.email ?? null, admin: ok === true }
}
