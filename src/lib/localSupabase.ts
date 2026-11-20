import type { AuthChangeEvent, RealtimeChannel, Session, SupabaseClient, User } from '@supabase/supabase-js'
import { sampleMap } from '@/features/dev/sampleMap'
import type {
  AiJobRow,
  AppSettingRow,
  CardProgressRow,
  CardRow,
  Database,
  DeckStatsRow,
  LoginEventRow,
  MapMemberRow,
  MapPersonRow,
  MapRole,
  MapRow,
  MapStatsRow,
  NodeRow,
  ProfileRow,
  RelationRow,
  ReviewLogRow,
  SearchResultRow,
  ShareSettingsRow,
  SourceRow,
  StudyLimits,
  SubjectRow,
} from './database.types'

type ProfileRecord = ProfileRow & StudyLimits

interface LocalDocRecord {
  doc_key: string
  map_id: string
  state: string | null
  updates: string[]
  upto: number
}

interface LocalAccount {
  id: string
  email: string
  password: string
}

interface LocalStore {
  sessionUserId: string | null
  accounts: LocalAccount[]
  profiles: ProfileRecord[]
  subjects: SubjectRow[]
  maps: MapRow[]
  nodes: NodeRow[]
  relations: RelationRow[]
  sources: SourceRow[]
  cards: CardRow[]
  card_progress: CardProgressRow[]
  review_logs: ReviewLogRow[]
  ai_jobs: AiJobRow[]
  map_members: MapMemberRow[]
  login_events: LoginEventRow[]
  app_settings: AppSettingRow[]
  docs: LocalDocRecord[]
}

const STORAGE_KEY = 'mynota.local.db.v1'

function emptyStore(): LocalStore {
  return {
    sessionUserId: null,
    accounts: [],
    profiles: [],
    subjects: [],
    maps: [],
    nodes: [],
    relations: [],
    sources: [],
    cards: [],
    card_progress: [],
    review_logs: [],
    ai_jobs: [],
    map_members: [],
    login_events: [],
    app_settings: [],
    docs: [],
  }
}

let memoryFallback: LocalStore | null = null

function loadStore(): LocalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return { ...emptyStore(), ...(JSON.parse(raw) as Partial<LocalStore>) }
    }
  } catch {
    /* storage unavailable */
  }
  if (!memoryFallback) memoryFallback = emptyStore()
  return memoryFallback
}

function saveStore(store: LocalStore): void {
  memoryFallback = store
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* storage unavailable */
  }
}

function seedStarterContent(store: LocalStore, userId: string): void {
  if (store.maps.some((m) => m.owner_id === userId)) return
  const now = new Date().toISOString()
  const subjectId = crypto.randomUUID()
  store.subjects.push({
    id: subjectId,
    owner_id: userId,
    name: 'Physics',
    color: 'sky',
    sort_order: 0,
    created_at: now,
    updated_at: now,
  })
  const sample = sampleMap()
  const mapId = crypto.randomUUID()
  const idMap = new Map<string, string>()
  for (const n of sample.nodes) idMap.set(n.id, crypto.randomUUID())

  store.maps.push({
    ...sample.map,
    id: mapId,
    owner_id: userId,
    subject_id: subjectId,
    created_at: now,
    updated_at: now,
  })
  for (const n of sample.nodes) {
    store.nodes.push({
      ...n,
      id: idMap.get(n.id) ?? crypto.randomUUID(),
      map_id: mapId,
      parent_id: n.parent_id ? (idMap.get(n.parent_id) ?? null) : null,
      created_by: userId,
      created_at: now,
      updated_at: now,
    })
  }
  for (const r of sample.relations) {
    store.relations.push({
      ...r,
      id: crypto.randomUUID(),
      map_id: mapId,
      from_node: idMap.get(r.from_node) ?? r.from_node,
      to_node: idMap.get(r.to_node) ?? r.to_node,
      created_by: userId,
      created_at: now,
      updated_at: now,
    })
  }
}

