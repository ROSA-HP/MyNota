import { describe, expect, it } from 'vitest'
import { matchesQuery, normalizeForSearch } from '@/lib/searchText'

describe('normalizeForSearch', () => {
  it('folds case, accents and spacing', () => {
    expect(normalizeForSearch('  Zéllatmung   ÜBER ')).toBe('zellatmung uber')
    expect(normalizeForSearch('Straße')).toBe('strasse')
  })

  it('removes Arabic diacritics and tatweel', () => {
    expect(normalizeForSearch('التَّنَفُّس')).toBe(normalizeForSearch('التنفس'))
    expect(normalizeForSearch('علـــم')).toBe('علم')
  })

  it('unifies Arabic letter variants', () => {
    expect(normalizeForSearch('أحماض إنزيم آلية')).toBe('احماض انزيم اليه')
    expect(normalizeForSearch('مستوى')).toBe(normalizeForSearch('مستوي'))
    expect(normalizeForSearch('خلية')).toBe(normalizeForSearch('خليه'))
    expect(normalizeForSearch('مؤشر')).toBe('موشر')
    expect(normalizeForSearch('جزيئات')).toBe('جزييات')
  })
})

describe('matchesQuery', () => {
  it('matches every word in any order', () => {
    expect(matchesQuery('ATP Hydrolysis', 'hydro atp')).toBe(true)
    expect(matchesQuery('ATP Hydrolysis', 'synthesis')).toBe(false)
    expect(matchesQuery('الإنزيمات المساعدة', 'انزيمات')).toBe(true)
    expect(matchesQuery('anything', '   ')).toBe(true)
  })
})
