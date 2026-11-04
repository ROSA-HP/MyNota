// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { jsPDF } from 'jspdf'
import { loadDraft } from '../draft'
import { ToolError } from '../tools'
import { call, fakeDatabase, useTempData, type FakeDatabase } from './helpers'

let temp: ReturnType<typeof useTempData>
let db: FakeDatabase

beforeEach(() => {
  temp = useTempData()
  db = fakeDatabase()
})
afterEach(() => temp.done())

const NOTES = `Waves and light

Light spreads out behind a narrow opening, which physicists call diffraction of waves.
Diffraction becomes stronger when the opening gets narrower compared with the wavelength.

Single slit

Dark fringes appear where a sin θ = m λ holds for the slit width and the order number.
The central bright fringe stays twice as wide as all the other fringes around it.`

const OUTLINE = {
  sections: [
    {
      title: 'Waves and light',
      summary: 'Light spreads behind narrow openings.',
      shape: 'tree',
      paragraphs: { from: 1, to: 2 },
      subsections: [],
    },
    {
      title: 'Single slit',
      summary: 'Where the dark fringes fall.',
      shape: 'tree',
      paragraphs: { from: 3, to: 4 },
      subsections: [],
    },
  ],
}

const FIRST = {
  blocks: [
    {
      key: 'b1',
      parent: null,
      title: 'Diffraction',
      summary: 'Light spreads behind a narrow opening.',
      type: 'definition',
      importance: 'core',
      details: [
        { kind: 'bullet', text: 'Stronger when the opening gets narrower than the wavelength.' },
      ],
      source: [2],
      added: false,
    },
  ],
  relations: [],
  flashcards: [{ block: 'b1', front: 'What is diffraction?', back: 'Light spreading out.' }],
}

const SECOND = {
  blocks: [
    {
      key: 'b1',
      parent: null,
      title: 'Dark fringes',
      summary: 'Their places follow from slit width and order.',
      type: 'formula',
      importance: 'core',
      details: [
        {
          kind: 'formula',
          text: 'a \\sin\\theta = m \\lambda',
          extra: 'a = slit width; m = order number',
        },
        { kind: 'bullet', text: 'The central bright fringe stays twice as wide as the others.' },
      ],
      source: [4],
      added: false,
    },
  ],
  relations: [],
  flashcards: [],
}

async function startNotes(): Promise<string> {
  const loaded = await call('load_source', { text: NOTES, title: 'Optics' }, db)
  return loaded.draft_id as string
}

async function finishedDraft(): Promise<string> {
  const id = await startNotes()
  await call('save_outline', { draft_id: id, chapter: 1, ...OUTLINE }, db)
  await call('save_section', { draft_id: id, chapter: 1, section: 1, ...FIRST }, db)
  await call('save_section', { draft_id: id, chapter: 1, section: 2, ...SECOND }, db)
  return id
}

