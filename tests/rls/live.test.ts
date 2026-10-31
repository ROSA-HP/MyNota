import { beforeAll, describe, expect, it } from 'vitest'
import {
  PERMISSION_DENIED,
  admin,
  asAnon,
  asUser,
  createUser,
  errorCode,
  resetData,
  type Db,
} from './helpers'

// Phase 6 · live documents (20261031190000_live_docs.sql): saved Yjs changes, merges, and who
// may join the map's Realtime channels.

let owner: string, editor: string, viewer: string, stranger: string, suspended: string
let mapId: string, otherMap: string
const CHAPTER = '0b6a3f6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

const b64 = (s: string) => Buffer.from(s).toString('base64')
const unb64 = (s: string) => Buffer.from(s, 'base64').toString()

/** Runs a statement that should fail without aborting the surrounding transaction. */
async function fails(db: Db, sql: string, params: unknown[] = []): Promise<string | null> {
  await db.query('savepoint expect_error')
  const c = await errorCode(db.query(sql, params))
  await db.query(c ? 'rollback to savepoint expect_error' : 'release savepoint expect_error')
  return c
}

const push = (db: Db, map: string, key: string, data: string) =>
  db.query<{ id: string }>('select public.doc_push($1, $2, $3) as id', [map, key, b64(data)])

async function joinCheck(user: string, topic: string) {
  return asUser(user, async (db) => {
    await db.query(`select set_config('realtime.topic', $1, true)`, [topic])
    const receive =
      Number(
        (
          await db.query('select count(*)::int as n from realtime.messages where topic = $1', [
            topic,
          ])
        ).rows[0].n,
      ) > 0
    const ins = (extension: string) =>
      fails(db, `insert into realtime.messages (topic, extension, event) values ($1, $2, 'x')`, [
        topic,
        extension,
      ]).then((c) => c === null)
    return { receive, broadcast: await ins('broadcast'), presence: await ins('presence') }
  })
}

beforeAll(async () => {
  await resetData()
  await admin('truncate realtime.messages')
  owner = await createUser('lv-owner@test.dev', { username: 'lv_owner' })
  editor = await createUser('lv-editor@test.dev', { username: 'lv_editor' })
  viewer = await createUser('lv-viewer@test.dev', { username: 'lv_viewer' })
  stranger = await createUser('lv-stranger@test.dev', { username: 'lv_stranger' })
  suspended = await createUser('lv-suspended@test.dev', { username: 'lv_suspended' })
  const mk = async (title: string) =>
    (
      await admin(
        `insert into public.maps (owner_id, type, title) values ($1, 'book', $2) returning id`,
        [owner, title],
      )
    ).rows[0].id as string
  mapId = await mk('Biology')
  otherMap = await mk('Chemistry')
  await admin(
    `insert into public.map_members (map_id, user_id, role, invited_by) values
       ($1, $2, 'editor', $5), ($1, $3, 'viewer', $5), ($1, $4, 'editor', $5)`,
    [mapId, editor, viewer, suspended, owner],
  )
  await admin(`update public.profiles set status = 'suspended' where id = $1`, [suspended])
  // Realtime only "sees" a topic through rows; one per topic makes receiving testable.
  await admin(
    `insert into realtime.messages (topic, extension) values ($1, 'broadcast'), ($2, 'broadcast'), ($3, 'broadcast'), ('map:not-a-map', 'broadcast')`,
    [`map:${mapId}`, `map:${mapId}:people`, `map:${otherMap}`],
  )
})

