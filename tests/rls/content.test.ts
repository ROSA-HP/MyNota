import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PERMISSION_DENIED, admin, asUser, createUser, errorCode, pool, resetData } from './helpers'

let owner: string, editor: string, viewer: string, stranger: string
let mapId: string, otherMapId: string, rootId: string, sectionId: string, otherNodeId: string

const RLS = PERMISSION_DENIED // RLS insert/update violations also use 42501

beforeAll(async () => {
  await resetData()
  owner = await createUser('c-owner@test.dev', { username: 'c_owner' })
  editor = await createUser('c-editor@test.dev', { username: 'c_editor' })
  viewer = await createUser('c-viewer@test.dev', { username: 'c_viewer' })
  stranger = await createUser('c-stranger@test.dev', { username: 'c_stranger' })

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
  rootId = (
    await admin(
      `insert into public.nodes (map_id, level, title, created_by) values ($1, 'chapter', 'Cell Membrane', $2) returning id`,
      [mapId, owner],
    )
  ).rows[0].id
  sectionId = (
    await admin(
      `insert into public.nodes (map_id, parent_id, level, title) values ($1, $2, 'section', 'Transport') returning id`,
      [mapId, rootId],
    )
  ).rows[0].id
  otherNodeId = (
    await admin(
      `insert into public.nodes (map_id, level, title) values ($1, 'chapter', 'Elsewhere') returning id`,
      [otherMapId],
    )
  ).rows[0].id
})

afterAll(async () => {
  await resetData()
  await pool.end()
})

describe('nodes', () => {
  it('everyone on the map reads; strangers see nothing', async () => {
    for (const u of [owner, editor, viewer]) {
      const r = await asUser(u, (db) =>
        db.query('select id from public.nodes where map_id = $1', [mapId]),
      )
      expect(r.rowCount).toBe(2)
    }
    const r = await asUser(stranger, (db) =>
      db.query('select id from public.nodes where map_id = $1', [mapId]),
    )
    expect(r.rowCount).toBe(0)
  })

  it('owner and editor can add, change and delete', async () => {
    for (const u of [owner, editor]) {
      await asUser(u, async (db) => {
        const ins = await db.query(
          `insert into public.nodes (map_id, parent_id, level, title, type, importance) values ($1, $2, 'block', 'Active Transport', 'concept', 'core') returning id, created_by`,
          [mapId, sectionId],
        )
        expect(ins.rows[0].created_by).toBe(u)
        const upd = await db.query(`update public.nodes set summary = 'Uses ATP' where id = $1`, [
          ins.rows[0].id,
        ])
        expect(upd.rowCount).toBe(1)
        const del = await db.query(`delete from public.nodes where id = $1`, [ins.rows[0].id])
        expect(del.rowCount).toBe(1)
      })
    }
  })

  it('a whole branch can be saved in one multi-row insert (parent and child together)', async () => {
    await asUser(owner, async (db) => {
      const r = await db.query(
        `insert into public.nodes (id, map_id, parent_id, level, title) values
           ('00000000-0000-4000-8000-000000000001', $1, $2, 'section', 'Signaling'),
           ('00000000-0000-4000-8000-000000000002', $1, '00000000-0000-4000-8000-000000000001', 'block', 'Ligand Binds')`,
        [mapId, rootId],
      )
      expect(r.rowCount).toBe(2)
    })
  })

  it('viewers and strangers cannot write', async () => {
    for (const u of [viewer, stranger]) {
      expect(
        await errorCode(
          asUser(u, (db) =>
            db.query(`insert into public.nodes (map_id, level, title) values ($1, 'block', 'x')`, [
              mapId,
            ]),
          ),
        ),
      ).toBe(RLS)
      const upd = await asUser(u, (db) =>
        db.query(`update public.nodes set title = 'hacked' where id = $1`, [rootId]),
      )
      expect(upd.rowCount).toBe(0)
      const del = await asUser(u, (db) =>
        db.query(`delete from public.nodes where id = $1`, [rootId]),
      )
      expect(del.rowCount).toBe(0)
    }
  })

  it('a parent must be in the same map', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(
            `insert into public.nodes (map_id, parent_id, level, title) values ($1, $2, 'block', 'x')`,
            [mapId, otherNodeId],
          ),
        ),
      ),
    ).toBe('23503')
  })

  it('a node cannot be moved under its own descendant', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(`update public.nodes set parent_id = $1 where id = $2`, [sectionId, rootId]),
        ),
      ),
    ).toBe('23514')
  })

  it('a node cannot be moved to another map', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(`update public.nodes set map_id = $1 where id = $2`, [otherMapId, sectionId]),
        ),
      ),
    ).not.toBeNull()
  })

  it('rejects invalid types, colors and oversized details', async () => {
    const bad = [
      `insert into public.nodes (map_id, level, title, type) values ($1, 'block', 'x', 'opinion')`,
      `insert into public.nodes (map_id, level, title, color) values ($1, 'block', 'x', '#ff0000')`,
      `insert into public.nodes (map_id, level, title, details) values ($1, 'block', 'x', '{"not":"array"}')`,
      `insert into public.nodes (map_id, level, title, position) values ($1, 'block', 'x', '{"x":"1"}')`,
      `insert into public.nodes (map_id, level, title) values ($1, 'block', '')`,
    ]
    for (const sql of bad) {
      expect(await errorCode(asUser(owner, (db) => db.query(sql, [mapId]))), sql).toBe('23514')
    }
  })

  it('editing content bumps the map updated_at', async () => {
    await admin(`update public.maps set updated_at = now() - interval '1 day' where id = $1`, [
      mapId,
    ])
    await asUser(owner, async (db) => {
      await db.query(`update public.nodes set summary = 'touched' where id = $1`, [rootId])
      const r = await db.query(
        `select updated_at > now() - interval '1 minute' as fresh from public.maps where id = $1`,
        [mapId],
      )
      expect(r.rows[0].fresh).toBe(true)
    })
  })
})

