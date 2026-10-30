import { z } from 'zod'
import { BranchShapeSchema, LIMITS, paragraphNumber, summarySchema, titleSchema } from './common'

const rangeSchema = z
  .object({ from: paragraphNumber, to: paragraphNumber })
  .refine((r) => r.from <= r.to, { message: 'paragraphs.from must be <= paragraphs.to' })

export const OutlineSubsectionSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  paragraphs: rangeSchema,
})

export const OutlineSectionSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  shape: BranchShapeSchema,
  paragraphs: rangeSchema,
  subsections: z.array(OutlineSubsectionSchema).max(LIMITS.maxSubsections).default([]),
})

/** Shape sent to the provider (no cross-field checks; JSON-schema friendly). */
export const OutlineResponseSchema = z.object({
  sections: z.array(OutlineSectionSchema).min(1).max(LIMITS.maxSections),
})

export type OutlineResponse = z.infer<typeof OutlineResponseSchema>
export type OutlineSection = z.infer<typeof OutlineSectionSchema>

/**
 * Full validation for a chapter with `paragraphCount` paragraphs: every range must be inside
 * P1..Pn and sections must not overlap. Gaps are allowed here and filled by normalizeOutline.
 */
export function outlineSchemaFor(paragraphCount: number) {
  return OutlineResponseSchema.superRefine((outline, ctx) => {
    const sorted = outline.sections
      .map((s, i) => ({ ...s.paragraphs, i }))
      .sort((a, b) => a.from - b.from)

    outline.sections.forEach((s, i) => {
      if (s.paragraphs.to > paragraphCount) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections', i, 'paragraphs', 'to'],
          message: `Paragraph P${s.paragraphs.to} does not exist; the chapter has P1 to P${paragraphCount}.`,
        })
      }
      s.subsections.forEach((sub, j) => {
        if (sub.paragraphs.from < s.paragraphs.from || sub.paragraphs.to > s.paragraphs.to) {
          ctx.addIssue({
            code: 'custom',
            path: ['sections', i, 'subsections', j, 'paragraphs'],
            message: `Subsection range P${sub.paragraphs.from}-P${sub.paragraphs.to} must be inside its section P${s.paragraphs.from}-P${s.paragraphs.to}.`,
          })
        }
      })
    })

    for (let k = 1; k < sorted.length; k++) {
      const prev = sorted[k - 1]
      const cur = sorted[k]
      if (prev && cur && cur.from <= prev.to) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections', cur.i, 'paragraphs'],
          message: `Sections overlap at P${cur.from}. Every paragraph must belong to exactly one section.`,
        })
      }
    }
  })
}

/**
 * Sorts sections by position and closes gaps so every paragraph belongs to exactly one section:
 * a gap is given to the section before it (or the first section for leading paragraphs).
 */
export function normalizeOutline(
  outline: OutlineResponse,
  paragraphCount: number,
): OutlineResponse {
  const sections = [...outline.sections].sort((a, b) => a.paragraphs.from - b.paragraphs.from)
  return {
    sections: sections.map((s, i) => {
      const next = sections[i + 1]
      const from = i === 0 ? 1 : s.paragraphs.from
      const to = next ? next.paragraphs.from - 1 : paragraphCount
      return { ...s, paragraphs: { from, to: Math.max(from, to) } }
    }),
  }
}
