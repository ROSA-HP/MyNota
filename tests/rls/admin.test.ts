import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PERMISSION_DENIED,
  admin,
  createUser,
  errorCode,
  pool,
  resetData,
  type Db,
} from './helpers'

// Phase 7.1 · admin (20261101090000_admin.sql): admin functions need an active admin signed in
// with a second factor; every action and every view of map content is in the audit log.

let boss: string, student: string, owner: string
let mapId: string, reportId: string

/** One transaction as `user`, with or without a two-factor session; rolled back after. */
async function as<T>(user: string, aal: 'aal1' | 'aal2', fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query('set local role authenticated')
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user, role: 'authenticated', aal }),
    ])
    return await fn(db)
  } finally {
    await db.query('rollback').catch(() => undefined)
    db.release()
  }
}

async function fails(db: Db, sql: string, params: unknown[] = []): Promise<string | null> {
  await db.query('savepoint expect_error')
  const c = await errorCode(db.query(sql, params))
  await db.query(c ? 'rollback to savepoint expect_error' : 'release savepoint expect_error')
  return c
}

const rows = async (db: Db, sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)).rows as Array<Record<string, unknown>>

beforeAll(async () => {
  await resetData()
  // `truncate auth.users cascade` also empties app_settings (it references profiles), so put
  // back the rows the migration seeds.
  await admin(
    `insert into public.app_settings (key, value) values
       ('limits.maps_per_day', '30'), ('features.signups', 'true')
     on conflict (key) do update set value = excluded.value`,
  )
  boss = await createUser('ad-boss@test.dev', { username: 'ad_boss' })
  student = await createUser('ad-student@test.dev', { username: 'ad_student' })
  owner = await createUser('ad-owner@test.dev', { username: 'ad_owner' })
  await admin(`update public.profiles set role = 'admin' where id = $1`, [boss])
  mapId = (
    await admin(
      `insert into public.maps (owner_id, type, title, link_access, link_token)
       values ($1, 'notes', 'Spam map', 'view', public.share_new_token()) returning id`,
      [owner],
    )
  ).rows[0].id
  await admin(
    `insert into public.nodes (map_id, level, title) values ($1, 'book', 'Secret notes')`,
    [mapId],
  )
  reportId = (
    await admin(
      `insert into public.reports (map_id, reporter_id, reason) values ($1, $2, 'spam') returning id`,
      [mapId, student],
    )
  ).rows[0].id
  await admin(
    `insert into public.login_events (user_id, success, method, device, country)
     values ($1, true, 'password', 'Firefox on Windows', 'DE'), ($2, false, 'password', '', null)`,
    [student, owner],
  )
})

afterAll(async () => {
  await resetData()
  await pool.end()
})

describe('who may use admin functions', () => {
  it('students never', async () => {
    await as(student, 'aal2', async (db) => {
      expect(await fails(db, 'select public.admin_overview()')).toBe(PERMISSION_DENIED)
      expect(await fails(db, 'select * from public.admin_users()')).toBe(PERMISSION_DENIED)
      expect(await fails(db, `select public.admin_map_content($1, 'look')`, [mapId])).toBe(
        PERMISSION_DENIED,
      )
      expect((await rows(db, 'select public.admin_ok() as ok'))[0]?.ok).toBe(false)
    })
  })

  it('admins only with a second factor', async () => {
    await as(boss, 'aal1', async (db) => {
      expect(await fails(db, 'select public.admin_overview()')).toBe(PERMISSION_DENIED)
      // Reading every profile needs the second factor too.
      expect(
        await rows(db, 'select id from public.profiles where id = $1', [student]),
      ).toHaveLength(0)
    })
    await as(boss, 'aal2', async (db) => {
      const o = (await rows(db, 'select public.admin_overview() as o'))[0]?.o as Record<
        string,
        number
      >
      expect(o.users).toBe(3)
      expect(o.open_reports).toBe(1)
      expect(o.public_links).toBe(1)
      expect(
        await rows(db, 'select id from public.profiles where id = $1', [student]),
      ).toHaveLength(1)
    })
  })

  it('a suspended admin loses access', async () => {
    await admin(`update public.profiles set status = 'suspended' where id = $1`, [boss])
    try {
      await as(boss, 'aal2', async (db) => {
        expect(await fails(db, 'select public.admin_overview()')).toBe(PERMISSION_DENIED)
      })
    } finally {
      await admin(`update public.profiles set status = 'active' where id = $1`, [boss])
    }
  })
})

describe('two-factor flag', () => {
  it('follows verified authenticator apps only', async () => {
    await admin(`insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')`, [
      student,
    ])
    await as(student, 'aal1', async (db) => {
      expect((await rows(db, 'select public.two_factor_sync() as on'))[0]?.on).toBe(false)
      // Nobody can set it directly.
      expect(
        await fails(db, 'update public.profiles set two_factor_enabled = true where id = $1', [
          student,
        ]),
      ).toBe(PERMISSION_DENIED)
    })
    await admin(`update auth.mfa_factors set status = 'verified' where user_id = $1`, [student])
    await as(student, 'aal1', async (db) => {
      expect((await rows(db, 'select public.two_factor_sync() as on'))[0]?.on).toBe(true)
      const p = await rows(db, 'select two_factor_enabled from public.profiles where id = $1', [
        student,
      ])
      expect(p[0]?.two_factor_enabled).toBe(true)
    })
    await admin(`delete from auth.mfa_factors where user_id = $1`, [student])
  })
})