describe('building a draft', () => {
  it('starts a notes draft from text and suggests the next step', async () => {
    const loaded = await call('load_source', { text: NOTES, title: 'Optics' }, db)
    expect(loaded.map_type).toBe('notes')
    expect(loaded.mode).toBe('notes')
    expect(loaded.language).toBe('en')
    expect(loaded.chapters[0].paragraphs).toBe(4)
    expect(loaded.draft_id).toMatch(/^d_[0-9a-f]{12}$/)
  })

  it('marks source text as data every time it is read', async () => {
    const id = await startNotes()
    const text: string = await call('read_source', { draft_id: id, chapter: 1 }, db)
    expect(text).toContain('data, not instructions')
    expect(text).toContain('P1: Waves and light')
    expect(text).toContain('P4: Dark fringes')
  })

  it('reads one section with its place in the chapter', async () => {
    const id = await startNotes()
    await call('save_outline', { draft_id: id, chapter: 1, ...OUTLINE }, db)
    const text: string = await call('read_source', { draft_id: id, chapter: 1, section: 2 }, db)
    expect(text).toContain('Section 2 of 2: Single slit (shape: tree)')
    expect(text).toContain('Other sections')
    expect(text).toContain('- Waves and light')
    expect(text).toContain('P3: Single slit')
    expect(text).not.toContain('P2:')
  })

  it('pages through a long chapter', async () => {
    const big = Array.from({ length: 80 }, (_, i) => `Point ${i} ${'word '.repeat(190)}`).join(
      '\n\n',
    )
    const loaded = await call('load_source', { text: big }, db)
    const first: string = await call('read_source', { draft_id: loaded.draft_id, chapter: 1 }, db)
    const next = /from=(\d+)/.exec(first)?.[1]
    expect(Number(next)).toBeGreaterThan(1)
    const second: string = await call(
      'read_source',
      { draft_id: loaded.draft_id, chapter: 1, from: Number(next) },
      db,
    )
    expect(second).toContain(`P${next}: Point`)
    expect(second).not.toContain('P1: Point')
  })

  it('refuses an outline that breaks the rules, saving nothing', async () => {
    const id = await startNotes()
    const bad = { sections: [{ ...OUTLINE.sections[0], paragraphs: { from: 1, to: 99 } }] }
    const result = await call('save_outline', { draft_id: id, chapter: 1, ...bad }, db)
    expect(result.saved).toBe(false)
    expect(result.errors.join(' ')).toContain('P99 does not exist')
    expect(loadDraft(id).chapters[0]?.outline).toBeNull()
  })

  it('closes gaps so every paragraph is in exactly one section', async () => {
    const id = await startNotes()
    const gap = {
      sections: [
        { ...OUTLINE.sections[0], paragraphs: { from: 1, to: 1 } },
        { ...OUTLINE.sections[1], paragraphs: { from: 3, to: 3 } },
      ],
    }
    const result = await call('save_outline', { draft_id: id, chapter: 1, ...gap }, db)
    expect(result.sections.map((s: { paragraphs: string }) => s.paragraphs)).toEqual([
      'P1-P2',
      'P3-P4',
    ])
  })

  it('keeps finished sections when the outline changes elsewhere', async () => {
    const id = await finishedDraft()
    const renamed = {
      sections: [OUTLINE.sections[0], { ...OUTLINE.sections[1], title: 'The single slit' }],
    }
    const result = await call('save_outline', { draft_id: id, chapter: 1, ...renamed }, db)
    expect(result.sections[0].state).not.toBe('not_started')
    expect(result.sections[1].state).toBe('not_started')
  })

  it('renames a badly detected chapter', async () => {
    const id = await startNotes()
    await call(
      'save_outline',
      { draft_id: id, chapter: 1, chapter_title: 'Physical optics', ...OUTLINE },
      db,
    )
    expect(loadDraft(id).chapters[0]?.title).toBe('Physical optics')
  })
})

