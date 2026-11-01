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
  // The last stretch runs straight into the card for at least an arrowhead's length, so the
  // line never kinks right at the card.
  const lead = Math.sign(dx || 1) * Math.max(Math.abs(dx) * 0.55, 16)
  return [a, { x: a.x, y: a.y + dy * 0.6 }, { x: b.x - lead, y: b.y }, b]
}

// ---------------------------------------------------------------------------
// Joining cards at the nearest of their four sides (2026-11-01)
// ---------------------------------------------------------------------------

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export type Side = 'top' | 'right' | 'bottom' | 'left'
export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

const NORMAL: Record<Side, Pt> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

/** The middle of one side of a box. */
export function anchor(b: Box, side: Side): Pt {
  if (side === 'top') return { x: b.x + b.w / 2, y: b.y }
  if (side === 'bottom') return { x: b.x + b.w / 2, y: b.y + b.h }
  if (side === 'left') return { x: b.x, y: b.y + b.h / 2 }
  return { x: b.x + b.w, y: b.y + b.h / 2 }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y

/**
 * The curve from side `sa` of `a` to side `sb` of `b`: it leaves and arrives straight out of the
 * sides (so the arrowhead always points squarely into the card). Two cards joined on the same
 * side get a bracket-shaped curve just outside both.
 */
export function sideCurve(a: Box, sa: Side, b: Box, sb: Side): Cubic {
  const p1 = anchor(a, sa)
  const p2 = anchor(b, sb)
  const n1 = NORMAL[sa]
  const n2 = NORMAL[sb]
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (sa === sb) {
    // A tight bracket, so it stays inside the colored area around the cards (18px of padding).
    const k = clamp(d * 0.1, 10, 18)
    const outer = Math.max(dot(p1, n1), dot(p2, n1)) + k
    const o1 = outer - dot(p1, n1)
    const o2 = outer - dot(p2, n1)
    return [
      p1,
      { x: p1.x + n1.x * o1, y: p1.y + n1.y * o1 },
      { x: p2.x + n1.x * o2, y: p2.y + n1.y * o2 },
      p2,
    ]
  }
  // Each handle reaches at most most of the way to the other card, so short hops across a
  // narrow gap stay in the gap instead of dipping into the card.
  const v = { x: p2.x - p1.x, y: p2.y - p1.y }
  const k1 = clamp(Math.min(d * 0.45, dot(n1, v) * 0.85), 6, 120)
  const k2 = clamp(Math.min(d * 0.45, -dot(n2, v) * 0.85), 6, 120)
  return [
    p1,
    { x: p1.x + n1.x * k1, y: p1.y + n1.y * k1 },
    { x: p2.x + n2.x * k2, y: p2.y + n2.y * k2 },
    p2,
  ]
}

/** Whether side `sa` of `a` and side `sb` of `b` can face each other. */
function facing(a: Box, sa: Side, b: Box, sb: Side): boolean {
  const p1 = anchor(a, sa)
  const p2 = anchor(b, sb)
  const v = { x: p2.x - p1.x, y: p2.y - p1.y }
  if (sa === sb) {
    // Same side: only when the cards sit one after the other along that side.
    const vertical = sa === 'left' || sa === 'right'
    return vertical ? a.y + a.h <= b.y || b.y + b.h <= a.y : a.x + a.w <= b.x || b.x + b.w <= a.x
  }
  return dot(NORMAL[sa], v) > 2 && dot(NORMAL[sb], { x: -v.x, y: -v.y }) > 2
}

const inside = (p: Pt, o: Box) =>
  p.x > o.x + 2 && p.x < o.x + o.w - 2 && p.y > o.y + 2 && p.y < o.y + o.h - 2

/**
 * The nearest pair of sides joining `a` to `b` whose curve does not run through another card
 * (`obstacles`), or null when every pair does (the caller then routes around).
 */
export function nearestSides(a: Box, b: Box, obstacles: readonly Box[]): [Side, Side] | null {
  let best: [Side, Side] | null = null
  let bestLen = Infinity
  for (const sa of SIDES)
    for (const sb of SIDES) {
      if (!facing(a, sa, b, sb)) continue
      const curve = sideCurve(a, sa, b, sb)
      let len = 0
      let prev = curve[0]
      let blocked = false
      for (let i = 1; i <= 20 && !blocked; i++) {
        const p = point(curve, i / 20)
        len += Math.hypot(p.x - prev.x, p.y - prev.y)
        prev = p
        blocked = obstacles.some((o) => inside(p, o)) || (i < 20 && (inside(p, a) || inside(p, b)))
      }
      if (!blocked && len < bestLen) {
        bestLen = len
        best = [sa, sb]
      }
    }
  return best
}

/** Splits a curve in two (same shape), so every line has the same number of points to morph. */
export function split(c: Cubic): [Cubic, Cubic] {
  const mid = (p: Pt, q: Pt) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
  const [a, b, cc, d] = c
  const ab = mid(a, b)
  const bc = mid(b, cc)
  const cd = mid(cc, d)
  const abc = mid(ab, bc)
  const bcd = mid(bc, cd)
  const m = mid(abc, bcd)
  return [
    [a, ab, abc, m],
    [m, bcd, cd, d],
  ]
}

/**
 * A crisp arrowhead at the end of the curves: a filled triangle with a slight notch, pointing
 * along the line's last stretch, its tip on the card's edge.
 */
export function arrowHead(segs: readonly Cubic[], length = 11, width = 10): string {
  const last = segs[segs.length - 1]
  if (!last) return ''
  const tip = last[3]
  let from = last[2]
  if (Math.hypot(tip.x - from.x, tip.y - from.y) < 0.5) from = last[1]
  if (Math.hypot(tip.x - from.x, tip.y - from.y) < 0.5) from = last[0]
  const m = Math.hypot(tip.x - from.x, tip.y - from.y) || 1
  const u = { x: (tip.x - from.x) / m, y: (tip.y - from.y) / m }
  const n = { x: -u.y, y: u.x }
  const base = { x: tip.x - u.x * length, y: tip.y - u.y * length }
  const notch = { x: tip.x - u.x * length * 0.72, y: tip.y - u.y * length * 0.72 }
  const half = width / 2
  const l = { x: base.x + n.x * half, y: base.y + n.y * half }
  const r = { x: base.x - n.x * half, y: base.y - n.y * half }
  return `M${fmt(tip)} L${fmt(l)} L${fmt(notch)} L${fmt(r)} Z`
}