function buildSession(account: LocalAccount, profile?: ProfileRecord): Session {
  const nowSec = Math.floor(Date.now() / 1000)
  const user: User = {
    id: account.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: account.email,
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {
      name: profile?.name ?? 'Student',
      username: profile?.username ?? 'student',
    },
    identities: [],
    created_at: profile?.created_at ?? new Date().toISOString(),
    updated_at: profile?.updated_at ?? new Date().toISOString(),
  }
  return {
    access_token: `local-token-${account.id}`,
    refresh_token: `local-refresh-${account.id}`,
    expires_in: 86400,
    expires_at: nowSec + 86400,
    token_type: 'bearer',
    user,
  }
}

type QueryError = { message: string; code?: string }
type QueryResult<T> = { data: T; error: QueryError | null }

class LocalQueryBuilder<Row extends Record<string, unknown>> {
  private filters: Array<(row: Row) => boolean> = []
  private orderBy: { col: string; ascending: boolean } | null = null
  private rangeSlice: [number, number] | null = null
  private maxRows: number | null = null
  private mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null
  private returnMode: 'many' | 'single' | 'maybeSingle' = 'many'
  private wantsReturn = false

  constructor(
    private table: keyof LocalStore & string,
    private getCurrentUserId: () => string | null,
  ) {}

  select(columns?: string) {
    void columns
    this.wantsReturn = true
    return this
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.mode = 'insert'
    this.payload = values
    return this
  }

  update(values: Record<string, unknown>) {
    this.mode = 'update'
    this.payload = values
    return this
  }

  upsert(values: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) {
    void opts
    this.mode = 'upsert'
    this.payload = values
    return this
  }

