import { describe, expect, it } from 'vitest'
import { blockNodes, makeNode, sectionNodes } from '@/ai/pipeline/convert'
import { covered, ensureCoverage, keywords, sourceLines } from '@/ai/pipeline/coverage'
import { ensureFormulas, findEquations, sameFormula } from '@/ai/pipeline/formulas'
import { splitParagraphs } from '@/ai/pipeline/prepare'
import type { Paragraph } from '@/ai/prompts/shared'
import { DetailsResponseSchema, detailsSchemaFor, type DetailsResponse } from '@/ai/schemas/details'
import { normalizeOutline, type OutlineResponse } from '@/ai/schemas/outline'
import { computeLayout } from '@/features/workspace/canvas/layout'
import type { NodeRow } from '@/lib/database.types'
import { INPUTS } from '../fixtures/mapping-inputs'

/**
 * Mapping integrity (owner, 2026-11-03: "check that the mapping is giving the whole data in
 * proper way"). The AI cannot run in tests, so every input goes through the app's whole path
 * around it, with replies that make the mistakes models make: forgetting lines and formulas,
 * copying a formula onto every block, and paraphrasing. Nothing in the notes may be lost, every
 * formula must appear once, and the result must be a valid, readable map.
 */

const MAP = '9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70'
const words = (s: string) =>
  s
    .replace(/^\s*(?:[*•\-–]|\d+[.)])\s+/gm, '')
    .split(/\s+/)
    .filter(Boolean)

/** An outline the way models return it: out of order, with gaps between sections. */
function messyOutline(count: number): OutlineResponse {
  const third = Math.max(1, Math.floor(count / 3))
  const sections = [
    { title: 'Second part', from: third + 2, to: Math.min(count, third * 2) },
    { title: 'First part', from: 2, to: third },
    { title: 'Last part', from: Math.min(count, third * 2 + 2), to: count },
  ]
    .filter((s, i, all) => s.from <= s.to && all.findIndex((x) => x.from === s.from) === i)
    .map((s) => ({
      title: s.title,
      summary: '',
      shape: 'tree' as const,
      paragraphs: { from: s.from, to: s.to },
      subsections: [],
    }))
  return {
    sections: sections.length
      ? sections
      : [
          {
            ...sections[0],
            title: 'All',
            summary: '',
            shape: 'tree',
            paragraphs: { from: 1, to: count },
            subsections: [],
          },
        ],
  } as OutlineResponse
}

type Mode = 'forgetful' | 'copier' | 'paraphrase'

/** A details reply for one section, with a model's typical mistakes. */
function fakeReply(ps: Paragraph[], mode: Mode): DetailsResponse {
  const lines = ps.flatMap((p) =>
    sourceLines(p)
      .filter((l) => keywords(l).length >= 3)
      .map((l) => ({ l, p: p.n })),
  )
  const firstEq = ps.flatMap((p) => findEquations(p.text))[0]
  const kept = mode === 'forgetful' ? lines.filter((_, i) => i % 3 !== 2) : lines
  const blocks = (kept.length ? kept : [{ l: ps[0]?.text ?? 'Notes', p: ps[0]?.n ?? 1 }])
    .slice(0, 12)
    .map(({ l, p }, i) => {
      const kws = keywords(l)
      const summary =
        mode === 'paraphrase'
          ? kws.filter((_, j) => j % 2 === 0).join(' ')
          : kws.slice(0, 8).join(' ')
      return {
        key: `b${i + 1}`,
        parent: i % 4 !== 0 ? `b${i - (i % 4) + 1}` : null,
        title: kws.slice(0, 3).join(' ') || `Block ${i + 1}`,
        summary: summary.slice(0, 200),
        type: 'concept' as const,
        importance: 'supporting' as const,
        details: mode === 'copier' && firstEq ? [{ kind: 'formula' as const, text: firstEq }] : [],
        source: [p],
        added: false,
      }
    })
  return DetailsResponseSchema.parse({ blocks, relations: [], flashcards: [] })
}

/** Every formula detail of a reply, as LaTeX. */
const formulasIn = (r: DetailsResponse) =>
  r.blocks.flatMap((b) => b.details.filter((d) => d.kind === 'formula').map((d) => d.text))

