import { z } from 'zod'

// Must match the profiles_username_format check in supabase/migrations.
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,23}$/

export const emailSchema = z
  .string()
  .trim()
  .pipe(z.email({ error: 'auth.errors.emailInvalid' }))

export const passwordSchema = z.string().min(8, { error: 'auth.errors.passwordTooShort' })

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, { error: 'auth.errors.usernameInvalid' })

export const nameSchema = z
  .string()
  .trim()
  .min(1, { error: 'auth.errors.nameRequired' })
  .max(80, { error: 'auth.errors.nameTooLong' })

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'auth.errors.invalidCredentials' }),
})

export const signUpSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export type SignUpInput = z.infer<typeof signUpSchema>

/** Turns a Zod error into { field: translationKey } (first issue per field). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    if (!(key in out)) out[key] = issue.message
  }
  return out
}

/** Lowercases and strips characters a username can never contain, for live typing. */
export function normalizeUsernameInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24)
}
