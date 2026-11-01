/**
 * Organic branch lines for the tree (2026-11-01): smooth curves that taper from the parent to the
 * child, like branches in a hand-drawn mind map. A branch is one or more cubic curves; the body is
 * drawn as a filled outline around them (thick at the start, thin at the end), and the thin centre
 * line on top carries the arrowhead.
 *
 * Every branch of one kind has the same number of points, so a moving node morphs its branches
 * smoothly (CSS transition on `d`).
 */

export interface Pt {
  x: number
  y: number
}
export type Cubic = readonly [Pt, Pt, Pt, Pt]

/** Points sampled per cubic curve. */
const STEPS = 14

function point([a, b, c, d]: Cubic, t: number): Pt {
  const u = 1 - t
  const k0 = u * u * u
  const k1 = 3 * u * u * t
  const k2 = 3 * u * t * t
  const k3 = t * t * t
  return {
    x: k0 * a.x + k1 * b.x + k2 * c.x + k3 * d.x,
    y: k0 * a.y + k1 * b.y + k2 * c.y + k3 * d.y,
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10
const fmt = (p: Pt) => `${r1(p.x)},${r1(p.y)}`

/** The centre line (for the arrowhead and the morphing transition). */
export function centrePath(segs: readonly Cubic[]): string {
  const first = segs[0]
  if (!first) return ''
  return `M${fmt(first[0])} ${segs.map((s) => `C${fmt(s[1])} ${fmt(s[2])} ${fmt(s[3])}`).join(' ')}`
}

/**
 * The tapered body around the curves: `from` wide at the start, `to` wide at the end (the width
 * eases out, so the branch thins quickly near its parent and stays even towards the child).
 */
export function taperedPath(segs: readonly Cubic[], from: number, to: number): string {
  const pts: Pt[] = []
  segs.forEach((seg, i) => {
    for (let k = i === 0 ? 0 : 1; k <= STEPS; k++) pts.push(point(seg, k / STEPS))
  })
  if (pts.length < 2) return ''
  const lengths = [0]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Pt
    const b = pts[i] as Pt
    lengths.push((lengths[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y))
  }
  const total = (lengths[lengths.length - 1] as number) || 1
  const left: Pt[] = []
  const right: Pt[] = []
  pts.forEach((p, i) => {
    // Direction from the neighbours (never zero, even where a curve's handle sits on its end).
    const a = pts[Math.max(0, i - 1)] as Pt
    const b = pts[Math.min(pts.length - 1, i + 1)] as Pt
    const dx = b.x - a.x
    const dy = b.y - a.y
    const m = Math.hypot(dx, dy) || 1
    const u = (lengths[i] as number) / total
    const half = (from + (to - from) * (1 - (1 - u) ** 2)) / 2
    left.push({ x: p.x - (dy / m) * half, y: p.y + (dx / m) * half })
    right.push({ x: p.x + (dy / m) * half, y: p.y - (dx / m) * half })
  })
  return `M${left.map(fmt).join(' L')} L${right.reverse().map(fmt).join(' L')} Z`
}

/** A smooth S-curve between two points that leaves and arrives vertically. */
export function verticalS(a: Pt, b: Pt): Cubic {
  const k = Math.max(24, Math.abs(b.y - a.y) / 2)
  return [a, { x: a.x, y: a.y + k }, { x: b.x, y: b.y - k }, b]
}

/** Leaves `a` downwards and sweeps into `b` horizontally (a branch into a card's side). */
export function downThenAcross(a: Pt, b: Pt): Cubic {
  const dy = b.y - a.y
  const dx = b.x - a.x
  return [a, { x: a.x, y: a.y + dy * 0.75 }, { x: b.x - dx * 0.55, y: b.y }, b]
}