describe('checking a section', () => {
  let id: string
  beforeEach(async () => {
    id = await startNotes()
    await call('save_outline', { draft_id: id, chapter: 1, ...OUTLINE }, db)
  })
  const save = (section: number, answer: unknown) =>
    call('save_section', { draft_id: id, chapter: 1, section, ...(answer as object) }, db)

  it('refuses a broken answer, saving nothing, and says exactly what is wrong', async () => {
    const bad = { ...FIRST, blocks: [{ ...FIRST.blocks[0], parent: 'nobody' }] }
    const result = await save(1, bad)
    expect(result.saved).toBe(false)
    expect(result.errors.join(' ')).toContain('Parent "nobody" is not a block key')
    expect(loadDraft(id).chapters[0]?.sections[0]).toBeNull()
  })

  it('accepts a section that covers its source', async () => {
    const result = await save(1, FIRST)
    expect(result.saved).toBe(true)
    expect(result.fixes.filter((f: { rule: string }) => f.rule === 'point_missing')).toEqual([])
    expect(result.stats.coverage_percent).toBe(100)
  })

  it('names the points that are not on the map yet', async () => {
    const thin = {
      ...SECOND,
      blocks: [{ ...SECOND.blocks[0], details: [SECOND.blocks[0]!.details[0]] }],
    }
    const result = await save(2, thin)
    expect(result.saved).toBe(true)
    expect(result.status).toBe('needs_fixes')
    const missing = result.fixes.find((f: { rule: string }) => f.rule === 'point_missing')
    expect(missing.paragraph).toBe(4)
    expect(missing.message).toContain('central bright fringe')
  })

  it('names a formula the source has and the map does not', async () => {
    const noFormula = {
      ...SECOND,
      blocks: [
        {
          ...SECOND.blocks[0],
          type: 'concept',
          details: [SECOND.blocks[0]!.details[1]],
          source: [3, 4],
        },
      ],
    }
    const result = await save(2, noFormula)
    expect(result.fixes.map((f: { rule: string }) => f.rule)).toContain('formula_missing')
  })

  it('catches a backslash turned into a control character', async () => {
    const broken = {
      ...SECOND,
      blocks: [
        {
          ...SECOND.blocks[0],
          details: [{ kind: 'formula', text: 'a \\sin\theta = m \\lambda' }],
        },
      ],
    }
    const result = await save(2, broken)
    const escape = result.fixes.find((f: { rule: string }) => f.rule === 'formula_escape')
    expect(escape.message).toContain('written twice')
  })

  it('catches a formula copied onto a second block', async () => {
    const copied = {
      ...SECOND,
      blocks: [
        SECOND.blocks[0],
        {
          ...SECOND.blocks[0],
          key: 'b2',
          title: 'Order number',
          details: [SECOND.blocks[0]!.details[0]],
          source: [3],
        },
      ],
    }
    const result = await save(2, copied)
    expect(result.fixes.map((f: { rule: string }) => f.rule)).toContain('formula_copied')
  })

  it('catches a citation from another section and an uncited paragraph', async () => {
    const wrong = { ...SECOND, blocks: [{ ...SECOND.blocks[0], source: [1] }] }
    const result = await save(2, wrong)
    const rules = result.fixes.map((f: { rule: string }) => f.rule)
    expect(rules).toContain('citation_outside_section')
    expect(rules).toContain('paragraph_not_cited')
  })

  it('says which blocks would be folded and which arrows dropped', async () => {
    const tiny = {
      blocks: [
        FIRST.blocks[0],
        {
          ...FIRST.blocks[0],
          key: 'b2',
          parent: 'b1',
          title: 'Small point',
          summary: 'Short.',
          details: [],
        },
      ],
      relations: [{ from: 'b1', to: 'b2', type: 'related', label: 'related' }],
      flashcards: [],
    }
    const result = await save(1, tiny)
    const rules = result.fixes.map((f: { rule: string }) => f.rule)
    expect(rules).toContain('block_too_small')
    expect(rules).toContain('relation_dropped')
  })

  it('gives style advice as notes, which never hold a section back', async () => {
    const wordy = {
      ...FIRST,
      blocks: [
        {
          ...FIRST.blocks[0],
          title: 'A very long title with many words',
          summary: 'A summary that goes on for much longer than the ten words a card shows.',
        },
      ],
    }
    const result = await save(1, wordy)
    const rules = result.notes.map((n: { rule: string }) => n.rule)
    expect(rules).toEqual(expect.arrayContaining(['long_title', 'long_summary']))
  })

  it('counts the rounds and says when to move on', async () => {
    const thin = {
      ...SECOND,
      blocks: [{ ...SECOND.blocks[0], details: [SECOND.blocks[0]!.details[0]] }],
    }
    expect((await save(2, thin)).round).toBe(1)
    expect((await save(2, thin)).next).toContain('save this section again')
    const third = await save(2, thin)
    expect(third.round).toBe(3)
    expect(third.next).toContain('move on')
  })

  it('points to the next piece of work when a section is good', async () => {
    const result = await save(1, FIRST)
    if (result.status === 'good') expect(result.next).toContain('section 2')
    const status = await call('map_status', { draft_id: id }, db)
    expect(status.next).toContain('section 2')
    expect(status.sections_done).toBe('1 of 2')
  })
})

