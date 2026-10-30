import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { env } from './env'

export const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Explicit column lists: `select *` on maps would fail because link_token is not readable. */
export const PROFILE_COLUMNS =
  'id, username, name, avatar_url, role, status, two_factor_enabled, ui_language, theme, created_at, updated_at'
export const MAP_COLUMNS =
  'id, owner_id, subject_id, type, title, cover_color, languages, link_access, link_expires_at, created_at, updated_at'
export const SUBJECT_COLUMNS = 'id, owner_id, name, color, sort_order, created_at, updated_at'

export const authRedirect = (path: string): string =>
  new URL(path, window.location.origin).toString()
