import { describe, expect, it } from 'vitest'
import {
  arrowHead,
  centrePath,
  nearestSides,
  sideCurve,
  downThenAcross,
  taperedPath,
  verticalS,
  type Pt,
} from '@/features/workspace/canvas/organic'

// Organic tree lines (2026-11-01): tapered curves that morph smoothly when cards move.
const points = (d: string): Pt[] =>
  [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }))

describe('organic branches', () => {
  it('taper from thick at the parent to thin at the child', () => {
    const d = taperedPath([verticalS({ x: 0, y: 0 }, { x: 0, y: 200 })], 6, 2)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    const pts = points(d)
    const half = pts.length / 2
    // Left side runs start → end, right side end → start: compare the widths at both ends.
    const widthAt = (i: number) => Math.abs((pts[i] as Pt).x - (pts[pts.length - 1 - i] as Pt).x)
    expect(widthAt(0)).toBeCloseTo(6, 0)
    expect(widthAt(half - 1)).toBeCloseTo(2, 0)
  })

  it('always have the same number of points, so a moving card morphs its lines', () => {
    const near = taperedPath([downThenAcross({ x: 0, y: 0 }, { x: 40, y: 30 })], 4, 2)
    const far = taperedPath([downThenAcross({ x: 0, y: 0 }, { x: 400, y: 900 })], 4, 2)
    expect(points(near)).toHaveLength(points(far).length)
  })

  it('stay finite when a curve handle sits on its end point', () => {
    const d = taperedPath(
      [
        [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
      ],
      4,
      2,
    )
    expect(d).not.toMatch(/NaN|Infinity/)
  })

  it('keep a centre line through the same curve for the arrowhead', () => {
    const seg = downThenAcross({ x: 10, y: 0 }, { x: 110, y: 80 })
    expect(centrePath([seg])).toBe('M10,0 C10,48 55,80 110,80')
  })
})

describe('joining cards at the nearest of their four sides', () => {
  const section = { x: 100, y: 0, w: 190, h: 58 }
  const first = { x: 122, y: 88, w: 240, h: 100 }
  const second = { x: 122, y: 202, w: 240, h: 100 }

  it('joins a card just below from bottom to top, inside the gap', () => {
    expect(nearestSides(section, first, [second])).toEqual(['bottom', 'top'])
    const [p1, c1, c2, p2] = sideCurve(section, 'bottom', first, 'top')
    expect(p1).toEqual({ x: 195, y: 58 })
    expect(p2).toEqual({ x: 242, y: 88 })
    // The handles stay between the cards, so the curve never dips into either.
    expect(c1.y).toBeLessThanOrEqual(88)
    expect(c2.y).toBeGreaterThanOrEqual(58)
  })

  it('goes around a card in the way, joining the sides instead', () => {
    expect(nearestSides(section, second, [first])).toEqual(['left', 'left'])
  })

  it('joins a card to the side at the facing sides', () => {
    const beside = { x: 400, y: 10, w: 200, h: 60 }
    expect(nearestSides(section, beside, [])).toEqual(['right', 'left'])
  })

  it('gives up (and lets the line route around) when every way is blocked', () => {
    const wall = { x: -500, y: 60, w: 2000, h: 20 }
    const around = { x: 60, y: -40, w: 20, h: 400 }
    const right = { x: 300, y: -40, w: 20, h: 400 }
    expect(nearestSides(section, first, [wall, around, right])).toBeNull()
  })
})

describe('arrowheads', () => {
  it('put the tip on the card edge, pointing along the last stretch', () => {
    const d = arrowHead([
      sideCurve({ x: 0, y: 0, w: 100, h: 40 }, 'bottom', { x: 0, y: 100, w: 100, h: 40 }, 'top'),
    ])
    const [tip, left, notch, right] = points(d)
    expect(tip).toEqual({ x: 50, y: 100 })
    // Pointing down: the base sits above the tip, symmetric around it.
    expect(left?.y).toBeCloseTo(89, 0)
    expect(right?.y).toBeCloseTo(89, 0)
    expect((left?.x ?? 0) + (right?.x ?? 0)).toBeCloseTo(100, 0)
    expect(notch?.x).toBeCloseTo(50, 0)
  })
})

describe('one smooth bend, never an S (owner, 2026-11-03)', async () => {
  const o = await import('@/features/workspace/canvas/organic')
  // A small fixed-seed generator, so the test is the same on every run.
  let seed = 7
  const rnd = (lo: number, hi: number) => {
    seed = (seed * 16807) % 2147483647
    return lo + ((seed - 1) / 2147483646) * (hi - lo)
  }
  const box = () => ({ x: rnd(-600, 600), y: rnd(-600, 600), w: rnd(60, 260), h: rnd(40, 200) })

  it('turns an S into one bend that still arrives the same way', () => {
    const s = [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 80 },
    ] as const
    expect(o.inflects(s)).toBe(true)
    const fixed = o.oneBend(s)
    expect(o.inflects(fixed)).toBe(false)
    expect(fixed[2]).toEqual(s[2]) // the arrival handle is kept: the arrow still points down
    expect(fixed[3]).toEqual(s[3])
  })

  it('draws every side-to-side line without an S, in 500 random layouts', () => {
    let checked = 0
    for (let i = 0; i < 500; i++) {
      const a = box()
      const b = box()
      for (const sa of o.SIDES)
        for (const sb of o.SIDES) {
          const c = o.sideCurve(a, sa, b, sb)
          expect(o.inflects(c), `${sa}→${sb} #${i}`).toBe(false)
          checked++
        }
    }
    expect(checked).toBe(8000)
  })

  it('draws the fallback routes without an S too', () => {
    for (let i = 0; i < 300; i++) {
      const a = { x: rnd(-300, 300), y: rnd(-300, 0) }
      const b = { x: rnd(-300, 300), y: rnd(10, 600) }
      expect(o.inflects(o.verticalS(a, b))).toBe(false)
      expect(o.inflects(o.downThenAcross(a, b))).toBe(false)
      const gap = b.x - 12
      for (const seg of o.bracket(a, gap, b)) expect(o.inflects(seg)).toBe(false)
    }
  })
})