describe('headings in the source', () => {
  const HEADED = `Physical Optics and Diffraction
Core Concepts

* Diffraction is light spreading beyond a narrow path into the shadow region.

Single-Slit Diffraction

* The pattern shows a broad central maximum between narrower side bands.

Mitochondria produce cellular energy`

  const block = (source: number[], title: string, summary: string, detail: string) => ({
    blocks: [
      {
        key: 'b1',
        parent: null,
        title,
        summary,
        type: 'concept',
        importance: 'core',
        details: [{ kind: 'bullet', text: detail }],
        source,
        added: false,
      },
    ],
    relations: [],
    flashcards: [],
  })

  async function start(): Promise<string> {
    const loaded = await call('load_source', { text: HEADED, title: 'Physical Optics' }, db)
    const sections = [
      { title: 'Core concepts', summary: 'The basic idea.', from: 1, to: 2 },
      { title: 'Single-slit diffraction', summary: 'The pattern.', from: 3, to: 5 },
    ].map(({ from, to, ...s }) => ({
      ...s,
      shape: 'tree',
      paragraphs: { from, to },
      subsections: [],
    }))
    await call('save_outline', { draft_id: loaded.draft_id, chapter: 1, sections }, db)
    return loaded.draft_id
  }

  it('does not ask for a heading that is already a title', async () => {
    const id = await start()
    const answer = block(
      [2],
      'Diffraction',
      'Light spreads into the shadow region.',
      'Spreads beyond a narrow path.',
    )
    const result = await call(
      'save_section',
      { draft_id: id, chapter: 1, section: 1, ...answer },
      db,
    )
    expect(result.status).toBe('good')
    expect(result.fixes).toEqual([])
  })

  it('still asks for a short line that is a real point, not a heading', async () => {
    const id = await start()
    const answer = block(
      [4],
      'Slit pattern',
      'A broad central maximum between side bands.',
      'The side bands are narrower.',
    )
    const result = await call(
      'save_section',
      { draft_id: id, chapter: 1, section: 2, ...answer },
      db,
    )
    const missing = result.fixes.filter((f: { rule: string }) => f.rule === 'point_missing')
    expect(missing.map((f: { paragraph: number }) => f.paragraph)).toEqual([5])
    expect(missing[0].message).toContain('Mitochondria produce cellular energy')
  })

  it('keeps headings out of the published blocks, and real points in', async () => {
    const id = await start()
    await call(
      'save_section',
      {
        draft_id: id,
        chapter: 1,
        section: 1,
        ...block(
          [2],
          'Diffraction',
          'Light spreads into the shadow region.',
          'Beyond a narrow path.',
        ),
      },
      db,
    )
    await call(
      'save_section',
      {
        draft_id: id,
        chapter: 1,
        section: 2,
        ...block(
          [4],
          'Slit pattern',
          'A broad central maximum between side bands.',
          'Narrower bands.',
        ),
      },
      db,
    )
    await call('publish_map', { draft_id: id }, db)
    const text = JSON.stringify(
      db.calls.flatMap((c) => c.part.nodes).filter((n) => n.level === 'block'),
    )
    expect(text).not.toContain('Physical Optics and Diffraction')
    expect(text).not.toContain('Core Concepts')
    expect(text).toContain('Mitochondria produce cellular energy')
  })
})

describe('resuming', () => {
  it('finds a draft again from a new chat', async () => {
    const id = await startNotes()
    const status = await call('map_status', {}, db)
    expect(status.admin).toBe(true)
    expect(status.message).toBe('Ready.')
    expect(status.drafts.map((d: { draft_id: string }) => d.draft_id)).toContain(id)
  })

  it('tells a person who is not signed in what to do, and never asks for a password', async () => {
    const out = fakeDatabase()
    out.identity = async () => ({ signedIn: false, email: null, admin: false })
    const status = await call('map_status', {}, out)
    expect(status.message).toContain('npm run mcp:login')
    expect(status.message).toContain('Never ask for their password')
  })

  it('refuses a draft id that tries to leave the drafts folder', async () => {
    await expect(call('map_status', { draft_id: '../../secret' }, db)).rejects.toThrow(
      /not a draft id/,
    )
  })
})

