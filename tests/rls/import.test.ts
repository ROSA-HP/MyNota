import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkSection } from '../../mcp/check'
import type { Draft, DraftChapter } from '../../mcp/draft'
import { buildPlan } from '../../mcp/payload'
import {
  PERMISSION_DENIED,
  admin,
  createUser,
  errorCode,
  pool,
  resetData,
  type Db,
} from './helpers'

// Admin mapping through MCP (20261104090000_admin_import_map.sql): the only way a map built with
// the local server reaches the database, so it is where "admins only" is really enforced.

let boss: string, otherAdmin: string, student: string

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

const CALL = `select public.admin_import_map($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb) as r`

interface Part {
  map: string
  nodes?: unknown[]
  relations?: unknown[]
  sources?: unknown[]
  details?: unknown
  type?: string
}

const args = (p: Part) => [
  p.map,
  'Physics',
  p.type ?? 'book',
  ['en'],
  JSON.stringify(p.nodes ?? []),
  JSON.stringify(p.relations ?? []),
  JSON.stringify(p.sources ?? []),
  JSON.stringify(p.details ?? {}),
]

function sampleMap() {
  const map = randomUUID()
  const book = randomUUID()
  const chapter = randomUUID()
  const section = randomUUID()
  const a = randomUUID()
  const b = randomUUID()
  const source = randomUUID()
  const relation = randomUUID()
  const nodes = [
    { id: book, level: 'book', title: 'Physics', importance: 'core', origin: 'user' },
    {
      id: chapter,
      parent_id: book,
      level: 'chapter',
      title: 'Waves',
      color: 'yellow',
      origin: 'user',
    },
    { id: section, parent_id: chapter, level: 'section', title: 'Light', branch_view: 'process' },
    {
      id: a,
      parent_id: section,
      level: 'block',
      title: 'Diffraction',
      summary: 'Light spreads out.',
      type: 'definition',
      importance: 'core',
      details: [{ kind: 'bullet', text: 'Stronger in narrow gaps.' }],
      source: { paragraphs: [1] },
      lang: 'en',
      collapsed: true,
    },
    { id: b, parent_id: section, sort_order: 1, level: 'block', title: 'Fringes', type: 'concept' },
  ]
  const relations = [
    {
      id: relation,
      from_node: a,
      to_node: b,
      type: 'causes',
      label: 'makes fringes',
      status: 'suggested',
      confidence: 'high',
    },
  ]
  const sources = [
    {
      id: source,
      chapter_node_id: chapter,
      kind: 'text',
      paragraphs: [{ n: 1, text: 'Light spreads.' }],
    },
  ]
  return { map, nodes, relations, sources, ids: { book, chapter, section, a, b } }
}

beforeAll(async () => {
  await resetData()
  await admin(
    `insert into public.app_settings (key, value) values
       ('limits.maps_per_day', '30'), ('limits.blocks_per_map', '5000'), ('features.signups', 'true')
     on conflict (key) do update set value = excluded.value`,
  )
  boss = await createUser('im-boss@test.dev', { username: 'im_boss' })
  otherAdmin = await createUser('im-other@test.dev', { username: 'im_other' })
  student = await createUser('im-student@test.dev', { username: 'im_student' })
  await admin(`update public.profiles set role = 'admin' where id = any($1)`, [[boss, otherAdmin]])
})

afterAll(async () => {
  await resetData()
  await pool.end()
})

describe('who may import', () => {
  it('refuses a student, even with a two-factor session', async () => {
    const s = sampleMap()
    await as(student, 'aal2', async (db) => {
      expect(await fails(db, CALL, args(s))).toBe(PERMISSION_DENIED)
      expect((await db.query('select 1 from public.maps')).rowCount).toBe(0)
    })
  })

  it('refuses an admin without a two-factor session', async () => {
    const s = sampleMap()
    await as(boss, 'aal1', async (db) => {
      expect(await fails(db, CALL, args(s))).toBe(PERMISSION_DENIED)
    })
  })

  it('refuses a suspended admin', async () => {
    await admin(`update public.profiles set status = 'suspended' where id = $1`, [otherAdmin])
    const s = sampleMap()
    await as(otherAdmin, 'aal2', async (db) => {
      expect(await fails(db, CALL, args(s))).toBe(PERMISSION_DENIED)
    })
    await admin(`update public.profiles set status = 'active' where id = $1`, [otherAdmin])
  })

  it('cannot be called without signing in', async () => {
    const s = sampleMap()
    const db = await pool.connect()
    try {
      await db.query('begin')
      await db.query('set local role anon')
      expect(await errorCode(db.query(CALL, args(s)))).toBe(PERMISSION_DENIED)
    } finally {
      await db.query('rollback')
      db.release()
    }
  })
})

