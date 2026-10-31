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
  type Db,
} from './helpers'

let owner: string, friend: string, viewer: string, stranger: string
let mapId: string, blockId: string

/** Switches the signed-in user inside one transaction (so several people can act in a row). */
const as = (db: Db, user: string) =>
  db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: user, role: 'authenticated' }),
  ])
const code = (p: Promise<unknown>) => errorCode(p)
/** Runs a statement that should fail without aborting the surrounding transaction. */
async function fails(db: Db, sql: string, params: unknown[] = []): Promise<string | null> {
  await db.query('savepoint expect_error')
  const c = await errorCode(db.query(sql, params))
  await db.query(c ? 'rollback to savepoint expect_error' : 'release savepoint expect_error')
  return c
}
const one = async <T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)).rows[0] as T

beforeAll(async () => {
  await resetData()
  owner = await createUser('sh-owner@test.dev', { username: 'sh_owner' })
  friend = await createUser('sh-friend@test.dev', { username: 'sh_friend' })
  viewer = await createUser('sh-viewer@test.dev', { username: 'sh_viewer' })
  stranger = await createUser('sh-stranger@test.dev', { username: 'sh_stranger' })
  mapId = (
    await admin(
      `insert into public.maps (owner_id, type, title) values ($1, 'notes', 'Cells') returning id`,
      [owner],
    )
  ).rows[0].id
  const root = (
    await admin(
      `insert into public.nodes (map_id, level, title) values ($1, 'book', 'Cells') returning id`,
      [mapId],
    )
  ).rows[0].id
  const section = (
    await admin(
      `insert into public.nodes (map_id, parent_id, level, title) values ($1, $2, 'section', 'Membrane') returning id`,
      [mapId, root],
    )
  ).rows[0].id
  blockId = (
    await admin(
      `insert into public.nodes (map_id, parent_id, level, title) values ($1, $2, 'block', 'Osmosis') returning id`,
      [mapId, section],
    )
  ).rows[0].id
  const other = (
    await admin(
      `insert into public.nodes (map_id, parent_id, level, title) values ($1, $2, 'block', 'Diffusion') returning id`,
      [mapId, section],
    )
  ).rows[0].id
  await admin(
    `insert into public.relations (map_id, from_node, to_node, type, status) values ($1, $2, $3, 'related', 'accepted'), ($1, $3, $2, 'causes', 'suggested')`,
    [mapId, blockId, other],
  )
  await admin(
    `insert into public.sources (map_id, chapter_node_id, paragraphs) values ($1, $2, '[{"n":1,"text":"Water moves."}]')`,
    [mapId, root],
  )
  await admin(
    `insert into public.map_members (map_id, user_id, role, invited_by) values ($1, $2, 'viewer', $3)`,
    [mapId, viewer, owner],
  )
})

afterAll(async () => {
  await resetData()
  await pool.end()
})