describe('links', () => {
  it('lists blocks with refs and keeps only good links', async () => {
    const id = await finishedDraft()
    const listed = await call('list_blocks', { draft_id: id, chapter: 1 }, db)
    expect(listed.blocks.join('\n')).toContain('1.2.b1 | Dark fringes')
    expect(listed.max_links).toBe(1)

    const good = {
      from: '1.1.b1',
      to: '1.2.b1',
      type: 'leads_to',
      label: 'explains dark fringes',
      confidence: 'high',
    }
    const result = await call(
      'save_links',
      {
        draft_id: id,
        chapter: 1,
        links: [
          good,
          { ...good, from: '1.1.nothing' },
          { ...good, to: '1.1.b1' },
          { ...good, label: 'related' },
          { ...good, label: 'one more link' },
        ],
      },
      db,
    )
    expect(result.saved).toBe(1)
    expect(result.dropped.map((d: { reason: string }) => d.reason)).toEqual([
      'unknown block ref',
      'both ends are in the same part',
      'the label says nothing specific',
      'over the limit of 1',
    ])
  })
})

describe('publishing', () => {
  it('sends the map in order: parents first, every reference known', async () => {
    const id = await finishedDraft()
    await call(
      'save_links',
      {
        draft_id: id,
        chapter: 1,
        links: [
          {
            from: '1.1.b1',
            to: '1.2.b1',
            type: 'leads_to',
            label: 'explains dark fringes',
            confidence: 'high',
          },
        ],
      },
      db,
    )
    const result = await call('publish_map', { draft_id: id }, db)
    expect(result.published).toBe(true)
    expect(result.blocks).toBeGreaterThanOrEqual(2)
    expect(result.suggested).toBe(1)
    expect(result.open).toContain(`/maps/${result.map_id}`)

    const nodes = db.calls.flatMap((c) => c.part.nodes)
    const seen = new Set<string>()
    for (const n of nodes) {
      if (n.parent_id) expect(seen.has(n.parent_id)).toBe(true)
      seen.add(n.id as string)
    }
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length)
    expect(nodes.map((n) => n.level).filter((l) => l === 'chapter')).toHaveLength(1)
    expect(nodes.filter((n) => n.level === 'section').map((n) => n.title)).toEqual([
      'Waves and light',
      'Single slit',
    ])
    for (const r of db.calls.flatMap((c) => c.part.relations)) {
      expect(seen.has(r.from_node as string) && seen.has(r.to_node as string)).toBe(true)
    }
    const link = db.calls.flatMap((c) => c.part.relations).find((r) => r.status === 'suggested')
    expect(link?.confidence).toBe('high')
  })

  it('stores blocks like the app: no layout, citations kept, flashcards as questions', async () => {
    const id = await finishedDraft()
    await call('publish_map', { draft_id: id }, db)
    const nodes = db.calls.flatMap((c) => c.part.nodes)
    expect(nodes.every((n) => !('position' in n))).toBe(true)
    const block = nodes.find((n) => n.title === 'Diffraction')
    expect(block?.level).toBe('block')
    expect(block?.origin).toBe('ai')
    expect(block?.source).toEqual({ paragraphs: [2] })
    expect(block?.details).toContainEqual({
      kind: 'question',
      front: 'What is diffraction?',
      back: 'Light spreading out.',
    })
    const fringes = nodes.find((n) => n.title === 'Dark fringes')
    expect(fringes?.details?.[0]).toMatchObject({ kind: 'formula' })
  })

  it('saves the source paragraphs with the chapter, and never sends them to the audit log', async () => {
    const id = await finishedDraft()
    await call('publish_map', { draft_id: id }, db)
    const sources = db.calls.flatMap((c) => c.part.sources)
    expect(sources).toHaveLength(1)
    expect(sources[0]?.paragraphs).toHaveLength(4)
    expect(sources[0]?.kind).toBe('text')
    const details = JSON.stringify(db.calls.map((c) => c.details))
    expect(details).not.toContain('Dark fringes')
    expect(details).toContain('mapper.v1')
  })

  it('refuses when the database does not accept the session as an admin', async () => {
    const id = await finishedDraft()
    const student = fakeDatabase(false)
    await expect(call('publish_map', { draft_id: id }, student)).rejects.toThrow(/not accept/)
    expect(student.calls).toEqual([])
  })

  it('refuses when nobody is signed in, keeping the draft', async () => {
    const id = await finishedDraft()
    const out = fakeDatabase()
    out.identity = async () => ({ signedIn: false, email: null, admin: false })
    await expect(call('publish_map', { draft_id: id }, out)).rejects.toThrow(/mcp:login/)
    expect(loadDraft(id).publishedMapId).toBeNull()
  })

  it('refuses unfinished work unless the admin allows it', async () => {
    const id = await startNotes()
    await call('save_outline', { draft_id: id, chapter: 1, ...OUTLINE }, db)
    await call('save_section', { draft_id: id, chapter: 1, section: 1, ...FIRST }, db)
    await expect(call('publish_map', { draft_id: id }, db)).rejects.toThrow(
      /section 2 is not written/,
    )
    const result = await call('publish_map', { draft_id: id, allow_incomplete: true }, db)
    expect(result.published).toBe(true)
  })

  it('refuses a draft with nothing mapped', async () => {
    const id = await startNotes()
    await expect(call('publish_map', { draft_id: id, allow_incomplete: true }, db)).rejects.toThrow(
      /Nothing has been mapped/,
    )
  })

  it('continues after a lost connection without sending anything twice', async () => {
    const id = await finishedDraft()
    const original = db.importPart.bind(db)
    let count = 0
    db.importPart = async (args) => {
      if (++count === 2) throw new Error('connection lost')
      return original(args)
    }
    await expect(call('publish_map', { draft_id: id }, db)).rejects.toBeInstanceOf(ToolError)
    expect(db.calls).toHaveLength(1)
    const mapId = db.calls[0]?.mapId

    const result = await call('publish_map', { draft_id: id }, db)
    expect(result.map_id).toBe(mapId)
    expect(db.calls).toHaveLength(2)
    expect(new Set(db.calls.map((c) => c.mapId)).size).toBe(1)
  })

  it('publishes a draft only once and then keeps it closed', async () => {
    const id = await finishedDraft()
    await call('publish_map', { draft_id: id }, db)
    await expect(call('publish_map', { draft_id: id }, db)).rejects.toThrow(/already published/)
    await expect(
      call('save_section', { draft_id: id, chapter: 1, section: 1, ...FIRST }, db),
    ).rejects.toThrow(/already published/)
  })

  it('explains what the database refused', async () => {
    const id = await finishedDraft()
    db.failNext = Object.assign(new Error('daily map limit reached'), { code: 'MN429' })
    await expect(call('publish_map', { draft_id: id }, db)).rejects.toThrow(/limit was reached/)
    db.failNext = Object.assign(new Error('admins only'), { code: '42501' })
    await expect(call('publish_map', { draft_id: id }, db)).rejects.toThrow(/two-factor/)
    db.failNext = Object.assign(new Error('not found'), { code: 'PGRST202' })
    await expect(call('publish_map', { draft_id: id }, db)).rejects.toThrow(/20261104090000/)
  })
})

