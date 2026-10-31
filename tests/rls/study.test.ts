import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PERMISSION_DENIED,
  admin,
  asAnon,
  asUser,
  createUser,
  errorCode,
  pool,
  resetData,
} from './helpers'

let owner: string, editor: string, viewer: string, stranger: string
let mapId: string, otherMapId: string, blockId: string, otherBlockId: string, cardId: string

beforeAll(async () => {
  await resetData()
  owner = await createUser('s-owner@test.dev', { username: 's_owner' })
  editor = await createUser('s-editor@test.dev', { username: 's_editor' })
  viewer = await createUser('s-viewer@test.dev', { username: 's_viewer' })
  stranger = await createUser('s-stranger@test.dev', { username: 's_stranger' })
  mapId = (
    await admin(
      `insert into public.maps (owner_id, type, title) values ($1, 'notes', 'Cells') returning id`,
      [owner],
    )
  ).rows[0].id
  otherMapId = (
    await admin(
      `insert into public.maps (owner_id, type, title) values ($1, 'notes', 'Other') returning id`,
      [stranger],
    )
  ).rows[0].id
  await admin(
    `insert into public.map_members (map_id, user_id, role, invited_by) values ($1, $2, 'editor', $4), ($1, $3, 'viewer', $4)`,
    [mapId, editor, viewer, owner],
  )
  blockId = (
    await admin(
      `insert into public.nodes (map_id, level, title) values ($1, 'block', 'Osmosis') returning id`,
      [mapId],
    )
  ).rows[0].id
  otherBlockId = (
    await admin(
      `insert into public.nodes (map_id, level, title) values ($1, 'block', 'Elsewhere') returning id`,
      [otherMapId],
    )
  ).rows[0].id
  cardId = (
    await admin(
      `insert into public.cards (map_id, node_id, front, back, origin, source_key) values ($1, $2, 'Osmosis', 'Water diffusion', 'auto', 'type') returning id`,
      [mapId, blockId],
    )
  ).rows[0].id
})

afterAll(async () => {
  await resetData()
  await pool.end()
})

describe('cards', () => {
  it('everyone on the map reads them; strangers and anon do not', async () => {
    for (const u of [owner, editor, viewer]) {
      const r = await asUser(u, (db) => db.query('select id from public.cards'))
      expect(r.rows.map((x) => x.id)).toEqual([cardId])
    }
    const s = await asUser(stranger, (db) => db.query('select id from public.cards'))
    expect(s.rows).toHaveLength(0)
    expect(await errorCode(asAnon((db) => db.query('select id from public.cards')))).toBe(
      PERMISSION_DENIED,
    )
  })

  it('owner and editors write; viewers cannot', async () => {
    const sql = `insert into public.cards (map_id, node_id, front, back) values ($1, $2, 'Q', 'A')`
    for (const u of [owner, editor]) {
      const r = await asUser(u, (db) => db.query(sql, [mapId, blockId]))
      expect(r.rowCount).toBe(1)
    }
    expect(await errorCode(asUser(viewer, (db) => db.query(sql, [mapId, blockId])))).toBe(
      PERMISSION_DENIED,
    )
    const upd = await asUser(viewer, (db) =>
      db.query(`update public.cards set front = 'x' where id = $1`, [cardId]),
    )
    expect(upd.rowCount).toBe(0)
  })

  it('a card’s block must be in its map, and a made card is never added twice', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(`insert into public.cards (map_id, node_id, front) values ($1, $2, 'Q')`, [
            mapId,
            otherBlockId,
          ]),
        ),
      ),
    ).toBe('23503')
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(
            `insert into public.cards (map_id, node_id, front, origin, source_key) values ($1, $2, 'Again', 'auto', 'type')`,
            [mapId, blockId],
          ),
        ),
      ),
    ).toBe('23505')
  })

  it('rejects unknown types and empty fronts', async () => {
    for (const [type, front] of [
      ['image', 'Q'],
      ['basic', ''],
    ])
      expect(
        await errorCode(
          asUser(owner, (db) =>
            db.query(`insert into public.cards (map_id, type, front) values ($1, $2, $3)`, [
              mapId,
              type,
              front,
            ]),
          ),
        ),
      ).toBe('23514')
  })
})