describe('tables are closed', () => {
  it('audit log and flags are not readable directly, even by admins', async () => {
    await as(boss, 'aal2', async (db) => {
      expect(await fails(db, 'select * from public.audit_log')).toBe(PERMISSION_DENIED)
      expect(await fails(db, 'select * from public.user_flags')).toBe(PERMISSION_DENIED)
    })
  })

  it('people read only their own sign-ins and cannot write any', async () => {
    await as(student, 'aal1', async (db) => {
      const mine = await rows(db, 'select user_id from public.login_events')
      expect(mine.map((r) => r.user_id)).toEqual([student])
      expect(
        await fails(db, `insert into public.login_events (user_id, success) values ($1, true)`, [
          student,
        ]),
      ).toBe(PERMISSION_DENIED)
    })
  })

  it('settings: everyone signed in reads, nobody writes directly', async () => {
    await as(student, 'aal1', async (db) => {
      const s = await rows(
        db,
        `select value from public.app_settings where key = 'features.signups'`,
      )
      expect(s[0]?.value).toBe(true)
      expect(
        await fails(
          db,
          `update public.app_settings set value = 'false' where key = 'features.signups'`,
        ),
      ).toBe(PERMISSION_DENIED)
    })
  })
})

describe('admin actions', () => {
  it('viewing map content needs a reason and is audited', async () => {
    await as(boss, 'aal2', async (db) => {
      expect(await fails(db, `select public.admin_map_content($1, '')`, [mapId])).toBe('MN400')
      const c = (
        await rows(db, `select public.admin_map_content($1, 'report check') as c`, [mapId])
      )[0]?.c as { nodes: Array<{ title: string }> }
      expect(c.nodes[0]?.title).toBe('Secret notes')
      const log = await rows(db, 'select * from public.admin_audit()')
      expect(log[0]).toMatchObject({
        action: 'map.view_content',
        target_id: mapId,
        reason: 'report check',
        actor_username: 'ad_boss',
      })
    })
  })

  it('suspending a user ends their access; never one’s own account', async () => {
    await as(boss, 'aal2', async (db) => {
      expect(
        await fails(db, `select public.admin_set_user_status($1, 'suspended', 'test')`, [boss]),
      ).toBe(PERMISSION_DENIED)
      expect(
        await fails(db, `select public.admin_set_user_status($1, 'gone', 'test')`, [owner]),
      ).toBe('MN400')
      await db.query(`select public.admin_set_user_status($1, 'banned', 'spam account')`, [owner])
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: owner, role: 'authenticated', aal: 'aal1' }),
      ])
      expect((await rows(db, 'select public.map_role($1) as r', [mapId]))[0]?.r).toBeNull()
    })
  })

  it('resolving a report with takedown turns the link off and changes its token', async () => {
    const tokenOf = async (db: Db) => {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: owner, role: 'authenticated', aal: 'aal1' }),
      ])
      const s = (await rows(db, 'select * from public.share_settings($1)', [mapId]))[0]
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: boss, role: 'authenticated', aal: 'aal2' }),
      ])
      return s
    }
    await as(boss, 'aal2', async (db) => {
      const before = await tokenOf(db)
      expect(before?.link_access).toBe('view')
      await db.query(`select public.admin_report_resolve($1, 'takedown', 'spam confirmed')`, [
        reportId,
      ])
      const after = await tokenOf(db)
      expect(after?.link_access).toBe('off')
      expect(after?.link_token).not.toBe(before?.link_token)
      const r = await rows(db, `select * from public.admin_reports('resolved')`)
      expect(r[0]).toMatchObject({
        id: reportId,
        outcome: 'spam confirmed',
        handled_by_username: 'ad_boss',
      })
      expect(
        await fails(db, `select public.admin_report_resolve($1, 'none', 'again')`, [reportId]),
      ).toBe('MN400')
      const actions = (await rows(db, 'select action from public.admin_audit()')).map(
        (a) => a.action,
      )
      expect(actions).toEqual(expect.arrayContaining(['report.resolve', 'map.link_takedown']))
    })
  })
  it('settings are validated and audited', async () => {
    await as(boss, 'aal2', async (db) => {
      expect(
        await fails(db, `select public.admin_setting_set('limits.maps_per_day', '"x"', 'test')`),
      ).toBe('MN400')
      expect(
        await fails(db, `select public.admin_setting_set('features.nope', 'true', 'test')`),
      ).toBe('MN404')
      await db.query(
        `select public.admin_setting_set('limits.maps_per_day', '10', 'too many maps')`,
      )
      const s = await rows(
        db,
        `select value from public.app_settings where key = 'limits.maps_per_day'`,
      )
      expect(s[0]?.value).toBe(10)
      const log = await rows(db, 'select * from public.admin_audit(1)')
      expect(log[0]).toMatchObject({ action: 'setting.set', details: { before: 30, after: 10 } })
    })
  })

  it('login activity and flags', async () => {
    await as(boss, 'aal2', async (db) => {
      const failed = await rows(db, 'select * from public.admin_login_events(null, true)')
      expect(failed.map((r) => r.user_id)).toEqual([owner])
      await db.query(`select public.admin_flag_user($1, 'many failed sign-ins')`, [owner])
      const users = await rows(db, `select * from public.admin_users('ad_owner')`)
      expect(users[0]).toMatchObject({ flagged: true, email: 'ad-owner@test.dev', map_count: '1' })
    })
  })
})
