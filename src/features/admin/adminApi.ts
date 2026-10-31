import { supabase } from '@/lib/supabase'

/**
 * The admin area's calls (Phase 7.3). Each is a database function that checks, in the database,
 * for an active admin with a two-factor session, and writes the audit log; hiding pages in the
 * app is never the protection.
 */

export type UserStatus = 'active' | 'suspended' | 'banned'

export interface Overview {
  users: number
  active_7d: number
  studying_7d: number
  suspended: number
  maps: number
  maps_7d: number
  blocks: number
  reviews_7d: number
  public_links: number
  open_reports: number
  source_bytes: number
  signups: Array<{ day: string; count: number }>
}

export interface AdminUser {
  id: string
  username: string
  name: string
  email: string | null
  role: 'student' | 'admin'
  status: UserStatus
  two_factor_enabled: boolean
  flagged: boolean
  created_at: string
  last_login: string | null
  map_count: number
}

export interface UserDetail {
  profile: {
    id: string
    username: string
    name: string
    role: string
    status: UserStatus
    two_factor_enabled: boolean
    created_at: string
    email: string | null
    flag: { reason: string; at: string } | null
  }
  maps: Array<{
    id: string
    title: string
    type: string
    link_access: string
    created_at: string
    updated_at: string
  }>
  logins: Array<{
    at: string
    success: boolean
    method: string
    device: string
    country: string | null
  }>
  shares: Array<{ map_id: string | null; action: string; at: string }>
  reports_made: number
  reports_against: number
}

export interface AdminMap {
  id: string
  title: string
  type: string
  owner_id: string
  owner_username: string
  blocks: number
  members: number
  pending_invites: number
  link_access: 'off' | 'view' | 'edit'
  link_expires_at: string | null
  open_reports: number
  created_at: string
  updated_at: string
}

export interface MapContent {
  map: { id: string; title: string; type: string; owner_id: string; link_access: string }
  nodes: Array<{
    id: string
    parent_id: string | null
    level: string
    sort_order: number
    title: string
    summary: string
    type: string | null
  }>
  relations: Array<{ from_node: string; to_node: string; type: string; label: string }>
}

export interface AdminReport {
  id: string
  map_id: string
  map_title: string
  owner_id: string
  owner_username: string
  reporter_username: string
  reason: string
  details: string
  status: 'open' | 'resolved'
  outcome: string | null
  handled_by_username: string | null
  created_at: string
  resolved_at: string | null
}

export interface LoginEvent {
  id: number
  user_id: string | null
  username: string | null
  at: string
  success: boolean
  method: string
  device: string
  country: string | null
  flagged: boolean
}

export interface AiJobStat {
  provider: string
  model: string
  prompt_version: string
  pass: string
  total: number
  done: number
  failed: number
  avg_ms: number | null
  tokens_in: number
  tokens_out: number
}

export interface AuditEntry {
  id: number
  at: string
  actor_id: string | null
  actor_username: string | null
  action: string
  target_type: string
  target_id: string | null
  reason: string
  details: Record<string, unknown>
}

export interface ClientErrorGroup {
  message: string
  kind: string
  count: number
  people: number
  first_at: string
  last_at: string
  route: string
  stack: string
  browser: string
  app_version: string
}

export interface Setting {
  key: string
  value: number | boolean
  updated_at: string
}

/** Postgres bigint counts arrive as strings; numbers are easier to show and sort. */
function numbers<T>(rows: unknown[], keys: string[]): T[] {
  return rows.map((r) => {
    const o = { ...(r as Record<string, unknown>) }
    for (const k of keys) if (o[k] !== null && o[k] !== undefined) o[k] = Number(o[k])
    return o as T
  })
}

/** Error raised by an admin call; `code` is the Postgres code (42501, MN400, MN404). */
export class AdminError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
}

// The admin functions are not in the generated Database type on purpose: their names and
// arguments are only typed here, next to their only callers.
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const rpc = supabase.rpc as unknown as (
    f: string,
    a: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>
  const { data, error } = await rpc(fn, args)
  if (error) throw new AdminError(error.message, error.code)
  return data as T
}

export const adminApi = {
  overview: () => call<Overview>('admin_overview'),

  users: async (query: string, status: UserStatus | null, offset = 0) =>
    numbers<AdminUser>(
      await call<unknown[]>('admin_users', {
        p_query: query,
        p_status: status,
        p_limit: 50,
        p_offset: offset,
      }),
      ['map_count'],
    ),

  user: (id: string) => call<UserDetail>('admin_user_detail', { p_user: id }),

  setStatus: (id: string, status: UserStatus, reason: string) =>
    call<null>('admin_set_user_status', { p_user: id, p_status: status, p_reason: reason }),

  flag: (id: string, reason: string, flag = true) =>
    call<null>('admin_flag_user', { p_user: id, p_reason: reason, p_flag: flag }),

  maps: async (query: string, sharedOnly: boolean, offset = 0) =>
    numbers<AdminMap>(
      await call<unknown[]>('admin_maps', {
        p_query: query,
        p_shared_only: sharedOnly,
        p_limit: 50,
        p_offset: offset,
      }),
      ['blocks', 'members', 'pending_invites', 'open_reports'],
    ),

  mapContent: (id: string, reason: string) =>
    call<MapContent>('admin_map_content', { p_map: id, p_reason: reason }),

  takedown: (id: string, reason: string) =>
    call<null>('admin_link_takedown', { p_map: id, p_reason: reason }),

  reports: (status: 'open' | 'resolved' | null) =>
    call<AdminReport[]>('admin_reports', { p_status: status, p_limit: 200 }),

  resolve: (id: string, action: 'none' | 'takedown' | 'suspend', outcome: string) =>
    call<null>('admin_report_resolve', { p_report: id, p_action: action, p_outcome: outcome }),

  logins: async (failedOnly: boolean, before: number | null = null) =>
    numbers<LoginEvent>(
      await call<unknown[]>('admin_login_events', {
        p_user: null,
        p_failed_only: failedOnly,
        p_limit: 100,
        p_before: before,
      }),
      ['id'],
    ),

  aiJobs: async (days: number) =>
    numbers<AiJobStat>(await call<unknown[]>('admin_ai_jobs', { p_days: days }), [
      'total',
      'done',
      'failed',
      'tokens_in',
      'tokens_out',
    ]),

  audit: async (before: number | null = null) =>
    numbers<AuditEntry>(await call<unknown[]>('admin_audit', { p_limit: 100, p_before: before }), [
      'id',
    ]),

  errors: async (days: number) =>
    numbers<ClientErrorGroup>(await call<unknown[]>('admin_client_errors', { p_days: days }), [
      'count',
      'people',
    ]),

  settings: async (): Promise<Setting[]> => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value, updated_at')
      .order('key')
    if (error) throw new AdminError(error.message, error.code)
    return data
  },

  setSetting: (key: string, value: number | boolean, reason: string) =>
    call<null>('admin_setting_set', { p_key: key, p_value: value, p_reason: reason }),
}
