import { describe, expect, it } from 'vitest'
import { allPages, exportFileName } from '@/features/settings/dataExport'

describe('data export (Phase 7.5)', () => {
  it('reads every page until a short one', async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => i)
    const asked: Array<[number, number]> = []
    const all = await allPages(async (from, to) => {
      asked.push([from, to])
      return { data: rows.slice(from, to + 1), error: null }
    })
    expect(all).toEqual(rows)
    expect(asked).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('stops on an error instead of returning a partial export', async () => {
    await expect(
      allPages(async () => ({ data: null, error: new Error('offline') })),
    ).rejects.toThrow('offline')
  })

  it('names the file after the account and the day', () => {
    expect(exportFileName('liv_k', new Date('2026-11-01T10:00:00Z'))).toBe(
      'mynota-liv_k-2026-11-01.json',
    )
    expect(exportFileName('../../x', new Date('2026-11-01T10:00:00Z'))).toBe(
      'mynota-x-2026-11-01.json',
    )
  })
})