describe('saving changes', () => {
  it('owner and editors save changes; viewers, strangers, suspended users and visitors cannot', async () => {
    for (const who of [owner, editor]) {
      const id = await asUser(who, async (db) => (await push(db, mapId, 'book', 'u')).rows[0]?.id)
      expect(Number(id)).toBeGreaterThan(0)
    }
    for (const who of [viewer, stranger, suspended])
      expect(await asUser(who, (db) => errorCode(push(db, mapId, 'book', 'u')))).toBe(
        PERMISSION_DENIED,
      )
    expect(await asAnon((db) => errorCode(push(db, mapId, 'book', 'u')))).toBe(PERMISSION_DENIED)
  })

  it('checks the document name, the encoding, the size and who wrote it', async () => {
    await asUser(editor, async (db) => {
      expect(
        await fails(db, 'select public.doc_push($1, $2, $3)', [mapId, 'chapter-1', b64('u')]),
      ).toBe('23514')
      expect(await fails(db, 'select public.doc_push($1, $2, $3)', [mapId, CHAPTER, '%%%'])).toBe(
        'MN400',
      )
      expect(await fails(db, 'select public.doc_push($1, $2, $3)', [mapId, CHAPTER, ''])).toBe(
        '23514',
      )
      // created_by cannot be set by the client
      expect(
        await fails(
          db,
          `insert into public.map_doc_updates (map_id, doc_key, data, created_by) values ($1, 'book', 'x', $2)`,
          [mapId, owner],
        ),
      ).toBe(PERMISSION_DENIED)
      const row = await db.query(
        `insert into public.map_doc_updates (map_id, doc_key, data) values ($1, 'book', 'x') returning created_by`,
        [mapId],
      )
      expect(row.rows[0].created_by).toBe(editor)
      // saved changes are never edited or deleted directly
      expect(
        await fails(db, `update public.map_doc_updates set data = 'y' where map_id = $1`, [mapId]),
      ).toBe(PERMISSION_DENIED)
      expect(await fails(db, `delete from public.map_doc_updates where map_id = $1`, [mapId])).toBe(
        PERMISSION_DENIED,
      )
      expect(
        await fails(
          db,
          `insert into public.map_docs (map_id, doc_key, state) values ($1, 'book', 'x')`,
          [mapId],
        ),
      ).toBe(PERMISSION_DENIED)
    })
  })
})