  delete() {
    this.mode = 'delete'
    return this
  }

  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val)
    return this
  }

  in(col: string, vals: unknown[]) {
    const set = new Set(vals)
    this.filters.push((r) => set.has(r[col]))
    return this
  }

  gte(col: string, val: unknown) {
    this.filters.push((r) => String(r[col] ?? '') >= String(val ?? ''))
    return this
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending ?? true }
    return this
  }

  range(from: number, to: number) {
    this.rangeSlice = [from, to]
    return this
  }

  limit(n: number) {
    this.maxRows = n
    return this
  }

  single() {
    this.returnMode = 'single'
    return this
  }

  maybeSingle() {
    this.returnMode = 'maybeSingle'
    return this
  }

  private execute(): QueryResult<unknown> {
    const store = loadStore()
    const rows = store[this.table] as unknown as Row[]
    const uid = this.getCurrentUserId()
    const now = new Date().toISOString()

    if (this.mode === 'select') {
      let matched = rows.filter((r) => this.filters.every((fn) => fn(r)))
      if (this.orderBy) {
        const { col, ascending } = this.orderBy
        matched = [...matched].sort((a, b) => {
          const av = a[col]
          const bv = b[col]
          if (av === bv) return 0
          if (av === null || av === undefined) return 1
          if (bv === null || bv === undefined) return -1
          const cmp = av < bv ? -1 : 1
          return ascending ? cmp : -cmp
        })
      }
      if (this.rangeSlice) {
        matched = matched.slice(this.rangeSlice[0], this.rangeSlice[1] + 1)
      }
      if (this.maxRows !== null) {
        matched = matched.slice(0, this.maxRows)
      }
      if (this.returnMode === 'single') {
        if (!matched.length) return { data: null, error: { message: 'Not found', code: 'PGRST116' } }
        return { data: matched[0], error: null }
      }
      if (this.returnMode === 'maybeSingle') {
        return { data: matched[0] ?? null, error: null }
      }
      return { data: matched, error: null }
    }

    if (this.mode === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]
      const inserted: Row[] = list.map((item) => {
        const defaults: Record<string, unknown> = {
          id: item.id ?? crypto.randomUUID(),
          created_at: item.created_at ?? now,
          updated_at: item.updated_at ?? now,
        }
        if (this.table === 'subjects' || this.table === 'maps') {
          defaults.owner_id = item.owner_id ?? uid ?? ''
        }
        if (this.table === 'maps') {
          defaults.link_access = item.link_access ?? 'off'
          defaults.link_expires_at = item.link_expires_at ?? null
          defaults.cover_color = item.cover_color ?? 'yellow'
          defaults.languages = item.languages ?? []
        }
        if (this.table === 'nodes' || this.table === 'relations' || this.table === 'sources' || this.table === 'cards' || this.table === 'ai_jobs') {
          defaults.created_by = item.created_by ?? uid
        }
        if (this.table === 'card_progress' || this.table === 'review_logs') {
          defaults.user_id = item.user_id ?? uid ?? ''
        }
        return { ...defaults, ...item } as Row
      })
      rows.push(...inserted)
      saveStore(store)
      if (!this.wantsReturn) return { data: null, error: null }
      if (this.returnMode === 'single') return { data: inserted[0] ?? null, error: null }
      if (this.returnMode === 'maybeSingle') return { data: inserted[0] ?? null, error: null }
      return { data: inserted, error: null }
    }

    if (this.mode === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]
      const out: Row[] = []
      for (const item of list) {
        const idx = rows.findIndex((r) => {
          if (this.table === 'card_progress') {
            return r.card_id === item.card_id && r.user_id === (item.user_id ?? uid)
          }
          return item.id !== undefined && r.id === item.id
        })
        if (idx >= 0) {
          const updated = { ...rows[idx], ...item, updated_at: now } as unknown as Row
          rows[idx] = updated
          out.push(updated)
        } else {
          const created = {
            id: item.id ?? crypto.randomUUID(),
            created_at: now,
            updated_at: now,
            ...(this.table === 'card_progress' ? { user_id: item.user_id ?? uid ?? '' } : {}),
            ...item,
          } as unknown as Row
          rows.push(created)
          out.push(created)
        }
      }
      saveStore(store)
      if (!this.wantsReturn) return { data: null, error: null }
      return { data: this.returnMode === 'many' ? out : (out[0] ?? null), error: null }
    }

    if (this.mode === 'update') {
      const patch = (this.payload ?? {}) as Record<string, unknown>
      const updatedRows: Row[] = []
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        if (r && this.filters.every((fn) => fn(r))) {
          const next = { ...r, ...patch, updated_at: now } as Row
          rows[i] = next
          updatedRows.push(next)
        }
      }
      saveStore(store)
      if (!this.wantsReturn) return { data: null, error: null }
      if (this.returnMode === 'single') {
        if (!updatedRows.length) return { data: null, error: { message: 'Not found', code: 'PGRST116' } }
        return { data: updatedRows[0], error: null }
      }
      if (this.returnMode === 'maybeSingle') return { data: updatedRows[0] ?? null, error: null }
      return { data: updatedRows, error: null }
    }

    if (this.mode === 'delete') {
      const kept: Row[] = []
      const deleted: Row[] = []
      for (const r of rows) {
        if (this.filters.every((fn) => fn(r))) deleted.push(r)
        else kept.push(r)
      }
      ;(store[this.table] as unknown as Row[]) = kept
      if (this.table === 'maps' && deleted.length > 0) {
        const deletedIds = new Set(deleted.map((r) => String(r.id)))
        store.nodes = store.nodes.filter((n) => !deletedIds.has(n.map_id))
        store.relations = store.relations.filter((r) => !deletedIds.has(r.map_id))
        store.sources = store.sources.filter((s) => !deletedIds.has(s.map_id))
        store.cards = store.cards.filter((c) => !deletedIds.has(c.map_id))
        store.card_progress = store.card_progress.filter((p) => !deletedIds.has(p.map_id))
        store.review_logs = store.review_logs.filter((l) => !deletedIds.has(l.map_id))
        store.ai_jobs = store.ai_jobs.filter((j) => !deletedIds.has(j.map_id))
        store.map_members = store.map_members.filter((m) => !deletedIds.has(m.map_id))
        store.docs = store.docs.filter((d) => !deletedIds.has(d.map_id))
      } else if (this.table === 'subjects' && deleted.length > 0) {
        const deletedIds = new Set(deleted.map((r) => String(r.id)))
        store.maps = store.maps.map((m) =>
          m.subject_id && deletedIds.has(m.subject_id) ? { ...m, subject_id: null } : m,
        )
      }
      saveStore(store)
      if (!this.wantsReturn) return { data: null, error: null }
      return { data: deleted, error: null }
    }

    return { data: null, error: null }
  }

  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }
}

