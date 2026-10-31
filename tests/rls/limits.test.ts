import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asUser, createUser, errorCode, pool, resetData, type Db } from './helpers'

// Phase 7.4 · limits, feature switches and sign-in records (20261101100000_limits_and_logins.sql).

let student: string, other: string

const setting = (key: string, value: string) =>
  admin(
    `insert into public.app_settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [key, value],
  )

async function fails(db: Db, sql: string, params: unknown[] = []): Promise<string | null> {
  await db.query('savepoint expect_error')
  const c = await errorCode(db.query(sql, params))
  await db.query(c ? 'rollback to savepoint expect_error' : 'release savepoint expect_error')
  return c
}

const newMap = (db: Db, title: string) =>
  db.query(`insert into public.maps (type, title) values ('notes', $1) returning id`, [title])

beforeAll(async () => {
  await resetData()
  student = await createUser('li-student@test.dev', { username: 'li_student' })
  other = await createUser('li-other@test.dev', { username: 'li_other' })
})

afterAll(async () => {
  await resetData()
  await pool.end()
})

describe('limits', () => {
  it('maps per day', async () => {
    await setting('limits.maps_per_day', '2')
    await asUser(student, async (db) => {
      await newMap(db, 'one')
      await newMap(db, 'two')
      expect(
        await fails(db, `insert into public.maps (type, title) values ('notes', 'three')`),
      ).toBe('MN429')
    })
    // Someone else has their own count.
    await asUser(other, async (db) => {
      await newMap(db, 'mine')
    })
    await setting('limits.maps_per_day', '30')
  })

  it('blocks per map, counting only new rows (saving re-sends existing ones)', async () => {
    await setting('limits.blocks_per_map', '2')
    await asUser(student, async (db) => {
      const map = (await newMap(db, 'small')).rows[0].id
      const root = (
        await db.query(
          `insert into public.nodes (map_id, level, title) values ($1, 'book', 'root') returning id`,
          [map],
        )
      ).rows[0].id
      const sec = (
        await db.query(
          `insert into public.nodes (map_id, parent_id, level, title) values ($1, $2, 'section', 's') returning id, map_id, parent_id, level`,
          [map, root],
        )
      ).rows[0]
      // Upsert of an existing row is a save, not a new block.
      await db.query(
        `insert into public.nodes (id, map_id, parent_id, level, title) values ($1, $2, $3, 'section', 'renamed')
         on conflict (id) do update set title = excluded.title`,
        [sec.id, map, root],
      )
      expect(
        await fails(
          db,
          `insert into public.nodes (map_id, parent_id, level, title) values ($1, $2, 'block', 'b')`,
          [map, sec.id],
        ),
      ).toBe('MN429')
    })
    await setting('limits.blocks_per_map', '5000')
  })

  it('uploads per day count files, not chapters', async () => {
    await setting('limits.uploads_per_day', '1')
    await asUser(student, async (db) => {
      const map = (await newMap(db, 'book')).rows[0].id
      const add = (hash: string) =>
        `insert into public.sources (map_id, kind, paragraphs, file_hash, file_size)
         values ('${map}', 'pdf', '[]', '${hash}', 100)`
      await db.query(add('a'.repeat(64)))
      await db.query(add('a'.repeat(64))) // chapter 2 of the same book
      expect(await fails(db, add('b'.repeat(64)))).toBe('MN429')
    })
    await setting('limits.uploads_per_day', '20')
  })
})

describe('feature switches', () => {
  it('new share links can be switched off', async () => {
    await setting('features.public_links', 'false')
    try {
      await asUser(student, async (db) => {
        const map = (await newMap(db, 'shared')).rows[0].id
        expect(await fails(db, `select * from public.share_link_set($1, 'view')`, [map])).toBe(
          'MN403',
        )
      })
    } finally {
      await setting('features.public_links', 'true')
    }
  })

  it('sign-ups can be closed', async () => {
    await setting('features.signups', 'false')
    try {
      expect(await errorCode(createUser('li-late@test.dev', { username: 'li_late' }))).toBe('MN403')
    } finally {
      await setting('features.signups', 'true')
    }
  })
})

describe('sign-in records', () => {
  it('the password hook records failures and never blocks', async () => {
    const r = await admin(`select public.hook_password_attempt($1::jsonb) as d`, [
      JSON.stringify({ user_id: student, valid: false }),
    ])
    expect(r.rows[0].d).toEqual({ decision: 'continue' })
    const ok = await admin(`select public.hook_password_attempt($1::jsonb) as d`, [
      JSON.stringify({ user_id: student, valid: true }),
    ])
    expect(ok.rows[0].d).toEqual({ decision: 'continue' })
    const bad = await admin(`select public.hook_password_attempt('{"user_id":"nope"}'::jsonb) as d`)
    expect(bad.rows[0].d).toEqual({ decision: 'continue' })
    const rows = await admin(`select success from public.login_events where user_id = $1`, [
      student,
    ])
    expect(rows.rows).toEqual([{ success: false }])
  })

  it('log_signin records the caller once a minute, with a clean country', async () => {
    await asUser(student, async (db) => {
      await db.query(`select public.log_signin('google', 'Firefox on Windows', 'de', 'hash')`)
      await db.query(`select public.log_signin('google', 'Firefox on Windows', 'de', 'hash')`)
      await db.query(`select public.log_signin('weird', 'x', 'Germany', null)`)
      const mine = await db.query(
        `select method, device, country from public.login_events where success order by id`,
      )
      expect(mine.rows).toEqual([{ method: 'google', device: 'Firefox on Windows', country: 'DE' }])
    })
  })

  it('students cannot use the rate counters or the hook', async () => {
    await asUser(student, async (db) => {
      expect(await fails(db, `select public.rate_hit('x', 1, interval '1 hour')`)).toBe('42501')
      expect(await fails(db, `select public.hook_password_attempt('{}'::jsonb)`)).toBe('42501')
      expect(await fails(db, 'select * from public.rate_limits')).toBe('42501')
    })
  })

  it('rate_hit counts per window', async () => {
    const hit = async () =>
      (await admin(`select public.rate_hit('test:key', 2, interval '1 hour') as ok`)).rows[0].ok
    expect([await hit(), await hit(), await hit()]).toEqual([true, true, false])
  })
})