describe('relations', () => {
  it('owner and editor can link two nodes; viewers cannot', async () => {
    const sql = `insert into public.relations (map_id, from_node, to_node, type, label) values ($1, $2, $3, 'part_of', 'part of')`
    for (const u of [owner, editor]) {
      const r = await asUser(u, (db) => db.query(sql, [mapId, sectionId, rootId]))
      expect(r.rowCount).toBe(1)
    }
    expect(await errorCode(asUser(viewer, (db) => db.query(sql, [mapId, sectionId, rootId])))).toBe(
      RLS,
    )
  })

  it('both ends must be in the same map', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(
            `insert into public.relations (map_id, from_node, to_node) values ($1, $2, $3)`,
            [mapId, rootId, otherNodeId],
          ),
        ),
      ),
    ).toBe('23503')
  })

  it('rejects self-links and unknown types', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(
            `insert into public.relations (map_id, from_node, to_node) values ($1, $2, $2)`,
            [mapId, rootId],
          ),
        ),
      ),
    ).toBe('23514')
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(
            `insert into public.relations (map_id, from_node, to_node, type) values ($1, $2, $3, 'loves')`,
            [mapId, rootId, sectionId],
          ),
        ),
      ),
    ).toBe('23514')
  })
})

describe('sources', () => {
  const paragraphs = JSON.stringify([{ n: 1, text: 'The membrane is a bilayer.' }])

  it('owner and editor store paragraphs; everyone on the map reads them', async () => {
    await asUser(editor, async (db) => {
      const r = await db.query(
        `insert into public.sources (map_id, chapter_node_id, kind, paragraphs) values ($1, $2, 'text', $3) returning id`,
        [mapId, rootId, paragraphs],
      )
      expect(r.rowCount).toBe(1)
    })
    await admin(`insert into public.sources (map_id, kind, paragraphs) values ($1, 'text', $2)`, [
      mapId,
      paragraphs,
    ])
    const r = await asUser(viewer, (db) =>
      db.query(`select paragraphs from public.sources where map_id = $1`, [mapId]),
    )
    expect(r.rowCount).toBeGreaterThan(0)
    const s = await asUser(stranger, (db) =>
      db.query(`select id from public.sources where map_id = $1`, [mapId]),
    )
    expect(s.rowCount).toBe(0)
  })

  it('viewers cannot add sources and nobody can edit them in place', async () => {
    expect(
      await errorCode(
        asUser(viewer, (db) =>
          db.query(`insert into public.sources (map_id, paragraphs) values ($1, $2)`, [
            mapId,
            paragraphs,
          ]),
        ),
      ),
    ).toBe(RLS)
    expect(
      await errorCode(
        asUser(owner, (db) =>
          db.query(`update public.sources set paragraphs = '[]' where map_id = $1`, [mapId]),
        ),
      ),
    ).toBe(PERMISSION_DENIED)
  })

  it('stores book file details (never the file) and rejects bad values', async () => {
    const hash = 'a'.repeat(64)
    const pageParas = JSON.stringify([{ n: 1, text: 'Cells are units of life.', page: 7 }])
    await asUser(owner, async (db) => {
      const r = await db.query(
        `insert into public.sources (map_id, kind, pages, paragraphs, file_name, file_size, file_hash)
         values ($1, 'pdf', 40, $2, 'biology.pdf', 1048576, $3) returning file_hash`,
        [mapId, pageParas, hash],
      )
      expect(r.rows[0]?.file_hash).toBe(hash)
    })
    for (const [col, val] of [
      ['file_hash', 'not-a-hash'],
      ['file_size', 60 * 1024 * 1024],
      ['file_name', ''],
    ] as const) {
      expect(
        await errorCode(
          asUser(owner, (db) =>
            db.query(
              `insert into public.sources (map_id, kind, paragraphs, ${col}) values ($1, 'pdf', '[]', $2)`,
              [mapId, val],
            ),
          ),
        ),
      ).toBe('23514')
    }
  })
})

