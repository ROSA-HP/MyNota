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

// Cast: fixtures are assigned in beforeAll.
let owner: string, editor: string, viewer: string, stranger: string, adminUser: string
let mapId: string, subjectId: string, strangerSubjectId: string

const MAP_COLS = 'id, owner_id, subject_id, type, title, cover_color, languages, link_access'

beforeAll(async () => {
  await resetData()
  owner = await createUser('owner@test.dev', {
    name: 'Olivia',
    username: 'olivia',
    ui_language: 'de',
  })
  editor = await createUser('editor@test.dev', { name: 'Eddie', username: 'eddie' })
  viewer = await createUser('viewer@test.dev', { username: 'vera' })
  stranger = await createUser('stranger@test.dev', { username: 'stan' })
  adminUser = await createUser('admin@test.dev', { username: 'root_admin' })
  await admin(`update public.profiles set role = 'admin' where id = $1`, [adminUser])

  subjectId = (
    await admin(
      `insert into public.subjects (owner_id, name) values ($1, 'Biology') returning id`,
      [owner],
    )
  ).rows[0].id
  strangerSubjectId = (
    await admin(`insert into public.subjects (owner_id, name) values ($1, 'Secret') returning id`, [
      stranger,
    ])
  ).rows[0].id
  mapId = (
    await admin(
      `insert into public.maps (owner_id, subject_id, type, title) values ($1, $2, 'book', 'Cell Biology') returning id`,
      [owner, subjectId],
    )
  ).rows[0].id
  await admin(
    `insert into public.map_members (map_id, user_id, role, invited_by) values ($1, $2, 'editor', $4), ($1, $3, 'viewer', $4)`,
    [mapId, editor, viewer, owner],
  )
})

afterAll(async () => {
  await resetData()
  await pool.end()
})

// ---------------------------------------------------------------------------
describe('profiles: creation trigger', () => {
  it('uses the chosen username, name and language', async () => {
    const { rows } = await admin('select * from public.profiles where id = $1', [owner])
    expect(rows[0]).toMatchObject({
      username: 'olivia',
      name: 'Olivia',
      ui_language: 'de',
      role: 'student',
      status: 'active',
    })
  })

  it('generates a unique username for OAuth sign-ups', async () => {
    const a = await createUser('maria.lopez@gmail.com', { full_name: 'María López' })
    const b = await createUser('maria.lopez@outlook.com', { full_name: 'Other María' })
    const { rows } = await admin(
      'select id, username, name from public.profiles where id = any($1)',
      [[a, b]],
    )
    const ua = rows.find((r) => r.id === a)?.username as string
    const ub = rows.find((r) => r.id === b)?.username as string
    expect(ua).toBe('marialopez')
    expect(ub).toMatch(/^marialopez_[a-f0-9]{4,5}$/)
    expect(rows.find((r) => r.id === a)?.name).toBe('María López')
  })

  it('derives a valid username from emails that start with a digit or are very short', async () => {
    const a = await createUser('1@x.dev')
    const { rows } = await admin('select username from public.profiles where id = $1', [a])
    expect(rows[0].username).toMatch(/^[a-z][a-z0-9_]{2,23}$/)
  })

  it('rejects sign-up when the chosen username is already taken', async () => {
    expect(await errorCode(createUser('copy@test.dev', { username: 'olivia' }))).toBe('23505')
  })

  it('ignores invalid language, theme and non-https avatars from metadata', async () => {
    const id = await createUser('meta@test.dev', {
      username: 'meta_user',
      ui_language: 'fr',
      theme: 'neon',
      avatar_url: 'javascript:alert(1)',
    })
    const { rows } = await admin(
      'select ui_language, theme, avatar_url from public.profiles where id = $1',
      [id],
    )
    expect(rows[0]).toEqual({ ui_language: 'en', theme: 'system', avatar_url: null })
  })
})