describe('a book', () => {
  function pdf(): string {
    const doc = new jsPDF()
    const titles = ['Chapter 1: Waves', 'Chapter 2: Optics', 'Index']
    titles.forEach((title, i) => {
      if (i) doc.addPage()
      doc.setFontSize(26).text(title, 20, 30)
      doc.setFontSize(11)
      for (let l = 0; l < 6; l++) {
        doc.text(
          `Light is a wave that spreads out behind an opening number ${i}${l}.`,
          20,
          50 + l * 8,
        )
      }
    })
    const path = join(temp.dir, 'book.pdf')
    writeFileSync(path, new Uint8Array(doc.output('arraybuffer')))
    return path
  }

  async function startBook(): Promise<{ id: string; chapters: Array<{ paragraphs: number }> }> {
    const loaded = await call('load_source', { path: pdf(), title: 'Physics' }, db)
    return { id: loaded.draft_id, chapters: loaded.chapters }
  }

  const answerFor = (to: number) => ({
    blocks: [
      {
        key: 'b1',
        parent: null,
        title: 'Waves',
        summary: 'Light spreads out behind an opening.',
        type: 'concept',
        importance: 'core',
        details: [],
        source: Array.from({ length: to }, (_, i) => i + 1),
        added: false,
      },
    ],
    relations: [],
    flashcards: [],
  })

  const outlineFor = (to: number) => ({
    sections: [
      {
        title: 'Waves',
        summary: 'Waves.',
        shape: 'tree',
        paragraphs: { from: 1, to },
        subsections: [],
      },
    ],
  })

  it('suggests skipping the index, and publishes chapters in order with a source each', async () => {
    const { id, chapters } = await startBook()
    expect(chapters).toHaveLength(3)
    for (const n of [1, 2]) {
      const to = chapters[n - 1]?.paragraphs ?? 1
      await call('save_outline', { draft_id: id, chapter: n, ...outlineFor(to) }, db)
      await call('save_section', { draft_id: id, chapter: n, section: 1, ...answerFor(to) }, db)
    }
    const result = await call('publish_map', { draft_id: id }, db)
    expect(result.chapters).toBe(2)

    const nodes = db.calls.flatMap((c) => c.part.nodes)
    expect(nodes[0]).toMatchObject({ level: 'book', title: 'Physics', parent_id: null })
    expect(nodes.filter((n) => n.level === 'chapter').map((n) => n.title)).toEqual([
      'Chapter 1: Waves',
      'Chapter 2: Optics',
    ])
    expect(nodes.filter((n) => n.level === 'chapter').map((n) => n.color)).toEqual([
      'yellow',
      'coral',
    ])
    const sources = db.calls.flatMap((c) => c.part.sources)
    expect(sources).toHaveLength(2)
    expect(sources[0]).toMatchObject({ kind: 'pdf', pages: 1, file_name: 'book.pdf' })
    expect(sources[0]?.file_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(db.calls[0]?.type).toBe('book')
  })

  it('links chapters of a book, across chapters only', async () => {
    const { id, chapters } = await startBook()
    for (const n of [1, 2]) {
      const to = chapters[n - 1]?.paragraphs ?? 1
      await call('save_outline', { draft_id: id, chapter: n, ...outlineFor(to) }, db)
      await call('save_section', { draft_id: id, chapter: n, section: 1, ...answerFor(to) }, db)
    }
    const listed = await call('list_blocks', { draft_id: id }, db)
    expect(listed.scope).toBe('book')
    expect(listed.link_across).toBe('chapters')
    const saved = await call(
      'save_links',
      {
        draft_id: id,
        links: [
          {
            from: '1.1.b1',
            to: '2.1.b1',
            type: 'prerequisite',
            label: 'needed for optics',
            confidence: 'medium',
          },
        ],
      },
      db,
    )
    expect(saved.saved).toBe(1)
    const result = await call('publish_map', { draft_id: id }, db)
    expect(result.suggested).toBe(1)
    const last = db.calls.at(-1)
    expect(last?.part.relations).toHaveLength(1)
    expect(last?.part.nodes).toEqual([])
  })

  it('keeps an unmapped chapter ready to build later in the app', async () => {
    const { id, chapters } = await startBook()
    const to = chapters[0]?.paragraphs ?? 1
    await call('save_outline', { draft_id: id, chapter: 1, ...outlineFor(to) }, db)
    await call('save_section', { draft_id: id, chapter: 1, section: 1, ...answerFor(to) }, db)
    await expect(call('publish_map', { draft_id: id }, db)).rejects.toThrow(
      /chapter 2 has no outline/,
    )
    const result = await call('publish_map', { draft_id: id, allow_incomplete: true }, db)
    expect(result.chapters).toBe(2)
    expect(db.calls.flatMap((c) => c.part.sources)).toHaveLength(2)
  })

  it('includes a skipped part only if it was mapped', async () => {
    const { id, chapters } = await startBook()
    const to = chapters[2]?.paragraphs ?? 1
    await call('save_outline', { draft_id: id, chapter: 3, ...outlineFor(to) }, db)
    await call('save_section', { draft_id: id, chapter: 3, section: 1, ...answerFor(to) }, db)
    await call('publish_map', { draft_id: id, allow_incomplete: true }, db)
    const titles = db.calls
      .flatMap((c) => c.part.nodes)
      .filter((n) => n.level === 'chapter')
      .map((n) => n.title)
    expect(titles).toContain('Index')
  })
})
