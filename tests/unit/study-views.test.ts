import { describe, expect, it } from 'vitest'
import { makeNode } from '@/ai/pipeline/convert'
import { masteryMapFor } from '@/features/study/mastery'
import { useCanvasUi } from '@/features/workspace/canvas/canvasUi'
import { focusGroupOf } from '@/features/workspace/canvas/focus'
import type { CardRow, NodeRow } from '@/lib/database.types'

const node = (id: string, parent: string | null, level: NodeRow['level']) =>
  makeNode({ id, map_id: 'm', parent_id: parent, level, title: id })

describe('study views on the map', () => {
  it('focus keeps the chapter (book) or section (notes) a node sits under', () => {
    const book = Object.fromEntries(
      [
        node('root', null, 'book'),
        node('ch', 'root', 'chapter'),
        node('sec', 'ch', 'section'),
        node('b', 'sec', 'block'),
        node('b2', 'b', 'block'),
      ].map((n) => [n.id, n]),
    )
    expect(focusGroupOf(book, 'b2')).toBe('ch')
    expect(focusGroupOf(book, 'ch')).toBe('ch')
    expect(focusGroupOf(book, 'root')).toBeNull()
    expect(focusGroupOf(book, 'missing')).toBeNull()
    const notes = Object.fromEntries(
      [node('r', null, 'book'), node('s', 'r', 'section'), node('x', 's', 'block')].map((n) => [
        n.id,
        n,
      ]),
    )
    expect(focusGroupOf(notes, 'x')).toBe('s')
  })

  it('computes mastery dots once per deck change', () => {
    const card = { id: 'c', node_id: 'b', suspended: false } as CardRow
    const cards = { c: card }
    const progress = {}
    const first = masteryMapFor(cards, progress)
    expect(first).toEqual({ b: 'new' })
    expect(masteryMapFor(cards, progress)).toBe(first)
    expect(masteryMapFor({ ...cards }, progress)).not.toBe(first)
  })

  it('hide details reveals blocks one by one and starts fresh each time', () => {
    const ui = useCanvasUi.getState()
    ui.setCover(true)
    ui.reveal('a')
    ui.reveal('a')
    expect(useCanvasUi.getState().revealed).toEqual(['a'])
    ui.setCover(true)
    expect(useCanvasUi.getState().revealed).toEqual([])
    ui.revealAll()
    expect(useCanvasUi.getState().cover).toBe(false)
  })
})