describe('profiles: access', () => {
  it('anon cannot read profiles', async () => {
    expect(await errorCode(asAnon((db) => db.query('select id from public.profiles')))).toBe(
      PERMISSION_DENIED,
    )
  })

  it('anon can check username availability', async () => {
    const r = await asAnon((db) =>
      db.query(
        `select public.username_available('olivia') as taken, public.username_available('fresh_name') as free, public.username_available('Bad Name') as bad`,
      ),
    )
    expect(r.rows[0]).toEqual({ taken: false, free: true, bad: false })
  })

  it('a stranger sees only their own profile', async () => {
    const r = await asUser(stranger, (db) => db.query('select id from public.profiles'))
    expect(r.rows.map((x) => x.id)).toEqual([stranger])
  })

  it('collaborators on a map see each other', async () => {
    const r = await asUser(viewer, (db) => db.query('select id from public.profiles'))
    expect(new Set(r.rows.map((x) => x.id))).toEqual(new Set([owner, editor, viewer]))
  })

  it('admins can read every profile', async () => {
    const r = await asUser(adminUser, (db) =>
      db.query('select count(*)::int as n from public.profiles'),
    )
    const total = (await admin('select count(*)::int as n from public.profiles')).rows[0].n
    expect(r.rows[0].n).toBe(total)
  })

  it('users can update their own editable fields', async () => {
    const r = await asUser(owner, (db) =>
      db.query(
        `update public.profiles set name = 'Liv', theme = 'dark', username = 'liv' where id = $1 returning name, theme, username`,
        [owner],
      ),
    )
    expect(r.rows[0]).toEqual({ name: 'Liv', theme: 'dark', username: 'liv' })
  })

  it('users cannot make themselves admin, unsuspend, or fake 2FA', async () => {
    for (const col of [`role = 'admin'`, `status = 'active'`, `two_factor_enabled = true`]) {
      expect(
        await errorCode(
          asUser(owner, (db) =>
            db.query(`update public.profiles set ${col} where id = $1`, [owner]),
          ),
        ),
      ).toBe(PERMISSION_DENIED)
    }
  })

  it("users cannot edit someone else's profile", async () => {
    const r = await asUser(stranger, (db) =>
      db.query(`update public.profiles set name = 'hacked' where id = $1`, [owner]),
    )
    expect(r.rowCount).toBe(0)
  })

  it('users cannot insert or delete profiles directly', async () => {
    expect(
      await errorCode(
        asUser(stranger, (db) => db.query(`delete from public.profiles where id = $1`, [stranger])),
      ),
    ).toBe(PERMISSION_DENIED)
    expect(
      await errorCode(
        asUser(stranger, (db) =>
          db.query(
            `insert into public.profiles (id, username) values (gen_random_uuid(), 'ghost')`,
          ),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('suspended users cannot update their profile', async () => {
    const id = await createUser('sus@test.dev', { username: 'suspended_one' })
    await admin(`update public.profiles set status = 'suspended' where id = $1`, [id])
    const r = await asUser(id, (db) =>
      db.query(`update public.profiles set name = 'x' where id = $1`, [id]),
    )
    expect(r.rowCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
describe('subjects', () => {
  it('owner sees only their own subjects', async () => {
    const r = await asUser(owner, (db) => db.query('select id from public.subjects'))
    expect(r.rows.map((x) => x.id)).toEqual([subjectId])
  })

  it('map collaborators cannot see the owner subjects', async () => {
    const r = await asUser(editor, (db) => db.query('select id from public.subjects'))
    expect(r.rowCount).toBe(0)
  })

  it('owner can create, rename and delete', async () => {
    await asUser(owner, async (db) => {
      const ins = await db.query(
        `insert into public.subjects (name, color) values ('Chemistry', 'sky') returning id, owner_id`,
      )
      expect(ins.rows[0].owner_id).toBe(owner)
      const upd = await db.query(`update public.subjects set name = 'Organic Chem' where id = $1`, [
        ins.rows[0].id,
      ])
      expect(upd.rowCount).toBe(1)
      const del = await db.query(`delete from public.subjects where id = $1`, [ins.rows[0].id])
      expect(del.rowCount).toBe(1)
    })
  })

  it('cannot create a subject for someone else', async () => {
    expect(
      await errorCode(
        asUser(stranger, (db) =>
          db.query(`insert into public.subjects (owner_id, name) values ($1, 'x')`, [owner]),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('cannot hand a subject to another user', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(`update public.subjects set owner_id = $1 where id = $2`, [stranger, subjectId]),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('anon has no access', async () => {
    expect(await errorCode(asAnon((db) => db.query('select id from public.subjects')))).toBe(
      PERMISSION_DENIED,
    )
  })
})

// ---------------------------------------------------------------------------
describe('maps: reading', () => {
  it('owner, editor and viewer can read the map', async () => {
    for (const u of [owner, editor, viewer]) {
      const r = await asUser(u, (db) =>
        db.query(`select ${MAP_COLS} from public.maps where id = $1`, [mapId]),
      )
      expect(r.rowCount).toBe(1)
    }
  })

  it('strangers and anon cannot read it', async () => {
    const r = await asUser(stranger, (db) => db.query(`select ${MAP_COLS} from public.maps`))
    expect(r.rowCount).toBe(0)
    expect(await errorCode(asAnon((db) => db.query(`select id from public.maps`)))).toBe(
      PERMISSION_DENIED,
    )
  })

  it('nobody can read link_token through the API, not even the owner', async () => {
    for (const u of [owner, editor]) {
      expect(
        await errorCode(asUser(u, (db) => db.query(`select link_token from public.maps`))),
      ).toBe(PERMISSION_DENIED)
    }
  })

  it('a suspended owner loses access', async () => {
    await admin(`update public.profiles set status = 'suspended' where id = $1`, [owner])
    try {
      const r = await asUser(owner, (db) => db.query(`select id from public.maps`))
      expect(r.rowCount).toBe(0)
    } finally {
      await admin(`update public.profiles set status = 'active' where id = $1`, [owner])
    }
  })
})

describe('maps: writing', () => {
  it('a user can create a map and get it back (insert … returning)', async () => {
    const r = await asUser(stranger, (db) =>
      db.query(
        `insert into public.maps (type, title, languages) values ('notes', 'Lecture 1', '{ar}') returning ${MAP_COLS}`,
      ),
    )
    expect(r.rows[0]).toMatchObject({ owner_id: stranger, title: 'Lecture 1', link_access: 'off' })
  })

  it('cannot create a map owned by someone else', async () => {
    expect(
      await errorCode(
        asUser(stranger, (db) =>
          db.query(`insert into public.maps (owner_id, type, title) values ($1, 'blank', 'x')`, [
            owner,
          ]),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it("cannot file a map into another user's subject", async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(`insert into public.maps (type, title, subject_id) values ('blank', 'x', $1)`, [
            strangerSubjectId,
          ]),
        ),
      ),
    ).toBe('23503')
  })

  it('cannot set share-link fields directly', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(`update public.maps set link_access = 'edit' where id = $1`, [mapId]),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(`update public.maps set link_token = repeat('a', 43) where id = $1`, [mapId]),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('owner and editor can rename; viewer and stranger cannot', async () => {
    for (const u of [owner, editor]) {
      const r = await asUser(u, (db) =>
        db.query(`update public.maps set title = 'Renamed' where id = $1`, [mapId]),
      )
      expect(r.rowCount).toBe(1)
    }
    for (const u of [viewer, stranger]) {
      const r = await asUser(u, (db) =>
        db.query(`update public.maps set title = 'Nope' where id = $1`, [mapId]),
      )
      expect(r.rowCount).toBe(0)
    }
  })

  it('editor cannot move the map into a subject', async () => {
    expect(
      await errorCode(
        asUser(editor, (db) =>
          db.query(`update public.maps set subject_id = null where id = $1`, [mapId]),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('owner_id can never change', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(`update public.maps set owner_id = $1 where id = $2`, [stranger, mapId]),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('only the owner can delete', async () => {
    for (const u of [editor, viewer, stranger]) {
      const r = await asUser(u, (db) => db.query(`delete from public.maps where id = $1`, [mapId]))
      expect(r.rowCount).toBe(0)
    }
    const r = await asUser(owner, (db) =>
      db.query(`delete from public.maps where id = $1`, [mapId]),
    )
    expect(r.rowCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
describe('map_members', () => {
  it('everyone on the map sees the member list; strangers do not', async () => {
    for (const u of [owner, editor, viewer]) {
      const r = await asUser(u, (db) =>
        db.query(`select user_id from public.map_members where map_id = $1`, [mapId]),
      )
      expect(r.rowCount).toBe(2)
    }
    const r = await asUser(stranger, (db) => db.query(`select user_id from public.map_members`))
    expect(r.rowCount).toBe(0)
  })

  it('owner can add a member', async () => {
    const r = await asUser(owner, (db) =>
      db.query(
        `insert into public.map_members (map_id, user_id, role) values ($1, $2, 'viewer') returning invited_by`,
        [mapId, stranger],
      ),
    )
    expect(r.rows[0].invited_by).toBe(owner)
  })

  it('editors and viewers cannot add members', async () => {
    for (const u of [editor, viewer]) {
      expect(
        await errorCode(
          asUser(u, (db) =>
            db.query(
              `insert into public.map_members (map_id, user_id, role) values ($1, $2, 'editor')`,
              [mapId, stranger],
            ),
          ),
        ),
      ).toBe(PERMISSION_DENIED)
    }
  })

  it('the owner cannot also be a member', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(
            `insert into public.map_members (map_id, user_id, role) values ($1, $2, 'editor')`,
            [mapId, owner],
          ),
        ),
      ),
    ).toBe('23514')
  })

  it('a viewer cannot promote themselves', async () => {
    const r = await asUser(viewer, (db) =>
      db.query(`update public.map_members set role = 'editor' where map_id = $1 and user_id = $2`, [
        mapId,
        viewer,
      ]),
    )
    expect(r.rowCount).toBe(0)
  })

  it('owner can change roles', async () => {
    const r = await asUser(owner, (db) =>
      db.query(`update public.map_members set role = 'editor' where map_id = $1 and user_id = $2`, [
        mapId,
        viewer,
      ]),
    )
    expect(r.rowCount).toBe(1)
  })

  it('a member can leave but cannot remove others', async () => {
    await asUser(viewer, async (db) => {
      const other = await db.query(
        `delete from public.map_members where map_id = $1 and user_id = $2`,
        [mapId, editor],
      )
      expect(other.rowCount).toBe(0)
      const self = await db.query(
        `delete from public.map_members where map_id = $1 and user_id = $2`,
        [mapId, viewer],
      )
      expect(self.rowCount).toBe(1)
    })
  })

  it('a removed member loses access to the map', async () => {
    await admin(`delete from public.map_members where map_id = $1 and user_id = $2`, [
      mapId,
      viewer,
    ])
    try {
      const r = await asUser(viewer, (db) =>
        db.query(`select id from public.maps where id = $1`, [mapId]),
      )
      expect(r.rowCount).toBe(0)
    } finally {
      await admin(
        `insert into public.map_members (map_id, user_id, role, invited_by) values ($1, $2, 'viewer', $3)`,
        [mapId, viewer, owner],
      )
    }
  })
})

describe('every public table has RLS enabled', () => {
  it('no table in public is left without RLS', async () => {
    const { rows } = await admin(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(rows).toEqual([])
  })
})