describe('share link', () => {
  it('only the owner manages the link; its secret stays out of the table API', async () => {
    for (const u of [viewer, stranger])
      expect(
        await code(asUser(u, (db) => db.query(`select * from public.share_settings($1)`, [mapId]))),
      ).toBe(PERMISSION_DENIED)
    await asUser(owner, async (db) => {
      const s = await one<{ link_token: string; link_access: string }>(
        db,
        `select * from public.share_link_set($1, 'view')`,
        [mapId],
      )
      expect(s.link_access).toBe('view')
      expect(s.link_token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(await fails(db, `select link_token from public.maps`)).toBe(PERMISSION_DENIED)
    })
    expect(
      await code(
        asUser(owner, (db) =>
          db.query(`update public.maps set link_access = 'edit' where id = $1`, [mapId]),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('anyone opens a valid link read only; off, expired, reset and made-up links fail', async () => {
    await asUser(owner, async (db) => {
      const { link_token } = await one<{ link_token: string }>(
        db,
        `select * from public.share_link_set($1, 'view')`,
        [mapId],
      )
      // Anyone (here: a stranger, then the anon role) can read the map through the link.
      await as(db, stranger)
      const open = await one<{
        j: {
          map: { title: string }
          nodes: unknown[]
          relations: unknown[]
          sources: unknown[]
          access: string
          role: string | null
        }
      }>(db, `select public.link_open($1) as j`, [link_token])
      expect(open.j.map.title).toBe('Cells')
      expect(open.j.access).toBe('view')
      expect(open.j.role).toBeNull()
      expect(open.j.nodes).toHaveLength(4)
      expect(open.j.relations).toHaveLength(1) // suggested links are not shown
      expect(open.j.sources).toHaveLength(1)
      expect(JSON.stringify(open.j)).not.toContain('search_text')
      // Still no direct access for the stranger.
      expect(
        (await db.query(`select id from public.nodes where map_id = $1`, [mapId])).rowCount,
      ).toBe(0)
      expect(await fails(db, `select public.link_open('not-a-token')`)).toBe('MN404')
      await db.query('savepoint s1')
      await as(db, owner)
      await db.query(`select * from public.share_link_set($1, 'off')`, [mapId])
      expect(await fails(db, `select public.link_open($1)`, [link_token])).toBe('MN410')
      await db.query(`select * from public.share_link_set($1, 'view')`, [mapId])
      const reset = await one<{ link_token: string }>(
        db,
        `select * from public.share_link_reset($1)`,
        [mapId],
      )
      expect(reset.link_token).not.toBe(link_token)
      expect(await fails(db, `select public.link_open($1)`, [link_token])).toBe('MN404')
      expect(
        (await one<{ j: unknown }>(db, `select public.link_open($1) as j`, [reset.link_token])).j,
      ).toBeTruthy()
      await db.query('rollback to savepoint s1')
    })
  })

  it('an expired link stops working', async () => {
    const token = 'E'.repeat(43)
    await admin(
      `update public.maps set link_access = 'view', link_token = $2, link_expires_at = now() - interval '1 minute' where id = $1`,
      [mapId, token],
    )
    try {
      expect(await code(asAnon((db) => db.query(`select public.link_open($1)`, [token])))).toBe(
        'MN410',
      )
    } finally {
      await admin(
        `update public.maps set link_access = 'off', link_token = null, link_expires_at = null where id = $1`,
        [mapId],
      )
    }
  })

  it('works without an account, but joining needs one', async () => {
    const token = (
      await asUser(owner, (db) =>
        db.query(`select * from public.share_link_set($1, 'edit')`, [mapId]),
      )
    ).rows[0].link_token
    // That transaction was rolled back: set the link for real for the anon checks.
    await admin(`update public.maps set link_access = 'edit', link_token = $2 where id = $1`, [
      mapId,
      token,
    ])
    try {
      const anon = await asAnon((db) => db.query(`select public.link_open($1) as j`, [token]))
      expect(anon.rows[0].j.access).toBe('edit')
      expect(await code(asAnon((db) => db.query(`select public.link_join($1)`, [token])))).toBe(
        PERMISSION_DENIED,
      )
      expect(
        await code(asAnon((db) => db.query(`select * from public.share_settings($1)`, [mapId]))),
      ).toBe(PERMISSION_DENIED)
    } finally {
      await admin(`update public.maps set link_access = 'off', link_token = null where id = $1`, [
        mapId,
      ])
    }
  })

  it('an edit link makes a signed-in visitor an editor; a view link does not', async () => {
    await asUser(owner, async (db) => {
      const { link_token } = await one<{ link_token: string }>(
        db,
        `select * from public.share_link_set($1, 'view')`,
        [mapId],
      )
      await as(db, stranger)
      expect(await fails(db, `select public.link_join($1)`, [link_token])).toBe(PERMISSION_DENIED)
      await as(db, owner)
      await db.query(`select * from public.share_link_set($1, 'edit')`, [mapId])
      await as(db, stranger)
      expect(
        (await one<{ m: string }>(db, `select public.link_join($1) as m`, [link_token])).m,
      ).toBe(mapId)
      expect((await one<{ r: string }>(db, `select public.map_role($1) as r`, [mapId])).r).toBe(
        'editor',
      )
      await as(db, viewer)
      await db.query(`select public.link_join($1)`, [link_token])
      expect((await one<{ r: string }>(db, `select public.map_role($1) as r`, [mapId])).r).toBe(
        'editor',
      )
      await as(db, owner)
      const ev = await db.query(
        `select action from public.share_events where map_id = $1 order by at`,
        [mapId],
      )
      expect(ev.rows.map((r) => r.action)).toEqual([
        'link_created',
        'link_changed',
        'link_joined',
        'link_joined',
      ])
    })
  })
})

describe('invites and members', () => {
  it('owner invites by username or email; the friend accepts and joins', async () => {
    await asUser(owner, async (db) => {
      const inv = await one<{ invite_id: string; username: string }>(
        db,
        `select * from public.invite_member($1, '@SH_Friend', 'editor')`,
        [mapId],
      )
      expect(inv.username).toBe('sh_friend')
      // Same person again by email: updates the pending invite instead of adding one.
      const again = await one<{ invite_id: string }>(
        db,
        `select * from public.invite_member($1, 'SH-FRIEND@test.dev', 'viewer')`,
        [mapId],
      )
      expect(again.invite_id).toBe(inv.invite_id)
      const people = await db.query(
        `select kind, username, role from public.map_people($1) order by kind`,
        [mapId],
      )
      expect(people.rows).toEqual([
        { kind: 'invite', username: 'sh_friend', role: 'viewer' },
        { kind: 'member', username: 'sh_viewer', role: 'viewer' },
        { kind: 'owner', username: 'sh_owner', role: 'owner' },
      ])

      // The friend sees the invite (and the map title), but not the map yet.
      await as(db, friend)
      const mine = await db.query(
        `select map_title, role, inviter_username from public.my_invites()`,
      )
      expect(mine.rows).toEqual([
        { map_title: 'Cells', role: 'viewer', inviter_username: 'sh_owner' },
      ])
      expect((await db.query(`select id from public.maps where id = $1`, [mapId])).rowCount).toBe(0)
      await as(db, stranger)
      expect((await db.query(`select * from public.my_invites()`)).rowCount).toBe(0)
      expect((await db.query(`select id from public.map_invites`)).rowCount).toBe(0)
      expect(await fails(db, `select public.invite_respond($1, true)`, [inv.invite_id])).toBe(
        'MN404',
      )

      await as(db, friend)
      await db.query(`select public.invite_respond($1, true)`, [inv.invite_id])
      expect((await one<{ r: string }>(db, `select public.map_role($1) as r`, [mapId])).r).toBe(
        'viewer',
      )
      expect(await fails(db, `select public.invite_respond($1, false)`, [inv.invite_id])).toBe(
        'MN409',
      )
      await as(db, owner)
      expect(
        await fails(db, `select * from public.invite_member($1, 'sh_friend', 'editor')`, [mapId]),
      ).toBe('MN409')
    })
  })

  it('refuses unknown people, yourself, and non-owners', async () => {
    await asUser(owner, async (db) => {
      expect(
        await fails(db, `select * from public.invite_member($1, 'nobody_here', 'viewer')`, [mapId]),
      ).toBe('MN404')
      expect(
        await fails(db, `select * from public.invite_member($1, 'sh_owner', 'viewer')`, [mapId]),
      ).toBe('MN400')
      expect(
        await fails(db, `select * from public.invite_member($1, 'sh_friend', 'admin')`, [mapId]),
      ).toBe('MN400')
    })
    expect(
      await code(
        asUser(viewer, (db) =>
          db.query(`select * from public.invite_member($1, 'sh_friend', 'viewer')`, [mapId]),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('declining and cancelling leave no membership', async () => {
    await asUser(owner, async (db) => {
      const a = await one<{ invite_id: string }>(
        db,
        `select * from public.invite_member($1, 'sh_friend', 'viewer')`,
        [mapId],
      )
      await as(db, friend)
      await db.query(`select public.invite_respond($1, false)`, [a.invite_id])
      expect(
        (await one<{ r: string | null }>(db, `select public.map_role($1) as r`, [mapId])).r,
      ).toBeNull()
      await as(db, owner)
      const b = await one<{ invite_id: string }>(
        db,
        `select * from public.invite_member($1, 'sh_friend', 'viewer')`,
        [mapId],
      )
      await db.query(`select public.invite_cancel($1)`, [b.invite_id])
      await as(db, friend)
      expect(await fails(db, `select public.invite_respond($1, true)`, [b.invite_id])).toBe('MN409')
    })
  })

  it('owner changes roles and removes; members leave but cannot remove others', async () => {
    await asUser(viewer, async (db) => {
      expect(
        await fails(db, `select public.member_set_role($1, $2, 'editor')`, [mapId, viewer]),
      ).toBe(PERMISSION_DENIED)
      await as(db, owner)
      await db.query(`select public.member_set_role($1, $2, 'editor')`, [mapId, viewer])
      await as(db, viewer)
      expect((await one<{ r: string }>(db, `select public.map_role($1) as r`, [mapId])).r).toBe(
        'editor',
      )
      await db.query('savepoint s')
      await db.query(`select public.member_remove($1, $2)`, [mapId, viewer])
      expect(
        (await one<{ r: string | null }>(db, `select public.map_role($1) as r`, [mapId])).r,
      ).toBeNull()
      await db.query('rollback to savepoint s')
      await as(db, owner)
      await db.query(`select public.member_remove($1, $2)`, [mapId, viewer])
      const ev = await db.query(
        `select action from public.share_events where map_id = $1 order by at`,
        [mapId],
      )
      expect(ev.rows.map((r) => r.action)).toEqual(['role_changed', 'member_removed'])
    })
    expect(
      await code(
        asUser(stranger, (db) => db.query(`select public.member_remove($1, $2)`, [mapId, viewer])),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('limits invites per hour', async () => {
    await admin(
      `insert into public.share_events (map_id, actor_id, action) select $1, $2, 'invite_sent' from generate_series(1, 30)`,
      [mapId, owner],
    )
    try {
      expect(
        await code(
          asUser(owner, (db) =>
            db.query(`select * from public.invite_member($1, 'sh_friend', 'viewer')`, [mapId]),
          ),
        ),
      ).toBe('MN429')
    } finally {
      await admin(`delete from public.share_events where actor_id = $1`, [owner])
    }
  })
})

describe('copy and report', () => {
  it('a member copies the map into their own library (blocks, accepted links, sources)', async () => {
    await asUser(viewer, async (db) => {
      const { id } = await one<{ id: string }>(db, `select public.copy_map($1) as id`, [mapId])
      const m = await one<{ owner_id: string; title: string }>(
        db,
        `select owner_id, title from public.maps where id = $1`,
        [id],
      )
      expect(m).toEqual({ owner_id: viewer, title: 'Cells' })
      expect((await db.query(`select id from public.nodes where map_id = $1`, [id])).rowCount).toBe(
        4,
      )
      expect(
        (await db.query(`select id from public.relations where map_id = $1`, [id])).rowCount,
      ).toBe(1)
      const src = await one<{ chapter_node_id: string }>(
        db,
        `select chapter_node_id from public.sources where map_id = $1`,
        [id],
      )
      const ch = await one<{ map_id: string }>(
        db,
        `select map_id from public.nodes where id = $1`,
        [src.chapter_node_id],
      )
      expect(ch.map_id).toBe(id)
      // The tree is intact: every parent is in the copy.
      const orphans = await db.query(
        `select n.id from public.nodes n where n.map_id = $1 and n.parent_id is not null
           and not exists (select 1 from public.nodes p where p.id = n.parent_id and p.map_id = $1)`,
        [id],
      )
      expect(orphans.rowCount).toBe(0)
    })
    expect(
      await code(asUser(stranger, (db) => db.query(`select public.copy_map($1)`, [mapId]))),
    ).toBe('MN404')
  })

  it('a link visitor can copy too', async () => {
    await asUser(owner, async (db) => {
      const { link_token } = await one<{ link_token: string }>(
        db,
        `select * from public.share_link_set($1, 'view')`,
        [mapId],
      )
      await as(db, stranger)
      const { id } = await one<{ id: string }>(db, `select public.copy_map(p_token => $1) as id`, [
        link_token,
      ])
      expect(
        (
          await one<{ owner_id: string }>(db, `select owner_id from public.maps where id = $1`, [
            id,
          ])
        ).owner_id,
      ).toBe(stranger)
    })
  })

  it('reports: once per open report, never your own map, limited per day', async () => {
    await asUser(viewer, async (db) => {
      await db.query(`select public.report_map('spam', 'ads everywhere', $1)`, [mapId])
      expect(await fails(db, `select public.report_map('spam', '', $1)`, [mapId])).toBe('MN409')
      expect((await db.query(`select reason from public.reports`)).rows).toEqual([
        { reason: 'spam' },
      ])
      await as(db, owner)
      expect((await db.query(`select id from public.reports`)).rowCount).toBe(0) // reports are private
      expect(await fails(db, `select public.report_map('spam', '', $1)`, [mapId])).toBe('MN400')
    })
    await admin(
      `insert into public.share_events (map_id, actor_id, action) select $1, $2, 'map_reported' from generate_series(1, 5)`,
      [mapId, viewer],
    )
    try {
      expect(
        await code(
          asUser(viewer, (db) => db.query(`select public.report_map('other', '', $1)`, [mapId])),
        ),
      ).toBe('MN429')
    } finally {
      await admin(`delete from public.share_events where actor_id = $1`, [viewer])
    }
  })

  it('nobody writes sharing tables directly', async () => {
    for (const sql of [
      `insert into public.map_invites (map_id, invitee_id, role) values ('${'0'.repeat(8)}-0000-0000-0000-000000000000', '${'0'.repeat(8)}-0000-0000-0000-000000000000', 'viewer')`,
      `insert into public.share_events (action) values ('link_reset')`,
      `insert into public.reports (map_id, reporter_id, reason) values ('${'0'.repeat(8)}-0000-0000-0000-000000000000', '${'0'.repeat(8)}-0000-0000-0000-000000000000', 'spam')`,
      `select public.share_log(null, 'link_reset')`,
    ])
      expect(await code(asUser(owner, (db) => db.query(sql)))).toBe(PERMISSION_DENIED)
  })
})

describe('two friends share a map safely (Phase 5 "done when")', () => {
  it('invite → accept → edit; link → view; reset → old link dead; stranger sees nothing', async () => {
    await asUser(owner, async (db) => {
      // Lina invites Mona as editor; Mona accepts and can edit the map.
      const inv = await one<{ invite_id: string }>(
        db,
        `select * from public.invite_member($1, 'sh_friend', 'editor')`,
        [mapId],
      )
      await as(db, friend)
      await db.query(`select public.invite_respond($1, true)`, [inv.invite_id])
      const upd = await db.query(
        `update public.nodes set title = 'Osmosis (edited)' where id = $1`,
        [blockId],
      )
      expect(upd.rowCount).toBe(1)
      // Mona cannot share further or see the link secret.
      expect(await fails(db, `select * from public.share_settings($1)`, [mapId])).toBe(
        PERMISSION_DENIED,
      )
      expect(
        await fails(db, `select * from public.invite_member($1, 'sh_stranger', 'viewer')`, [mapId]),
      ).toBe(PERMISSION_DENIED)
      // Lina turns on a view link: a stranger can read through it, but not write or list.
      await as(db, owner)
      const { link_token } = await one<{ link_token: string }>(
        db,
        `select * from public.share_link_set($1, 'view')`,
        [mapId],
      )
      await as(db, stranger)
      expect(
        (
          await one<{ j: { nodes: unknown[] } }>(db, `select public.link_open($1) as j`, [
            link_token,
          ])
        ).j.nodes,
      ).toHaveLength(4)
      expect(
        (await db.query(`update public.nodes set title = 'x' where id = $1`, [blockId])).rowCount,
      ).toBe(0)
      expect((await db.query(`select id from public.maps where id = $1`, [mapId])).rowCount).toBe(0)
      // Lina resets the link: the old one is dead for everyone.
      await as(db, owner)
      await db.query(`select * from public.share_link_reset($1)`, [mapId])
      await as(db, stranger)
      expect(await fails(db, `select public.link_open($1)`, [link_token])).toBe('MN404')
      // Mona leaves; she loses access.
      await as(db, friend)
      await db.query(`select public.member_remove($1, $2)`, [mapId, friend])
      expect(
        (await db.query(`select id from public.nodes where map_id = $1`, [mapId])).rowCount,
      ).toBe(0)
    })
  })
})
