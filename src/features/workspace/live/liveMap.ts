import * as Y from 'yjs'
import { fromBase64, isEmptyUpdate, toBase64 } from './codec'
import type { DocCache } from './docCache'
import {
  BOOK_DOC,
  LOCAL,
  REMOTE,
  SEED,
  changedIds,
  isEmptyDoc,
  readDoc,
  seedDoc,
  type DocKey,
  type DocRows,
} from './mapDoc'
import type {
  ChannelFactory,
  ChannelStatus,
  DocStore,
  LiveChannel,
  LiveMessage,
  LoadedDoc,
} from './transport'

/** Changes read from the device copy: already known here, nothing to send. */
const CACHE = 'mynota:cache'

/** How long changes are gathered before they are sent / saved (keeps within Realtime limits). */
export const SEND_DELAY_MS = 150
export const SAVE_DELAY_MS = 800
const RETRY_DELAY_MS = 5000
const CACHE_DELAY_MS = 1000
/** A chapter that got its first content elsewhere is loaded after its author has saved it. */
const FOLLOW_DELAY_MS = 1500
/** Larger changes are saved first and announced with `pull` (Realtime payload limit 256 KB). */
const MAX_MESSAGE_CHARS = 180_000
/** Saved changes after which an editor merges them into one state. */
const COMPACT_AFTER = 100
const COMPACT_EVERY_MS = 60_000

export interface LiveChange {
  key: DocKey
  nodes: Set<string>
  relations: Set<string>
  origin: unknown
}

export interface LiveHooks {
  onChange(change: LiveChange): void
  onStatus?(status: ChannelStatus): void
  /** Unsaved changes (true) or everything saved (false); `failed` after a save error. */
  onSaving?(pending: boolean, failed: boolean): void
}

export interface LiveDeps {
  store: DocStore
  cache?: DocCache
  channel?: ChannelFactory
  /** Whether this device follows a document it has not loaded (default: every document). */
  follows?: (key: DocKey) => boolean
}

/**
 * A map's live documents on this device: loads them (device copy + server), turns an old map
 * into documents, sends this device's changes to the others, applies theirs, and saves every
 * change on the server. Only owner and editors send or save; viewers just follow along.
 */
export class LiveMap {
  readonly docs = new Map<DocKey, Y.Doc>()
  status: ChannelStatus = 'connecting'
  private channel: LiveChannel | null = null
  private closed = false
  private needsResync = false

  private outbox = new Map<DocKey, Uint8Array[]>()
  private sendTimer: ReturnType<typeof setTimeout> | null = null
  private unsaved = new Map<DocKey, Uint8Array[]>()
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private saving: Promise<void> | null = null
  private saveFailed = false
  private pullAfterSave = new Set<DocKey>()
  private waiters: Array<{ resolve: () => void; reject: (e: unknown) => void }> = []

  private cacheTimers = new Map<DocKey, ReturnType<typeof setTimeout>>()
  private savedCount = new Map<DocKey, number>()
  private lastCompact = new Map<DocKey, number>()
  private compacting = new Set<DocKey>()
  /** Changes for documents being loaded; applied once they are. */
  private waiting = new Map<DocKey, Uint8Array[]>()

  constructor(
    readonly mapId: string,
    readonly userId: string,
    private canEdit: boolean,
    private deps: LiveDeps,
    private hooks: LiveHooks,
  ) {}

  // -------------------------------------------------------------------------
  // Opening
  // -------------------------------------------------------------------------