describe('progress and review logs are personal', () => {
  const progress = `insert into public.card_progress (card_id, user_id, map_id, due, state, reps)
    values ($1, $2, $3, now() - interval '1 hour', 2, 3)`

  it('each student writes and reads only their own progress, viewers included', async () => {
    for (const u of [owner, viewer]) {
      const r = await asUser(u, (db) => db.query(progress, [cardId, u, mapId]))
      expect(r.rowCount).toBe(1)
    }
    expect(
      await errorCode(asUser(viewer, (db) => db.query(progress, [cardId, owner, mapId]))),
    ).toBe(PERMISSION_DENIED)
    // A stranger cannot even see the card: refused before RLS (23503) or by it (42501).
    expect(
      await errorCode(asUser(stranger, (db) => db.query(progress, [cardId, stranger, mapId]))),
    ).not.toBeNull()

    await admin(progress, [cardId, owner, mapId])
    const seen = await asUser(viewer, (db) => db.query('select user_id from public.card_progress'))
    expect(seen.rows).toHaveLength(0)
    const mine = await asUser(owner, (db) => db.query('select user_id from public.card_progress'))
    expect(mine.rows.map((r) => r.user_id)).toEqual([owner])
  })

  it('progress must name the card’s own map', async () => {
    expect(
      await errorCode(asUser(owner, (db) => db.query(progress, [cardId, owner, otherMapId]))),
    ).not.toBeNull()
  })

  it('review logs: insert and read your own only, never change them', async () => {
    const log = `insert into public.review_logs (card_id, user_id, map_id, rating, state) values ($1, $2, $3, 3, 0)`
    expect((await asUser(viewer, (db) => db.query(log, [cardId, viewer, mapId]))).rowCount).toBe(1)
    expect(await errorCode(asUser(viewer, (db) => db.query(log, [cardId, owner, mapId])))).toBe(
      PERMISSION_DENIED,
    )
    await admin(log, [cardId, owner, mapId])
    const other = await asUser(viewer, (db) => db.query('select id from public.review_logs'))
    expect(other.rows).toHaveLength(0)
    expect(
      await errorCode(asUser(owner, (db) => db.query(`update public.review_logs set rating = 4`))),
    ).toBe(PERMISSION_DENIED)
    expect(
      await errorCode(
        asUser(owner, (db) => db.query(log.replace(', 3, 0)', ', 5, 0)'), [cardId, owner, mapId])),
      ),
    ).toBe('23514')
  })

  it('deck_stats and study_activity count only the caller’s rows', async () => {
    const stats = await asUser(owner, (db) => db.query('select * from public.deck_stats(null)'))
    expect(stats.rows).toEqual([
      { map_id: mapId, total: 1, new_cards: 0, due: 1, learning: 1, mastered: 0 },
    ])
    const fresh = await asUser(editor, (db) => db.query('select * from public.deck_stats(null)'))
    expect(fresh.rows[0]).toMatchObject({ total: 1, new_cards: 1, due: 0 })
    const theirs = await asUser(stranger, (db) => db.query('select * from public.deck_stats(null)'))
    expect(theirs.rows).toHaveLength(0)
    const act = await asUser(owner, (db) =>
      db.query(`select * from public.study_activity(30, 'Africa/Cairo')`),
    )
    expect(act.rows).toHaveLength(1)
    expect(act.rows[0].reviews).toBe(1)
  })

  it('daily limits live on the profile and stay in range', async () => {
    const ok = await asUser(owner, (db) =>
      db.query(
        `update public.profiles set daily_new_limit = 15, daily_review_limit = 150 where id = $1`,
        [owner],
      ),
    )
    expect(ok.rowCount).toBe(1)
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(`update public.profiles set daily_new_limit = -1 where id = $1`, [owner]),
        ),
      ),
    ).toBe('23514')
    const d = await admin(
      `select daily_new_limit, daily_review_limit from public.profiles where id = $1`,
      [editor],
    )
    expect(d.rows[0]).toEqual({ daily_new_limit: 10, daily_review_limit: 100 })
  })
})