describe('importing', () => {
  it('writes the whole map, owned by the admin, whatever the caller claims', async () => {
    const s = sampleMap()
    await as(boss, 'aal2', async (db) => {
      const nodes = s.nodes.map((n) => ({ ...n, map_id: randomUUID(), created_by: student }))
      const { rows } = await db.query(CALL, args({ ...s, nodes }))
      expect(rows[0].r).toMatchObject({ new_map: true, nodes: 5, relations: 1, sources: 1 })

      const map = (
        await db.query('select owner_id, type, title, languages from public.maps where id = $1', [
          s.map,
        ])
      ).rows[0]
      expect(map).toMatchObject({
        owner_id: boss,
        type: 'book',
        title: 'Physics',
        languages: ['en'],
      })

      const stored = (await db.query('select * from public.nodes where map_id = $1', [s.map])).rows
      expect(stored).toHaveLength(5)
      expect(stored.every((n) => n.created_by === boss)).toBe(true)
      const block = stored.find((n) => n.id === s.ids.a)
      expect(block).toMatchObject({
        level: 'block',
        type: 'definition',
        importance: 'core',
        origin: 'ai',
        collapsed: true,
        position: null,
      })
      expect(block.details).toEqual([{ kind: 'bullet', text: 'Stronger in narrow gaps.' }])
      expect(block.source).toEqual({ paragraphs: [1] })
      expect(stored.find((n) => n.id === s.ids.section).branch_view).toBe('process')

      const relation = (await db.query('select * from public.relations where map_id = $1', [s.map]))
        .rows[0]
      expect(relation).toMatchObject({
        status: 'suggested',
        confidence: 'high',
        label: 'makes fringes',
        created_by: boss,
      })

      const source = (await db.query('select * from public.sources where map_id = $1', [s.map]))
        .rows[0]
      expect(source).toMatchObject({ chapter_node_id: s.ids.chapter, created_by: boss })
    })
  })

  it('writes the audit log, with counts the caller cannot overwrite', async () => {
    const s = sampleMap()
    await as(boss, 'aal2', async (db) => {
      await db.query(CALL, args({ ...s, details: { via: 'mcp', mapper: 'mapper.v1', nodes: 999 } }))
      const row = (
        await db.query(`select * from public.admin_audit() where target_id = $1`, [s.map])
      ).rows[0]
      expect(row).toMatchObject({ actor_id: boss, action: 'map_imported', target_type: 'map' })
      expect(row.details).toMatchObject({
        via: 'mcp',
        mapper: 'mapper.v1',
        nodes: 5,
        new_map: true,
      })
    })
  })

  it('takes a book in parts, and a part sent twice adds nothing', async () => {
    const s = sampleMap()
    await as(boss, 'aal2', async (db) => {
      const first = { map: s.map, nodes: s.nodes.slice(0, 2) }
      const second = {
        map: s.map,
        nodes: s.nodes.slice(2),
        relations: s.relations,
        sources: s.sources,
      }
      await db.query(CALL, args(first))
      const { rows } = await db.query(CALL, args(second))
      expect(rows[0].r).toMatchObject({ new_map: false, nodes: 3, relations: 1, sources: 1 })

      const again = await db.query(CALL, args(second))
      expect(again.rows[0].r).toMatchObject({ nodes: 0, relations: 0, sources: 0 })
      expect(
        (await db.query('select 1 from public.nodes where map_id = $1', [s.map])).rowCount,
      ).toBe(5)
    })
  })

  it('writes nothing at all when a part is invalid', async () => {
    const s = sampleMap()
    await as(boss, 'aal2', async (db) => {
      const nodes = [
        ...s.nodes,
        {
          id: randomUUID(),
          parent_id: s.ids.section,
          level: 'block',
          title: 'Bad',
          type: 'nonsense',
        },
      ]
      expect(await fails(db, CALL, args({ ...s, nodes }))).toBe('23514')
      expect((await db.query('select 1 from public.maps where id = $1', [s.map])).rowCount).toBe(0)
      expect(
        (await db.query('select 1 from public.nodes where map_id = $1', [s.map])).rowCount,
      ).toBe(0)
    })
  })

  it('keeps the normal limits for admins too', async () => {
    await admin(`update public.app_settings set value = '0' where key = 'limits.maps_per_day'`)
    const s = sampleMap()
    await as(boss, 'aal2', async (db) => {
      expect(await fails(db, CALL, args(s))).toBe('MN429')
    })
    await admin(`update public.app_settings set value = '30' where key = 'limits.maps_per_day'`)
  })

  it("refuses a node parented into another person's map", async () => {
    const theirs = (
      await admin(
        `insert into public.maps (owner_id, type, title) values ($1, 'notes', 'Private') returning id`,
        [student],
      )
    ).rows[0].id
    const theirNode = (
      await admin(
        `insert into public.nodes (map_id, level, title) values ($1, 'chapter', 'Mine') returning id`,
        [theirs],
      )
    ).rows[0].id
    const s = sampleMap()
    await as(boss, 'aal2', async (db) => {
      const nodes = [{ id: randomUUID(), parent_id: theirNode, level: 'block', title: 'Intruder' }]
      expect(await fails(db, CALL, args({ map: s.map, nodes }))).toBe('23503')
    })
  })
})