describe('loading and merging', () => {
  beforeAll(async () => {
    await admin('delete from public.map_doc_updates')
    await admin('delete from public.map_docs')
    await asUser(owner, async (db) => {
      await push(db, mapId, CHAPTER, 'a')
      await push(db, mapId, CHAPTER, 'b')
      await push(db, mapId, 'book', 'B')
      await db.query('commit')
    })
  })

  it('everyone on the map loads saved changes in order; others get nothing', async () => {
    const rows = await asUser(viewer, (db) =>
      db.query('select * from public.doc_load($1, $2)', [mapId, [CHAPTER, 'book', 'missing']]),
    )
    const ch = rows.rows.find((r) => r.doc_key === CHAPTER)
    expect(rows.rows).toHaveLength(2)
    expect(ch.state).toBeNull()
    expect(ch.updates.map(unb64)).toEqual(['a', 'b'])
    expect(Number(ch.upto)).toBeGreaterThan(0)
    const none = await asUser(stranger, (db) =>
      db.query('select * from public.doc_load($1, $2)', [mapId, [CHAPTER, 'book']]),
    )
    expect(none.rows).toHaveLength(0)
    expect(
      await asAnon((db) =>
        errorCode(db.query('select * from public.doc_load($1, $2)', [mapId, ['book']])),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('an editor merges changes into one state; an older merge never overwrites a newer one', async () => {
    const before = await asUser(editor, (db) =>
      db.query('select * from public.doc_load($1, $2)', [mapId, [CHAPTER]]),
    )
    const upto = Number(before.rows[0].upto)
    await asUser(editor, async (db) => {
      await push(db, mapId, CHAPTER, 'c') // arrives after the merge started
      const ok = await db.query('select public.doc_compact($1, $2, $3, $4) as ok', [
        mapId,
        CHAPTER,
        b64('ab'),
        upto,
      ])
      expect(ok.rows[0].ok).toBe(true)
      const after = await db.query('select * from public.doc_load($1, $2)', [mapId, [CHAPTER]])
      expect(unb64(after.rows[0].state)).toBe('ab')
      expect(after.rows[0].updates.map(unb64)).toEqual(['c'])
      // a slower device finishing an older merge changes nothing
      const stale = await db.query('select public.doc_compact($1, $2, $3, $4) as ok', [
        mapId,
        CHAPTER,
        b64('a'),
        upto - 1,
      ])
      expect(stale.rows[0].ok).toBe(false)
      const again = await db.query('select * from public.doc_load($1, $2)', [mapId, [CHAPTER]])
      expect(unb64(again.rows[0].state)).toBe('ab')
    })
  })

  it('viewers, strangers and suspended users cannot merge; bad input is refused', async () => {
    for (const who of [viewer, stranger, suspended])
      expect(
        await asUser(who, (db) =>
          errorCode(
            db.query('select public.doc_compact($1, $2, $3, $4)', [mapId, CHAPTER, b64('x'), 999]),
          ),
        ),
      ).toBe(PERMISSION_DENIED)
    await asUser(owner, async (db) => {
      expect(
        await fails(db, 'select public.doc_compact($1, $2, $3, $4)', [mapId, CHAPTER, '%%', 9]),
      ).toBe('MN400')
      expect(
        await fails(db, 'select public.doc_compact($1, $2, $3, $4)', [mapId, CHAPTER, '', 9]),
      ).toBe('MN400')
      expect(
        await fails(db, 'select public.doc_compact($1, $2, $3, $4)', [
          mapId,
          CHAPTER,
          b64('x'),
          -1,
        ]),
      ).toBe('MN400')
      expect(
        await fails(db, 'select public.doc_compact($1, $2, $3, $4)', [mapId, 'nope', b64('x'), 9]),
      ).toBe('23514')
    })
  })

  it('deleting the map deletes its documents', async () => {
    const tmp = (
      await admin(
        `insert into public.maps (owner_id, type, title) values ($1, 'notes', 'Tmp') returning id`,
        [owner],
      )
    ).rows[0].id
    await asUser(owner, async (db) => {
      await push(db, tmp, 'book', 'x')
      await db.query('select public.doc_compact($1, $2, $3, $4)', [tmp, 'book', b64('x'), 1e9])
      await db.query('commit')
    })
    await admin('delete from public.maps where id = $1', [tmp])
    const left = await admin(
      'select (select count(*) from public.map_docs where map_id = $1) + (select count(*) from public.map_doc_updates where map_id = $1) as n',
      [tmp],
    )
    expect(Number(left.rows[0].n)).toBe(0)
  })
})

describe('Realtime channels', () => {
  it('document channel: everyone on the map receives, only owner and editors send', async () => {
    const t = `map:${mapId}`
    expect(await joinCheck(owner, t)).toEqual({ receive: true, broadcast: true, presence: false })
    expect(await joinCheck(editor, t)).toEqual({ receive: true, broadcast: true, presence: false })
    expect(await joinCheck(viewer, t)).toEqual({ receive: true, broadcast: false, presence: false })
    expect(await joinCheck(stranger, t)).toEqual({
      receive: false,
      broadcast: false,
      presence: false,
    })
    expect(await joinCheck(suspended, t)).toEqual({
      receive: false,
      broadcast: false,
      presence: false,
    })
  })

  it('people channel: everyone on the map shares presence and cursors, nobody else', async () => {
    const t = `map:${mapId}:people`
    for (const who of [owner, editor, viewer])
      expect(await joinCheck(who, t)).toEqual({ receive: true, broadcast: true, presence: true })
    for (const who of [stranger, suspended])
      expect(await joinCheck(who, t)).toEqual({ receive: false, broadcast: false, presence: false })
  })

  it('other maps and made-up topics are closed; visitors cannot use the channels', async () => {
    expect(await joinCheck(editor, `map:${otherMap}`)).toEqual({
      receive: false,
      broadcast: false,
      presence: false,
    })
    expect(await joinCheck(owner, 'map:not-a-map')).toEqual({
      receive: false,
      broadcast: false,
      presence: false,
    })
    const anon = await asAnon(async (db) => {
      await db.query(`select set_config('realtime.topic', $1, true)`, [`map:${mapId}`])
      return errorCode(db.query('select count(*) from realtime.messages'))
    })
    expect(anon).toBe(PERMISSION_DENIED)
  })

  it('a removed member can no longer join', async () => {
    await admin('delete from public.map_members where map_id = $1 and user_id = $2', [
      mapId,
      viewer,
    ])
    expect(await joinCheck(viewer, `map:${mapId}`)).toEqual({
      receive: false,
      broadcast: false,
      presence: false,
    })
    expect(await joinCheck(viewer, `map:${mapId}:people`)).toEqual({
      receive: false,
      broadcast: false,
      presence: false,
    })
    await admin(
      `insert into public.map_members (map_id, user_id, role, invited_by) values ($1, $2, 'viewer', $3)`,
      [mapId, viewer, owner],
    )
  })
})
