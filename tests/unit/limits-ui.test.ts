import { describe, expect, it } from 'vitest'
import { createErrorKey } from '@/features/new-map/createError'
import { shareError } from '@/features/sharing/shareApi'

describe('limit messages (Phase 7.4)', () => {
  it('map creation explains a reached limit', () => {
    expect(createErrorKey({ code: 'MN429', message: 'daily map limit reached' })).toBe(
      'newMap.errLimit',
    )
    expect(createErrorKey(new Error('offline'))).toBe('newMap.errCreate')
    expect(createErrorKey(null)).toBe('newMap.errCreate')
  })

  it('sharing explains links switched off by an admin', () => {
    expect(shareError({ code: 'MN403' })).toBe('share.errors.switchedOff')
    expect(shareError({ code: 'MN429' })).toBe('share.errors.tooMany')
  })
})
