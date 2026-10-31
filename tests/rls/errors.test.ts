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

// Phase 7.6 · client_errors (20261101110000_client_errors.sql).

let student: string, boss: string

/** Runs as a user (or a visitor) and commits, unlike asUser / asAnon which roll back. */
async function commitAs(user: string | null, sql: string) {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query(`set local role ${user ? 'authenticated' : 'anon'}`)
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(user ? { sub: user, role: 'authenticated' } : { role: 'anon' }),
    ])
    await db.query(sql)
    await db.query('commit')
  } catch (e) {
    await db.query('rollback')
    throw e
  } finally {
    db.release()
  }
}

const report = (msg = 'TypeError: x is undefined') =>
  `select public.report_client_error('error', '${msg}', 'fn /src/a.ts:1:2', '/maps/:id', '0.1.0', 'Firefox 140')`

beforeAll(async () => {
  await resetData()
  await admin('truncate public.client_errors, public.rate_limits')
  student = await createUser('er-student@test.dev', { username: 'er_student' })
  boss = await createUser('er-boss@test.dev', { username: 'er_boss' })
  await admin(`update public.profiles set role = 'admin' where id = $1`, [boss])
})

afterAll(async () => {
  await admin('truncate public.client_errors, public.rate_limits')
  await resetData()
  await pool.end()
})

describe('error reports', () => {
  it('anyone can send a report, nobody can read the table', async () => {
    await commitAs(student, report())
    await asUser(student, async (db) => {
      expect(await errorCode(db.query('select * from public.client_errors'))).toBe(
        PERMISSION_DENIED,
      )
    })
    await commitAs(null, report('Link page failed'))
    await asAnon(async (db) => {
      expect(await errorCode(db.query('select * from public.client_errors'))).toBe(
        PERMISSION_DENIED,
      )
    })
    const rows = (await admin('select user_id, message from public.client_errors order by id')).rows
    expect(rows).toEqual([
      { user_id: student, message: 'TypeError: x is undefined' },
      { user_id: null, message: 'Link page failed' },
    ])
  })

  it('rejects invalid reports and limits each person', async () => {
    await asUser(student, async (db) => {
      expect(
        await errorCode(
          db.query(`select public.report_client_error('weird', 'x', '', '', '', '')`),
        ),
      ).toBe('MN400')
    })
    await admin('truncate public.client_errors, public.rate_limits')
    for (let i = 0; i < 35; i++) await commitAs(student, report(`e${i}`))
    expect((await admin('select count(*)::int as n from public.client_errors')).rows[0].n).toBe(30)
  })

  it('admins see them grouped, only with a two-factor session', async () => {
    await admin('truncate public.client_errors, public.rate_limits')
    await commitAs(student, report())
    await commitAs(boss, report())
    const read = (aal: string) =>
      asUser(boss, async (db) => {
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: boss, role: 'authenticated', aal }),
        ])
        return db.query('select * from public.admin_client_errors()')
      })
    expect(await errorCode(read('aal1'))).toBe(PERMISSION_DENIED)
    const r = (await read('aal2')).rows
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ message: 'TypeError: x is undefined', count: '2', people: '2' })
  })
})
