/**
 * The quality report after a build (owner, 2026-11-03): how much of the notes the AI mapped by
 * itself, how many formulas it found, and which sections look weak enough to redo. The safety
 * nets fill every gap anyway; this tells the student where the AI struggled.
 */
export interface SectionQuality {
  title: string
  /** Points in the section's source (lines or sentences with something to say). */
  points: number
  /** Points the AI's reply left out (the coverage net added them back). */
  missed: number
  formulas: number
  blocks: number
}

/** Share of all points the AI mapped by itself, 0..1; null before any section is measured. */
export function overallCoverage(q: Record<string, SectionQuality>): number | null {
  const all = Object.values(q)
  const points = all.reduce((n, s) => n + s.points, 0)
  if (!all.length) return null
  if (!points) return 1
  return (points - all.reduce((n, s) => n + s.missed, 0)) / points
}

/**
 * Sections worth a redo: the AI left out more than a quarter of the points, made a crowd of
 * blocks (more than 16), or squeezed a section with several points into a single block.
 */
export function weakSections(q: Record<string, SectionQuality>): string[] {
  return Object.entries(q)
    .filter(
      ([, s]) =>
        (s.points >= 3 && s.missed / s.points > 0.25) ||
        s.blocks > 16 ||
        (s.points >= 4 && s.blocks <= 1),
    )
    .map(([id]) => id)
}
