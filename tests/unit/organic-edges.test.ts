import { describe, expect, it } from 'vitest'
import {
  centrePath,
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
    expect(centrePath([seg])).toBe('M10,0 C10,60 55,80 110,80')
  })
})