for (const input of INPUTS) {
  describe(`mapping integrity: ${input.name}`, () => {
    const paragraphs = splitParagraphs(input.text)
    const outline = normalizeOutline(messyOutline(paragraphs.length), paragraphs.length)
    const rangeOf = (s: OutlineResponse['sections'][number]) =>
      paragraphs.filter((p) => p.n >= s.paragraphs.from && p.n <= s.paragraphs.to)

    it('splits the notes into paragraphs without losing a word', () => {
      expect(paragraphs.length).toBeGreaterThan(0)
      expect(words(paragraphs.map((p) => p.text).join('\n'))).toEqual(words(input.text))
    })

    it('gives every paragraph to exactly one section, in order', () => {
      const owners = paragraphs.map(
        (p) =>
          outline.sections.filter((s) => p.n >= s.paragraphs.from && p.n <= s.paragraphs.to).length,
      )
      expect(owners.every((n) => n === 1)).toBe(true)
      const starts = outline.sections.map((s) => s.paragraphs.from)
      expect(starts).toEqual([...starts].sort((a, b) => a - b))
    })

    for (const mode of ['forgetful', 'copier', 'paraphrase'] as const) {
      it(`keeps every line and formula when the AI is ${mode}`, () => {
        const results = outline.sections.map((s) => {
          const ps = rangeOf(s)
          const raw = fakeReply(ps, mode)
          return { ps, raw, out: ensureCoverage(ensureFormulas(raw, ps), ps) }
        })

        // The forgetful AI dropped every third line: the net must have put them back.
        const restored = results.reduce(
          (n, r) =>
            n + r.out.blocks.flatMap((b) => b.details.filter((d) => d.kind === 'bullet')).length,
          0,
        )
        if (mode === 'forgetful') expect(restored).toBeGreaterThan(0)
        else expect(restored).toBe(0)

        // Every equation in the notes appears exactly once, as a formula.
        const all = results.flatMap((r) => formulasIn(r.out))
        const eqs = paragraphs.flatMap((p) => findEquations(p.text))
        expect(eqs).toHaveLength(input.equations)
        for (const eq of eqs)
          expect(
            all.filter((f) => sameFormula(f, eq)),
            eq,
          ).toHaveLength(1)
        expect(all).toHaveLength(input.equations)

        for (const { ps, raw, out } of results) {
          // Every line with something to say is on the map.
          const stems = new Set(
            out.blocks
              .flatMap((b) =>
                keywords([b.title, b.summary, ...b.details.map((d) => d.text)].join(' ')),
              )
              .map((w) => w.slice(0, Math.max(4, Math.min(5, w.length - 1)))),
          )
          for (const p of ps)
            for (const line of sourceLines(p))
              if (keywords(line).length >= 3)
                expect(covered(line, stems) || findEquations(line).length > 0, line).toBe(true)

          // Paraphrased replies already cover everything: nothing is added twice.
          if (mode === 'paraphrase')
            expect(
              out.blocks.flatMap((b) => b.details.filter((d) => d.kind === 'bullet')),
            ).toHaveLength(0)

          // Still a valid reply (empty link labels are filled in by the map's language).
          const named = {
            ...out,
            relations: out.relations.map((r) => ({ ...r, label: r.label || 'x' })),
          }
          const check = detailsSchemaFor(paragraphs.length).safeParse(named)
          expect(check.success, JSON.stringify(check.error?.issues?.slice(0, 2))).toBe(true)
          // Every block cites paragraphs of its own section.
          for (const b of out.blocks)
            for (const n of b.source) expect(ps.some((p) => p.n === n)).toBe(true)
          expect(out.blocks.length).toBeGreaterThanOrEqual(raw.blocks.length)
        }
      })
    }

    it('turns the result into a map where every card has a place and none overlap', () => {
      const root = makeNode({ map_id: MAP, level: 'chapter', title: 'Notes' })
      const sections = sectionNodes(outline, { mapId: MAP, lang: input.lang, rootId: root.id })
      const nodes: NodeRow[] = [root, ...sections]
      outline.sections.forEach((s, i) => {
        const ps = rangeOf(s)
        const out = ensureCoverage(ensureFormulas(fakeReply(ps, 'forgetful'), ps), ps)
        const section = sections[i] as NodeRow
        const made = blockNodes(out, { mapId: MAP, section, lang: input.lang })
        // Formulas come first on every card that has one.
        for (const n of made.nodes) {
          const k = n.details.map((d) => d.kind)
          if (k.includes('formula')) expect(k[0]).toBe('formula')
        }
        nodes.push(...made.nodes)
      })
      const L = computeLayout(nodes)
      const blocks = nodes.filter((n) => n.level === 'block')
      for (const n of nodes) expect(L.boxes[n.id], n.title).toBeDefined()
      const boxes = blocks.map(
        (b) => L.boxes[b.id] as { x: number; y: number; w: number; h: number },
      )
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i] as (typeof boxes)[number]
          const b = boxes[j] as (typeof boxes)[number]
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
          expect(apart, `${blocks[i]?.title} / ${blocks[j]?.title}`).toBe(true)
        }
    })
  })
}