describe('the mapper', () => {
  /** A two-chapter book, made by the real code, so the rows are what the mapper really sends. */
  function book(): Draft {
    const paragraphs = [
      {
        n: 1,
        text: 'Light spreads out behind a narrow opening, called diffraction of waves.',
        page: 1,
      },
      { n: 2, text: 'Dark fringes appear where a sin θ = m λ holds for the slit width.', page: 1 },
    ]
    const answer = {
      blocks: [
        {
          key: 'b1',
          parent: null,
          title: 'Diffraction',
          summary: 'Light spreads behind an opening.',
          type: 'definition',
          importance: 'core',
          details: [{ kind: 'bullet', text: 'Seen behind a narrow opening.' }],
          source: [1],
          added: false,
        },
        {
          key: 'b2',
          parent: null,
          title: 'Dark fringes',
          summary: 'Their places follow from slit width.',
          type: 'formula',
          importance: 'supporting',
          details: [
            { kind: 'formula', text: 'a \\sin\\theta = m \\lambda', extra: 'a = slit width' },
          ],
          source: [2],
          added: false,
        },
        {
          key: 'b3',
          parent: 'b2',
          title: 'Fringe order',
          summary: 'Counts the fringes outward from the centre of the pattern.',
          type: 'key_fact',
          importance: 'extra',
          details: [{ kind: 'bullet', text: 'm is a whole number.' }],
          source: [2],
          added: true,
          added_reason: 'A note for the test.',
        },
      ],
      relations: [{ from: 'b1', to: 'b2', type: 'leads_to', label: 'makes dark fringes' }],
      flashcards: [{ block: 'b1', front: 'What is diffraction?', back: 'Light spreading out.' }],
    }
    const checked = checkSection(answer, {
      paragraphs,
      numbers: [1, 2],
      paragraphCount: 2,
      shape: 'tree',
    })
    if (!checked.ok) throw new Error(checked.errors.join(' '))
    const chapter = (title: string): DraftChapter => ({
      title,
      kind: 'chapter',
      firstPage: 1,
      lastPage: 1,
      paragraphs,
      outline: {
        sections: [
          {
            title: 'Light',
            summary: 'How light spreads.',
            shape: 'tree',
            paragraphs: { from: 1, to: 2 },
            subsections: [],
          },
        ],
      },
      sections: [{ answer: checked.answer, report: checked.report, rounds: 1 }],
      links: [],
    })
    return {
      id: 'd_000000000000',
      title: 'Physics',
      mapType: 'book',
      mode: 'textbook',
      detail: 'standard',
      language: 'en',
      explanationLanguage: null,
      source: {
        kind: 'pdf',
        file: { name: 'book.pdf', size: 1000, hash: 'a'.repeat(64) },
        pageCount: 2,
        pagesWithoutText: [],
      },
      chapters: [chapter('Waves'), chapter('Optics')],
      bookLinks: [
        {
          from: '1.1.b1',
          to: '2.1.b2',
          type: 'prerequisite',
          label: 'needed for fringes',
          confidence: 'high',
        },
      ],
      createdAt: '',
      updatedAt: '',
      publishedMapId: null,
    }
  }

  it('sends rows the database accepts, and they read back like a map from the app', async () => {
    const plan = buildPlan(book())
    expect(plan.parts.length).toBe(4)
    await as(boss, 'aal2', async (db) => {
      for (const part of plan.parts) {
        await db.query(CALL, [
          plan.mapId,
          plan.title,
          plan.type,
          plan.languages,
          JSON.stringify(part.nodes),
          JSON.stringify(part.relations),
          JSON.stringify(part.sources),
          JSON.stringify({ via: 'mcp' }),
        ])
      }
      const nodes = (await db.query('select * from public.nodes where map_id = $1', [plan.mapId]))
        .rows
      const count = (level: string) => nodes.filter((n) => n.level === level).length
      expect([count('book'), count('chapter'), count('section'), count('block')]).toEqual([
        1, 2, 2, 6,
      ])
      expect(nodes.every((n) => n.position === null)).toBe(true)

      const block = nodes.find((n) => n.title === 'Dark fringes')
      expect(block.collapsed).toBe(true)
      expect(block.details[0]).toMatchObject({
        kind: 'formula',
        latex: 'a \\sin\\theta = m \\lambda',
      })
      const added = nodes.find((n) => n.title === 'Fringe order')
      expect(added).toMatchObject({ ai_added: true, ai_added_reason: 'A note for the test.' })

      const relations = (
        await db.query('select * from public.relations where map_id = $1', [plan.mapId])
      ).rows
      expect(relations.filter((r) => r.status === 'accepted')).toHaveLength(2)
      expect(relations.filter((r) => r.status === 'suggested')).toHaveLength(1)

      const sources = (
        await db.query('select * from public.sources where map_id = $1', [plan.mapId])
      ).rows
      expect(sources).toHaveLength(2)
      expect(sources[0].paragraphs[0]).toMatchObject({ n: 1, page: 1 })

      // The library and search see it like any other map.
      const stats = (await db.query('select * from public.map_stats($1)', [[plan.mapId]])).rows[0]
      expect(stats.blocks).toBe(6)
      const found = (await db.query(`select * from public.search_all('fringes', 20)`)).rows
      expect(found.some((r) => r.map_id === plan.mapId)).toBe(true)
    })
  })
})