export function createLocalSupabaseClient(): SupabaseClient<Database> {
  const listeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>()

  const currentSession = (): Session | null => {
    const store = loadStore()
    if (!store.sessionUserId) return null
    const account = store.accounts.find((a) => a.id === store.sessionUserId)
    if (!account) return null
    const profile = store.profiles.find((p) => p.id === account.id)
    return buildSession(account, profile)
  }

  const notify = (event: AuthChangeEvent, session: Session | null) => {
    for (const cb of listeners) {
      try {
        cb(event, session)
      } catch {
        /* ignore subscriber error */
      }
    }
  }

  const auth = {
    async getSession() {
      return { data: { session: currentSession() }, error: null }
    },
    onAuthStateChange(cb: (event: AuthChangeEvent, session: Session | null) => void) {
      listeners.add(cb)
      return {
        data: {
          subscription: {
            id: 'local-sub',
            callback: cb,
            unsubscribe: () => {
              listeners.delete(cb)
            },
          },
        },
      }
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const store = loadStore()
      const normalized = email.trim().toLowerCase()
      let account = store.accounts.find((a) => a.email.toLowerCase() === normalized)
      if (account && account.password !== password) {
        return {
          data: { user: null, session: null },
          error: { message: 'Invalid login credentials', status: 400 },
        }
      }
      if (!account) {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const rawUser = normalized.split('@')[0] ?? 'student'
        const username = rawUser.replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'student'
        account = { id, email: normalized, password }
        store.accounts.push(account)
        store.profiles.push({
          id,
          username,
          name: username.charAt(0).toUpperCase() + username.slice(1),
          avatar_url: null,
          role: 'student',
          status: 'active',
          two_factor_enabled: false,
          ui_language: 'en',
          theme: 'system',
          daily_new_limit: 10,
          daily_review_limit: 100,
          created_at: now,
          updated_at: now,
        })
        seedStarterContent(store, id)
      }
      store.sessionUserId = account.id
      store.login_events.push({
        id: store.login_events.length + 1,
        user_id: account.id,
        at: new Date().toISOString(),
        success: true,
        method: 'password',
        device: 'Browser (Local)',
        country: null,
        ip_hash: null,
      })
      saveStore(store)
      const profile = store.profiles.find((p) => p.id === account.id)
      const session = buildSession(account, profile)
      notify('SIGNED_IN', session)
      return { data: { user: session.user, session }, error: null }
    },
    async signUp({
      email,
      password,
      options,
    }: {
      email: string
      password: string
      options?: { data?: Record<string, unknown> }
    }) {
      const store = loadStore()
      const normalized = email.trim().toLowerCase()
      if (store.accounts.some((a) => a.email.toLowerCase() === normalized)) {
        return {
          data: { user: null, session: null },
          error: { message: 'User already registered', status: 422 },
        }
      }
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const meta = options?.data ?? {}
      const account: LocalAccount = { id, email: normalized, password }
      const profile: ProfileRecord = {
        id,
        username: String(meta.username ?? 'student'),
        name: String(meta.name ?? 'Student'),
        avatar_url: null,
        role: 'student',
        status: 'active',
        two_factor_enabled: false,
        ui_language: (meta.ui_language as ProfileRow['ui_language']) ?? 'en',
        theme: (meta.theme as ProfileRow['theme']) ?? 'system',
        daily_new_limit: 10,
        daily_review_limit: 100,
        created_at: now,
        updated_at: now,
      }
      store.accounts.push(account)
      store.profiles.push(profile)
      seedStarterContent(store, id)
      store.sessionUserId = id
      saveStore(store)
      const session = buildSession(account, profile)
      notify('SIGNED_IN', session)
      return { data: { user: session.user, session }, error: null }
    },
    async signOut() {
      const store = loadStore()
      store.sessionUserId = null
      saveStore(store)
      notify('SIGNED_OUT', null)
      return { error: null }
    },
    async signInWithOAuth() {
      return {
        data: { provider: 'google', url: null },
        error: { message: 'OAuth is unavailable in local mode; use email sign-in.', status: 400 },
      }
    },
    async resetPasswordForEmail() {
      return { data: {}, error: null }
    },
    async updateUser() {
      return { data: { user: currentSession()?.user ?? null }, error: null }
    },
    async resend() {
      return { data: {}, error: null }
    },
    async refreshSession() {
      return { data: { session: currentSession(), user: currentSession()?.user ?? null }, error: null }
    },
    mfa: {
      async getAuthenticatorAssuranceLevel() {
        return { data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] }, error: null }
      },
      async listFactors() {
        return { data: { all: [], totp: [], phone: [] }, error: null }
      },
      async enroll() {
        return { data: null, error: { message: 'MFA is disabled in local mode' } }
      },
      async challengeAndVerify() {
        return { data: null, error: { message: 'MFA is disabled in local mode' } }
      },
      async unenroll() {
        return { data: null, error: null }
      },
    },
  }

  const rpc = async (fn: string, args: Record<string, unknown> = {}): Promise<QueryResult<unknown>> => {
    const store = loadStore()
    const uid = store.sessionUserId
    const now = new Date().toISOString()

    switch (fn) {
      case 'username_available': {
        const candidate = String(args.candidate ?? '').toLowerCase()
        const taken = store.profiles.some((p) => p.username.toLowerCase() === candidate)
        return { data: !taken, error: null }
      }
      case 'map_role': {
        const mapId = String(args.target_map ?? '')
        const map = store.maps.find((m) => m.id === mapId)
        if (!map) return { data: null, error: null }
        if (map.owner_id === uid) return { data: 'owner' satisfies MapRole, error: null }
        const member = store.map_members.find((m) => m.map_id === mapId && m.user_id === uid)
        return { data: member?.role ?? null, error: null }
      }
      case 'is_admin': {
        const profile = store.profiles.find((p) => p.id === uid)
        return { data: profile?.role === 'admin', error: null }
      }
      case 'is_active_user':
        return { data: Boolean(uid), error: null }
      case 'map_stats': {
        const ids = (args.map_ids as string[] | undefined) ?? []
        const stats: MapStatsRow[] = ids.map((mapId) => {
          const nodes = store.nodes.filter((n) => n.map_id === mapId)
          const chapters = nodes.filter((n) => n.level === 'chapter')
          const built = chapters.filter((c) => nodes.some((n) => n.parent_id === c.id)).length
          return {
            map_id: mapId,
            blocks: nodes.filter((n) => n.level === 'block').length,
            chapters: chapters.length,
            chapters_built: built,
            chapter_colors: chapters.map((c) => c.color ?? 'yellow'),
          }
        })
        return { data: stats, error: null }
      }
      case 'deck_stats': {
        const filterIds = (args.map_ids as string[] | null | undefined) ?? null
        const targetMaps = filterIds ? store.maps.filter((m) => filterIds.includes(m.id)) : store.maps
        const rows: DeckStatsRow[] = targetMaps.map((m) => {
          const cards = store.cards.filter((c) => c.map_id === m.id && !c.suspended)
          let fresh = 0
          let due = 0
          let learning = 0
          let mastered = 0
          for (const c of cards) {
            const p = store.card_progress.find((x) => x.card_id === c.id && x.user_id === uid)
            if (!p) fresh += 1
            else {
              if (p.due <= now) due += 1
              if (p.state === 1 || p.state === 3) learning += 1
              else if (p.state === 2 && p.stability >= 21) mastered += 1
            }
          }
          return { map_id: m.id, total: cards.length, new_cards: fresh, due, learning, mastered }
        })
        return { data: rows, error: null }
      }
      case 'study_activity': {
        const byDay = new Map<string, number>()
        for (const r of store.review_logs) {
          if (r.user_id !== uid) continue
          const day = r.reviewed_at.slice(0, 10)
          byDay.set(day, (byDay.get(day) ?? 0) + 1)
        }
        return {
          data: [...byDay.entries()].map(([day, reviews]) => ({ day, reviews })),
          error: null,
        }
      }
      case 'search_all': {
        const q = String(args.q ?? '').trim().toLowerCase()
        const max = Number(args.max_results ?? 60)
        if (!q) return { data: [], error: null }
        const results: SearchResultRow[] = []
        for (const m of store.maps) {
          if (m.title.toLowerCase().includes(q)) {
            results.push({
              kind: 'map',
              map_id: m.id,
              map_title: m.title,
              map_type: m.type,
              node_id: null,
              card_id: null,
              title: m.title,
              snippet: '',
              rank: 1,
            })
          }
          for (const n of store.nodes.filter((x) => x.map_id === m.id)) {
            if (n.title.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q)) {
              results.push({
                kind: 'node',
                map_id: m.id,
                map_title: m.title,
                map_type: m.type,
                node_id: n.id,
                card_id: null,
                title: n.title,
                snippet: n.summary,
                rank: 0.9,
              })
            }
          }
          for (const c of store.cards.filter((x) => x.map_id === m.id && !x.suspended)) {
            if (c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) {
              results.push({
                kind: 'card',
                map_id: m.id,
                map_title: m.title,
                map_type: m.type,
                node_id: c.node_id,
                card_id: c.id,
                title: c.front,
                snippet: c.back,
                rank: 0.8,
              })
            }
          }
        }
        return { data: results.slice(0, max), error: null }
      }
      case 'my_invites':
        return { data: [], error: null }
      case 'share_settings': {
        const row: ShareSettingsRow = { link_access: 'off', link_token: null, link_expires_at: null }
        return { data: [row], error: null }
      }
      case 'map_people': {
        const profile = store.profiles.find((p) => p.id === uid)
        if (!profile) return { data: [], error: null }
        const owner: MapPersonRow = {
          kind: 'owner',
          user_id: profile.id,
          username: profile.username,
          name: profile.name,
          avatar_url: profile.avatar_url,
          role: 'owner',
          invite_id: null,
          since: profile.created_at,
        }
        return { data: [owner], error: null }
      }
      case 'doc_load': {
        const mapId = String(args.p_map ?? '')
        const keys = (args.p_keys as string[] | undefined) ?? []
        const found = keys
          .map((k) => store.docs.find((d) => d.map_id === mapId && d.doc_key === k))
          .filter((d): d is LocalDocRecord => Boolean(d))
        return { data: found, error: null }
      }
      case 'doc_push': {
        const mapId = String(args.p_map ?? '')
        const key = String(args.p_key ?? '')
        const update = String(args.p_update ?? '')
        let doc = store.docs.find((d) => d.map_id === mapId && d.doc_key === key)
        if (!doc) {
          doc = { map_id: mapId, doc_key: key, state: null, updates: [], upto: 0 }
          store.docs.push(doc)
        }
        doc.updates.push(update)
        doc.upto += 1
        saveStore(store)
        return { data: doc.upto, error: null }
      }
      case 'doc_compact': {
        const mapId = String(args.p_map ?? '')
        const key = String(args.p_key ?? '')
        const state = String(args.p_state ?? '')
        const upto = Number(args.p_upto ?? 0)
        const doc = store.docs.find((d) => d.map_id === mapId && d.doc_key === key)
        if (doc) {
          doc.state = state
          doc.updates = []
          doc.upto = upto
          saveStore(store)
        }
        return { data: true, error: null }
      }
      case 'two_factor_sync':
        return { data: false, error: null }
      case 'report_client_error':
        return { data: null, error: null }
      default:
        return { data: null, error: null }
    }
  }

  const makeChannel = (): RealtimeChannel => {
    const ch = {
      on: () => ch,
      subscribe: (cb?: (status: string) => void) => {
        if (cb) setTimeout(() => cb('SUBSCRIBED'), 0)
        return ch
      },
      track: async () => 'ok' as const,
      send: async () => 'ok' as const,
      presenceState: () => ({}),
      unsubscribe: async () => 'ok' as const,
    }
    return ch as unknown as RealtimeChannel
  }

  const client = {
    auth,
    from: (table: keyof LocalStore & string) =>
      new LocalQueryBuilder(table, () => loadStore().sessionUserId),
    rpc,
    channel: () => makeChannel(),
    removeChannel: async () => 'ok',
    realtime: {
      setAuth: async () => undefined,
    },
    functions: {
      invoke: async () => ({ data: null, error: null }),
    },
  }

  return client as unknown as SupabaseClient<Database>
}
