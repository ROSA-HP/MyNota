import { describe, expect, it } from 'vitest'
import { totpCodeSchema } from '@/features/auth/mfa'

describe('authenticator codes', () => {
  it('accepts six digits, ignoring spaces and dashes from apps', () => {
    expect(totpCodeSchema.parse('123456')).toBe('123456')
    expect(totpCodeSchema.parse(' 123 456 ')).toBe('123456')
    expect(totpCodeSchema.parse('123-456')).toBe('123456')
  })

  it('rejects anything else', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12345a', '١٢٣٤٥٦'])
      expect(totpCodeSchema.safeParse(bad).success).toBe(false)
  })
})