  /**
   * Loads the documents for `keys` (device copy first, then the server). A document the server
   * has never seen is made from `rows` (the saved map), so existing maps convert on first open.
   * Without the server, the device copy is used and saving waits until it is back.
   * Throws when the server cannot be reached and a document has no device copy.
   */
  async load(keys: DocKey[], rows: Map<DocKey, DocRows> | null): Promise<void> {
    const wanted = [...new Set(keys)].filter((k) => !this.docs.has(k))
    if (!wanted.length || this.closed) return
    const cached = this.deps.cache
      ? await this.deps.cache.load(this.userId, this.mapId)
      : new Map<string, Uint8Array>()
    let server: LoadedDoc[] | null = null
    let serverError: unknown = null
    try {
      server = await this.deps.store.load(this.mapId, wanted)
    } catch (e) {
      serverError = e
    }
    if (this.closed) return
    if (!server && wanted.some((k) => !cached.has(k))) throw serverError
    if (!server) this.needsResync = true

    for (const key of wanted) {
      if (this.docs.has(key)) continue
      const doc = new Y.Doc()
      const local = cached.get(key)
      if (local) safeApply(doc, local, CACHE)
      const saved = server?.find((d) => d.key === key)
      const serverDoc = new Y.Doc()
      if (saved) {
        for (const u of [saved.state, ...saved.updates]) if (u) safeApply(serverDoc, u, REMOTE)
        this.savedCount.set(key, saved.updates.length)
      }
      safeApply(doc, Y.encodeStateAsUpdate(serverDoc), REMOTE)
      for (const u of this.waiting.get(key) ?? []) safeApply(doc, u, REMOTE)
      this.waiting.delete(key)
      this.attach(key, doc)
      if (server && !saved && isEmptyDoc(doc)) {
        // Never saved on the server: convert the saved rows (an old map, or a new chapter).
        const bucket = rows?.get(key)
        if (bucket && (bucket.nodes.length || bucket.relations.length)) seedDoc(doc, bucket)
      } else if (server) {
        this.saveMissing(key, doc, serverDoc)
      }
      serverDoc.destroy()
      this.hooks.onChange({ key, ...allIds(doc), origin: 'load' })
    }
    if (!this.channel && this.deps.channel && !this.closed) {
      this.channel = this.deps.channel(
        this.mapId,
        (m) => this.receive(m),
        (s) => this.setStatus(s),
      )
    }
  }

  /** The document for `key`, created empty when it does not exist yet (a new chapter). */
  doc(key: DocKey): Y.Doc {
    let doc = this.docs.get(key)
    if (!doc) {
      doc = new Y.Doc()
      this.attach(key, doc)
    }
    return doc
  }

  /** Makes a change on this device (sent and saved; LOCAL changes are also undoable). */
  write(key: DocKey, fn: (doc: Y.Doc) => void, origin: unknown = LOCAL): void {
    const doc = this.doc(key)
    doc.transact(() => fn(doc), origin)
  }

  /** Everything in the loaded documents. */
  rows(): DocRows {
    const out: DocRows = { nodes: [], relations: [] }
    for (const doc of this.docs.values()) {
      const r = readDoc(doc, this.mapId)
      out.nodes.push(...r.nodes)
      out.relations.push(...r.relations)
    }
    return out
  }

  setCanEdit(canEdit: boolean): void {
    this.canEdit = canEdit
  }

  /** Catches up with the server (after being offline): loads its changes, saves ours. */
  async resync(): Promise<void> {
    if (this.closed || !this.docs.size) return
    let saved: LoadedDoc[]
    try {
      saved = await this.deps.store.load(this.mapId, [...this.docs.keys()])
    } catch {
      this.needsResync = true
      return
    }
    if (this.closed) return
    this.needsResync = false
    for (const [key, doc] of this.docs) {
      const d = saved.find((s) => s.key === key)
      const serverDoc = new Y.Doc()
      for (const u of d ? [d.state, ...d.updates] : []) if (u) safeApply(serverDoc, u, REMOTE)
      safeApply(doc, Y.encodeStateAsUpdate(serverDoc), REMOTE)
      this.saveMissing(key, doc, serverDoc)
      serverDoc.destroy()
    }
    if (this.unsaved.size) void this.saveNow()
  }

  close(): void {
    if (this.closed) return
    // Anything not saved yet still goes out; the device copy keeps it in any case.
    if (this.unsaved.size) void this.saveNow()
    for (const [key, doc] of this.docs)
      void this.deps.cache?.save(this.userId, this.mapId, key, Y.encodeStateAsUpdate(doc))
    this.closed = true
    this.channel?.close()
    this.channel = null
    for (const t of [this.sendTimer, ...this.cacheTimers.values()]) if (t) clearTimeout(t)
    for (const doc of this.docs.values()) doc.destroy()
    this.docs.clear()
  }

  // -------------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------------

  hasUnsaved(): boolean {
    return this.unsaved.size > 0 || this.saving !== null
  }

