import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asAnon, asUser, createUser, errorCode, pool, resetData } from './helpers'

let owner: string, viewer: string, stranger: string
let mapId: string, arMapId: string

const search = (u: string, q: string) =>
  asUser(u, (db) =>
    db.query<{
      kind: string
      map_title: string
      title: string
      snippet: string
      node_id: string | null
    }>('select kind, map_title, title, snippet, node_id from public.search_all($1)', [q]),
  ).then((r) => r.rows)

beforeAll(async () => {
  await resetData()
  owner = await createUser('q-owner@test.dev', { username: 'q_owner' })
  viewer = await createUser('q-viewer@test.dev', { username: 'q_viewer' })
  stranger = await createUser('q-stranger@test.dev', { username: 'q_stranger' })
  mapId = (
    await admin(
      `insert into public.maps (owner_id, type, title) values ($1, 'book', 'Human Biology') returning id`,
      [owner],
    )
  ).rows[0].id
  arMapId = (
    await admin(
      `insert into public.maps (owner_id, type, title) values ($1, 'notes', 'علم الأحياء') returning id`,
      [owner],
    )
  ).rows[0].id
  await admin(
    `insert into public.map_members (map_id, user_id, role, invited_by) values ($1, $2, 'viewer', $3)`,
    [mapId, viewer, owner],
  )
  const root = (
    await admin(
      `insert into public.nodes (map_id, level, title) values ($1, 'book', 'Human Biology') returning id`,
      [mapId],
    )
  ).rows[0].id
  const chapter = (
    await admin(
      `insert into public.nodes (map_id, parent_id, level, title) values ($1, $2, 'chapter', 'Membranes & Transport') returning id`,
      [mapId, root],
    )
  ).rows[0].id
  const block = (
    await admin(
      `insert into public.nodes (map_id, parent_id, level, title, summary, details) values ($1, $2, 'block', 'Zellen und Gewebe', 'Bau der Zelle', $3) returning id`,
      [
        mapId,
        chapter,
        JSON.stringify([{ kind: 'bullet', text: 'Die Zellmembran trennt innen und außen' }]),
      ],
    )
  ).rows[0].id
  await admin(
    `insert into public.cards (map_id, node_id, type, front, back, origin, source_key) values ($1, $2, 'vocab', 'die Zellmembran', 'cell membrane', 'auto', 'v:1')`,
    [mapId, block],
  )
  await admin(
    `insert into public.sources (map_id, chapter_node_id, paragraphs) values ($1, $2, $3)`,
    [
      mapId,
      chapter,
      JSON.stringify([
        { n: 1, text: 'Cells are small.' },
        { n: 2, text: 'The pump keeps the inside negative (membrane potential).' },
      ]),
    ],
  )
  const arRoot = (
    await admin(
      `insert into public.nodes (map_id, level, title) values ($1, 'book', 'علم الأحياء') returning id`,
      [arMapId],
    )
  ).rows[0].id
  await admin(
    `insert into public.nodes (map_id, parent_id, level, title, summary) values ($1, $2, 'block', 'الغشاءُ الخلويّ', 'يحيط بالخلية')`,
    [arMapId, arRoot],
  )
})

afterAll(async () => {
  await resetData()
  await pool.end()
})

describe('search_all', () => {
  it('finds titles, details, cards and source text, best first', async () => {
    const rows = await search(owner, 'membran')
    expect(rows.map((r) => r.kind)).toEqual(['node', 'node', 'card', 'source'])
    expect(rows[0]).toMatchObject({ title: 'Membranes & Transport', map_title: 'Human Biology' })
    expect(rows[1]?.title).toBe('Zellen und Gewebe') // matched in its details
    expect(rows[3]?.snippet).toContain('membrane potential')
    expect(rows[3]?.node_id).not.toBeNull() // opens at the chapter
    // The map's own title node is not repeated next to the map.
    expect((await search(owner, 'human bio')).map((r) => r.kind)).toEqual(['map'])
  })

  it('matches German word forms and ignores Arabic spelling variants', async () => {
    expect((await search(owner, 'Zelle')).some((r) => r.title === 'Zellen und Gewebe')).toBe(true)
    expect((await search(owner, 'ZELLMEMBRAN')).map((r) => r.kind)).toContain('card')
    const ar = await search(owner, 'غشاء الخلوي')
    expect(ar[0]).toMatchObject({ kind: 'node', title: 'الغشاءُ الخلويّ' })
    expect((await search(owner, 'الاحياء'))[0]).toMatchObject({ kind: 'map' })
  })

  it('only searches maps the caller can open', async () => {
    expect((await search(viewer, 'membran')).length).toBe(4)
    expect(await search(viewer, 'غشاء')).toEqual([])
    expect(await search(stranger, 'membran')).toEqual([])
    expect(
      await errorCode(asAnon((db) => db.query(`select * from public.search_all('membran')`))),
    ).not.toBeNull()
  })

  it('needs two characters and treats LIKE wildcards literally', async () => {
    expect(await search(owner, 'm')).toEqual([])
    expect(await search(owner, '%%')).toEqual([])
    expect(await search(owner, '__')).toEqual([])
  })
})
