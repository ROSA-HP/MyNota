import { describe, expect, it } from 'vitest'
import { bezierAt, pickLabelPoint } from '@/features/workspace/canvas/labelPlacement'

describe('link label placement', () => {
  const line = bezierAt({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 300, y: 0 }, { x: 400, y: 0 })

  it('uses the middle of the curve when it is free', () => {
    expect(line(0)).toEqual({ x: 0, y: 0 })
    expect(line(1)).toEqual({ x: 400, y: 0 })
    expect(pickLabelPoint(line, [])).toEqual(line(0.5))
  })

  it('slides along the curve off a card that covers the middle', () => {
    const card = { x: 150, y: -30, w: 100, h: 60 }
    const p = pickLabelPoint(line, [card])
    expect(p.x).not.toBe(line(0.5).x)
    expect(p.x + 48 <= card.x || p.x - 48 >= card.x + card.w).toBe(true)
  })

  it('falls back to the middle when every spot is covered', () => {
    expect(pickLabelPoint(line, [{ x: -50, y: -50, w: 500, h: 100 }])).toEqual(line(0.5))
  })
})
