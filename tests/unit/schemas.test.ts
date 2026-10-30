import { describe, expect, it } from 'vitest'
import {
  USERNAME_PATTERN,
  fieldErrors,
  normalizeUsernameInput,
  signUpSchema,
  usernameSchema,
} from '@/features/auth/schemas'

describe('username rules (must match profiles_username_format in SQL)', () => {
  it.each(['abc', 'olivia', 'user_42', 'a'.repeat(24)])('accepts %s', (u) => {
    expect(USERNAME_PATTERN.test(u)).toBe(true)
  })

  it.each(['ab', '1abc', '_abc', 'Abc', 'a'.repeat(25), 'with space', 'dot.name', 'عربي', 'über'])(
    'rejects %s',
    (u) => {
      expect(USERNAME_PATTERN.test(u)).toBe(false)
    },
  )

  it('lowercases and trims through the schema', () => {
    expect(usernameSchema.parse('  Olivia ')).toBe('olivia')
  })

  it('normalizes live input', () => {
    expect(normalizeUsernameInput('Hello World!_99')).toBe('helloworld_99')
    expect(normalizeUsernameInput('x'.repeat(40))).toHaveLength(24)
  })
})

describe('sign-up schema', () => {
  const valid = { name: 'Lina', username: 'lina', email: 'lina@example.com', password: '12345678' }

  it('accepts a valid form', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true)
  })

  it('returns translation keys per field', () => {
    const r = signUpSchema.safeParse({
      name: ' ',
      username: '1x',
      email: 'nope',
      password: 'short',
    })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(fieldErrors(r.error)).toEqual({
      name: 'auth.errors.nameRequired',
      username: 'auth.errors.usernameInvalid',
      email: 'auth.errors.emailInvalid',
      password: 'auth.errors.passwordTooShort',
    })
  })

  it('accepts Arabic and German names', () => {
    expect(signUpSchema.safeParse({ ...valid, name: 'لينا أحمد' }).success).toBe(true)
    expect(signUpSchema.safeParse({ ...valid, name: 'Jürgen Weiß' }).success).toBe(true)
  })
})