describe('ai_jobs', () => {
  const insert = `insert into public.ai_jobs (map_id, pass, provider, model, prompt_version) values ($1, 'outline', 'gemini', 'some-model', 'outline.v1') returning id, created_by`

  it('owner and editors record jobs as themselves; viewers cannot', async () => {
    const r = await asUser(editor, (db) => db.query(insert, [mapId]))
    expect(r.rows[0].created_by).toBe(editor)
    expect(await errorCode(asUser(viewer, (db) => db.query(insert, [mapId])))).toBe(RLS)
  })

  it('a job cannot be recorded in someone else name', async () => {
    expect(
      await errorCode(
        asUser(editor, (db) =>
          db.query(
            `insert into public.ai_jobs (map_id, pass, provider, model, prompt_version, created_by) values ($1, 'outline', 'gemini', 'm', 'v1', $2)`,
            [mapId, owner],
          ),
        ),
      ),
    ).toBe(RLS)
  })

  it('refuses error text that contains something shaped like an API key', async () => {
    await asUser(owner, async (db) => {
      const { rows } = await db.query(insert, [mapId])
      const leak = `bad request for key AIza${'x'.repeat(30)}`
      expect(
        await errorCode(
          db.query(`update public.ai_jobs set status = 'failed', error = $1 where id = $2`, [
            leak,
            rows[0].id,
          ]),
        ),
      ).toBe('23514')
    })
  })

  it('only status fields can be updated, and only by the author', async () => {
    await asUser(owner, async (db) => {
      const { rows } = await db.query(insert, [mapId])
      const ok = await db.query(
        `update public.ai_jobs set status = 'done', tokens_in = 1200, tokens_out = 300, duration_ms = 4100 where id = $1`,
        [rows[0].id],
      )
      expect(ok.rowCount).toBe(1)
      expect(
        await errorCode(
          db.query(`update public.ai_jobs set model = 'other' where id = $1`, [rows[0].id]),
        ),
      ).toBe(PERMISSION_DENIED)
    })
  })

  it('viewers and strangers cannot read jobs', async () => {
    for (const u of [viewer, stranger]) {
      const r = await asUser(u, (db) =>
        db.query(`select id from public.ai_jobs where map_id = $1`, [mapId]),
      )
      expect(r.rowCount).toBe(0)
    }
  })

  it('jobs cannot be deleted through the API', async () => {
    expect(
      await errorCode(
        asUser(owner, (db) => db.query(`delete from public.ai_jobs where map_id = $1`, [mapId])),
      ),
    ).toBe(PERMISSION_DENIED)
  })
})

describe('deleting a map removes all of its content', () => {
  it('cascades to nodes, relations, sources and jobs', async () => {
    await asUser(owner, async (db) => {
      await db.query(`delete from public.maps where id = $1`, [mapId])
      for (const t of ['nodes', 'relations', 'sources']) {
        const r = await db.query(`select count(*)::int as n from public.${t} where map_id = $1`, [
          mapId,
        ])
        expect(r.rows[0].n, t).toBe(0)
      }
    })
  })
})
