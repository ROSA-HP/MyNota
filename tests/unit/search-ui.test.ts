import { describe, expect, it } from 'vitest'
import { matchRanges } from '@/features/search/highlight'
import { resultHref } from '@/features/search/searchStore'
import type { SearchResultRow } from '@/lib/database.types'
import { nodeSearchText } from '@/lib/searchText'

const cut = (text: string, q: string) => matchRanges(text, q).map(([s, e]) => text.slice(s, e))

describe('search results', () => {
  it('marks matches the way the database matches them', () => {
    expect(cut('Membranes & Transport', 'membran')).toEqual(['Membran'])
    expect(cut('die Zellmembran trennt', 'MEMBRAN zell')).toEqual(['Zellmembran'])
    expect(cut('Über die Zelle', 'uber')).toEqual(['Über'])
    // Arabic: diacritics and hamza seats ignored, the marks stay with their letters.
    expect(cut('الغشاءُ الخلويّ', 'غشاء')).toEqual(['غشاءُ'])
    expect(cut('مدرسة أحياء', 'احياء مدرسه')).toEqual(['مدرسة', 'أحياء'])
    expect(matchRanges('anything', ' ')).toEqual([])
  })

  it('opens blocks on the map, cards in the deck, sources at their chapter', () => {
    const r = (p: Partial<SearchResultRow>): SearchResultRow => ({
      kind: 'node',
      map_id: 'm',
      map_title: 'M',
      map_type: 'book',
      node_id: null,
      card_id: null,
      title: '',
      snippet: '',
      rank: 1,
      ...p,
    })
    expect(resultHref(r({ node_id: 'n' }))).toBe('/maps/m?node=n')
    expect(resultHref(r({ kind: 'card', card_id: 'c', node_id: 'n' }))).toBe(
      '/maps/m/deck?tab=cards&card=c',
    )
    expect(resultHref(r({ kind: 'source', node_id: 'ch' }))).toBe('/maps/m?node=ch')
    expect(resultHref(r({ kind: 'map' }))).toBe('/maps/m')
  })

  it('searches a block by everything it says', () => {
    expect(
      nodeSearchText({
        title: 'Osmosis',
        summary: 'Water moves',
        details: [
          { kind: 'bullet', text: 'semi-permeable' },
          { kind: 'vocab', term: 'Zelle', meaning: 'cell' },
        ],
      }),
    ).toBe('Osmosis Water moves semi-permeable Zelle cell')
  })
})