  /** Resolves when every change made so far is saved; rejects when saving fails. */
  whenSaved(): Promise<void> {
    if (!this.hasUnsaved()) return Promise.resolve()
    if (this.saveFailed && !this.saving) return Promise.reject(new Error('not saved'))
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  /** Saves now (for example when the connection comes back). */
  saveNow(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    return this.save()
  }

  /** Queues what `doc` has and the server (`serverDoc`) does not. */
  private saveMissing(key: DocKey, doc: Y.Doc, serverDoc: Y.Doc) {
    if (!this.canEdit) return
    const missing = Y.encodeStateAsUpdate(doc, Y.encodeStateVector(serverDoc))
    if (!isEmptyUpdate(missing)) this.queue(key, missing)
  }

  private queue(key: DocKey, update: Uint8Array, sendToo = false) {
    if (!this.canEdit || this.closed) return
    const list = this.unsaved.get(key) ?? []
    list.push(update)
    this.unsaved.set(key, list)
    this.hooks.onSaving?.(true, this.saveFailed)
    if (!this.saveTimer)
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null
        void this.save()
      }, SAVE_DELAY_MS)
    if (sendToo) {
      const out = this.outbox.get(key) ?? []
      out.push(update)
      this.outbox.set(key, out)
      if (!this.sendTimer)
        this.sendTimer = setTimeout(() => {
          this.sendTimer = null
          this.flushOutbox()
        }, SEND_DELAY_MS)
    }
  }

  private async save(): Promise<void> {
    if (this.saving) {
      await this.saving.catch(() => undefined)
      if (this.unsaved.size && !this.saveTimer) return this.save()
      return
    }
    if (!this.unsaved.size) return
    this.saving = (async () => {
      let failed = false
      for (const [key, list] of [...this.unsaved]) {
        const n = list.length
        try {
          await this.deps.store.push(this.mapId, key, Y.mergeUpdates(list))
          const rest = (this.unsaved.get(key) ?? []).slice(n)
          if (rest.length) this.unsaved.set(key, rest)
          else this.unsaved.delete(key)
          this.savedCount.set(key, (this.savedCount.get(key) ?? 0) + 1)
          if (this.pullAfterSave.delete(key)) this.channel?.send({ t: 'pull', k: key })
          this.maybeCompact(key)
        } catch {
          failed = true
        }
      }
      this.saveFailed = failed
      if (failed && !this.saveTimer && !this.closed)
        this.saveTimer = setTimeout(() => {
          this.saveTimer = null
          void this.save()
        }, RETRY_DELAY_MS)
    })()
    try {
      await this.saving
    } finally {
      this.saving = null
    }
    const done = !this.unsaved.size
    if (!this.closed) this.hooks.onSaving?.(!done, this.saveFailed)
    if (done) {
      this.waiters.forEach((w) => w.resolve())
      this.waiters = []
    } else if (this.saveFailed) {
      this.waiters.forEach((w) => w.reject(new Error('not saved')))
      this.waiters = []
    } else if (!this.saveTimer) {
      await this.save()
    }
  }

  /** Merges saved changes into one state now and then, so documents load quickly. */
  private maybeCompact(key: DocKey) {
    if (!this.canEdit || this.closed || this.compacting.has(key)) return
    if ((this.savedCount.get(key) ?? 0) < COMPACT_AFTER) return
    if (Date.now() - (this.lastCompact.get(key) ?? 0) < COMPACT_EVERY_MS) return
    this.compacting.add(key)
    this.lastCompact.set(key, Date.now())
    void (async () => {
      try {
        // Load everything saved so far first: the merge may only drop changes it includes.
        const [saved] = await this.deps.store.load(this.mapId, [key])
        const doc = this.docs.get(key)
        if (!saved || !doc || this.closed) return
        for (const u of [saved.state, ...saved.updates]) if (u) safeApply(doc, u, REMOTE)
        await this.deps.store.compact(this.mapId, key, Y.encodeStateAsUpdate(doc), saved.upto)
        this.savedCount.set(key, 0)
      } catch {
        /* try again later */
      } finally {
        this.compacting.delete(key)
      }
    })()
  }

  // -------------------------------------------------------------------------
  // Sending and receiving
  // -------------------------------------------------------------------------

  private flushOutbox() {
    for (const [key, list] of this.outbox) {
      const data = toBase64(Y.mergeUpdates(list))
      if (data.length > MAX_MESSAGE_CHARS) this.pullAfterSave.add(key)
      else this.channel?.send({ t: 'u', k: key, d: data })
    }
    this.outbox.clear()
  }

  private receive(m: LiveMessage) {
    if (this.closed) return
    switch (m.t) {
      case 'u':
        return this.applyTo(m.k, m.d)
      case 'pull':
        if (this.docs.has(m.k)) void this.reloadKeys([m.k])
        else this.follow(m.k)
        return
      case 'diff':
        for (const [k, d] of Object.entries(m.v)) this.applyTo(k, d)
        return
      case 'sv': {
        if (!this.canEdit) return
        const diffs: Record<string, string> = {}
        let size = 0
        for (const [k, sv] of Object.entries(m.v)) {
          const doc = this.docs.get(k)
          if (!doc) continue
          let diff: Uint8Array
          try {
            diff = Y.encodeStateAsUpdate(doc, fromBase64(sv))
          } catch {
            continue
          }
          if (isEmptyUpdate(diff)) continue
          const d = toBase64(diff)
          if (size + d.length > MAX_MESSAGE_CHARS) continue // they load it from the server
          diffs[k] = d
          size += d.length
        }
        if (size) this.channel?.send({ t: 'diff', v: diffs })
        if (!m.back) this.channel?.send({ t: 'sv', v: this.stateVectors(), back: true })
        return
      }
    }
  }

  private applyTo(key: DocKey, data: string) {
    let update: Uint8Array
    try {
      update = fromBase64(data)
    } catch {
      return
    }
    const doc = this.docs.get(key)
    if (doc) return safeApply(doc, update, REMOTE)
    // Not loaded here: a chapter that got its first content elsewhere, or one not in view.
    const list = this.waiting.get(key)
    if (list) list.push(update)
    else if (this.follow(key)) this.waiting.get(key)?.push(update)
  }

  /** Loads a document this device does not have yet, once its author has saved it. */
  private follow(key: DocKey): boolean {
    if (!isDocKey(key) || this.waiting.has(key) || !this.docs.has(BOOK_DOC)) return false
    if (this.deps.follows && !this.deps.follows(key)) return false
    this.waiting.set(key, [])
    setTimeout(() => {
      if (this.closed) return
      this.load([key], null).catch(() => {
        // Could not load: drop what we kept, the next resync brings it.
        this.waiting.delete(key)
      })
    }, FOLLOW_DELAY_MS)
    return true
  }

  private async reloadKeys(keys: DocKey[]) {
    try {
      const saved = await this.deps.store.load(this.mapId, keys)
      for (const d of saved) {
        const doc = this.docs.get(d.key)
        if (doc) for (const u of [d.state, ...d.updates]) if (u) safeApply(doc, u, REMOTE)
      }
    } catch {
      /* offline: the next resync catches up */
    }
  }

  private stateVectors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, doc] of this.docs) out[key] = toBase64(Y.encodeStateVector(doc))
    return out
  }

  private everJoined = false

  private setStatus(s: ChannelStatus) {
    if (this.closed) return
    const rejoined = s === 'live' && this.everJoined
    if (s === 'live') this.everJoined = true
    this.status = s
    this.hooks.onStatus?.(s)
    if (s !== 'live') return
    if (rejoined || this.needsResync) void this.resync()
    else if (this.unsaved.size) void this.saveNow()
    // Catch up with whoever is here (both ways); viewers cannot send on this channel.
    if (this.canEdit && this.docs.size) this.channel?.send({ t: 'sv', v: this.stateVectors() })
  }

  // -------------------------------------------------------------------------

  private attach(key: DocKey, doc: Y.Doc) {
    this.docs.set(key, doc)
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (this.closed) return
      if (origin !== REMOTE && origin !== CACHE) this.queue(key, update, true)
      this.scheduleCache(key)
    })
    doc.on('afterTransaction', (tr: Y.Transaction) => {
      if (this.closed || tr.origin === CACHE) return
      const changed = changedIds(tr)
      if (changed.nodes.size || changed.relations.size)
        this.hooks.onChange({ key, ...changed, origin: tr.origin })
    })
  }

  private scheduleCache(key: DocKey) {
    if (!this.deps.cache || this.cacheTimers.has(key)) return
    this.cacheTimers.set(
      key,
      setTimeout(() => {
        this.cacheTimers.delete(key)
        const doc = this.docs.get(key)
        if (doc && !this.closed)
          void this.deps.cache?.save(this.userId, this.mapId, key, Y.encodeStateAsUpdate(doc))
      }, CACHE_DELAY_MS),
    )
  }
}

export { LOCAL, SEED, REMOTE }

function safeApply(doc: Y.Doc, update: Uint8Array, origin: unknown) {
  try {
    Y.applyUpdate(doc, update, origin)
  } catch {
    /* a broken update from another device is ignored */
  }
}

function allIds(doc: Y.Doc) {
  const nodes = new Set<string>()
  const relations = new Set<string>()
  for (const name of doc.share.keys()) {
    if (name.startsWith('n:')) nodes.add(name.slice(2))
    else if (name.startsWith('r:')) relations.add(name.slice(2))
  }
  return { nodes, relations }
}

const isDocKey = (k: string) =>
  k === BOOK_DOC || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k)
