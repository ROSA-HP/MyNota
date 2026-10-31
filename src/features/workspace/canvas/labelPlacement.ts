export interface Pt {
  x: number
  y: number
}
export interface RectLike {
  x: number
  y: number
  w: number
  h: number
}

/** Points along a link tried for its label (t from 0.1 to 0.9), nearest the middle first. */
const TRIES = Array.from({ length: 21 }, (_, i) => 0.1 + i * 0.04).sort(
  (a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5),
)

const overlapArea = (a: RectLike, b: RectLike) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

/**
 * Where to put a link's label: the point nearest the middle of the curve whose label box does
 * not cover another card, so a long link never hides a block's title. When every point
 * touches something, the one covering the least.
 */
export function pickLabelPoint(
  at: (t: number) => Pt,
  obstacles: RectLike[],
  size: { w: number; h: number } = { w: 96, h: 26 },
): Pt {
  let best: { p: Pt; area: number } | null = null
  for (const t of TRIES) {
    const p = at(t)
    const box = { x: p.x - size.w / 2, y: p.y - size.h / 2, w: size.w, h: size.h }
    let area = 0
    for (const o of obstacles) area += overlapArea(box, o)
    if (area === 0) return p
    if (!best || area < best.area - 1) best = { p, area }
  }
  return best?.p ?? at(0.5)
}

/** Rough on-canvas size of a link label (12px bold text in a pill). */
export const labelSize = (text: string): { w: number; h: number } => ({
  w: Math.min(220, 28 + text.length * 7),
  h: 26,
})

/** A point on the cubic Bézier p1 → p2 with control points c1, c2. */
export function bezierAt(p1: Pt, c1: Pt, c2: Pt, p2: Pt): (t: number) => Pt {
  return (t) => {
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    return {
      x: a * p1.x + b * c1.x + c * c2.x + d * p2.x,
      y: a * p1.y + b * c1.y + c * c2.y + d * p2.y,
    }
  }
}
