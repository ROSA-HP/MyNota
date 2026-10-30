import pg from 'pg'

/**
 * RLS test harness.
 * Every `as*` call runs inside a transaction that is rolled back, impersonating a
 * Supabase API role exactly like PostgREST does (SET ROLE + request.jwt.claims).
 */

const url = process.env.RLS_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/mynota_rls'

export const pool = new pg.Pool({ connectionString: url, max: 4 })

export type Db = pg.PoolClient

async function inTransaction<T>(
  role: 'anon' | 'authenticated',
  userId: string | null,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query(`set local role ${role}`)
    const claims = userId ? { sub: userId, role } : { role }
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    return await fn(db)
  } finally {
    await db.query('rollback').catch(() => undefined)
    db.release()
  }
}

export const asUser = <T>(userId: string, fn: (db: Db) => Promise<T>) =>
  inTransaction('authenticated', userId, fn)

export const asAnon = <T>(fn: (db: Db) => Promise<T>) => inTransaction('anon', null, fn)

/** Runs as the database owner (bypasses RLS) and commits. For fixtures only. */
export async function admin<T>(sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  return pool.query(sql, params) as Promise<pg.QueryResult<T & pg.QueryResultRow>>
}

export async function createUser(
  email: string,
  meta: Record<string, unknown> = {},
): Promise<string> {
  const { rows } = await admin<{ id: string }>(
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
    [email, JSON.stringify(meta)],
  )
  const id = (rows[0] as { id: string } | undefined)?.id
  if (!id) throw new Error('user not created')
  return id
}

/** Resolves to the Postgres error code, or null when the promise succeeded. */
export async function errorCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  }
}

export const PERMISSION_DENIED = '42501'

export async function resetData(): Promise<void> {
  // Cascades to profiles, subjects, maps, map_members.
  await admin('truncate auth.users cascade')
}