describe('what it refuses', () => {
  it("another admin's map", async () => {
    const s = sampleMap()
    const mine = (
      await admin(
        `insert into public.maps (id, owner_id, type, title) values ($1, $2, 'book', 'Theirs') returning id`,
        [s.map, otherAdmin],
      )
    ).rows[0].id
    await as(boss, 'aal2', async (db) => {
      expect(await fails(db, CALL, args({ map: mine, nodes: s.nodes }))).toBe(PERMISSION_DENIED)
    })
  })

  it('a map that has been opened, because the app would never show the new rows', async () => {
    const s = sampleMap()
    await admin(
      `insert into public.maps (id, owner_id, type, title) values ($1, $2, 'book', 'Opened')`,
      [s.map, boss],
    )
    await admin(
      `insert into public.map_doc_updates (map_id, doc_key, data, created_by) values ($1, 'book', '\\x00', $2)`,
      [s.map, boss],
    )
    await as(boss, 'aal2', async (db) => {
      expect(await fails(db, CALL, args(s))).toBe('MN409')
    })
  })

  it('a blank map type, lists that are not lists, and oversized calls', async () => {
    const s = sampleMap()
    await as(boss, 'aal2', async (db) => {
      expect(await fails(db, CALL, args({ ...s, type: 'blank' }))).toBe('MN400')
      const notList = args(s)
      notList[4] = '{"a": 1}'
      expect(await fails(db, CALL, notList)).toBe('MN400')
      const many = Array.from({ length: 2001 }, () => ({
        id: randomUUID(),
        level: 'block',
        title: 'x',
      }))
      expect(await fails(db, CALL, args({ ...s, nodes: many }))).toBe('MN400')
      expect(await fails(db, CALL, args({ ...s, details: { note: 'x'.repeat(20000) } }))).toBe(
        'MN400',
      )
    })
  })
})
