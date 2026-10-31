import { z } from 'zod'
import { supabase } from '@/lib/supabase'

/**
 * Two-factor sign-in with an authenticator app (Supabase MFA, TOTP), Phase 7.2.
 * Optional for students, required for admins: the admin functions in the database only work
 * for sessions that passed the second factor (JWT `aal2`).
 */

/** Six digits; spaces and dashes typed or pasted from an app are ignored. */
export const totpCodeSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'settings.security.codeInvalid'))

export interface Assurance {
  /** The session passed the second factor. */
  verified: boolean
  /** The account has a verified authenticator app, so the second factor is due. */
  needed: boolean
}

export async function assurance(): Promise<Assurance> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return { verified: false, needed: false }
  return {
    verified: data.currentLevel === 'aal2',
    needed: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2',
  }
}

export interface TotpFactor {
  id: string
  name: string
  createdAt: string
}

/** The account's verified authenticator apps. */
export async function listTotp(): Promise<TotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return (data?.totp ?? [])
    .filter((f) => f.status === 'verified')
    .map((f) => ({ id: f.id, name: f.friendly_name ?? '', createdAt: f.created_at }))
}

export interface Enrollment {
  factorId: string
  /** An SVG data URL to scan. */
  qr: string
  /** The same secret, to type in by hand. */
  secret: string
}

export async function startEnroll(name: string): Promise<Enrollment> {
  // Unfinished set-ups from earlier attempts would block a new one with the same name.
  const { data: list } = await supabase.auth.mfa.listFactors()
  for (const f of list?.all ?? [])
    if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `${name} ${new Date().toISOString().slice(0, 10)}`,
  })
  if (error || !data || data.type !== 'totp') throw error ?? new Error('enroll failed')
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

/** Checks a code for a factor (finishing a set-up, or the sign-in step). */
export async function verifyCode(factorId: string, code: string): Promise<void> {
  const parsed = totpCodeSchema.safeParse(code)
  if (!parsed.success) throw new Error('settings.security.codeInvalid')
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data })
  if (error) throw error
  await supabase.rpc('two_factor_sync')
}

export async function removeFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
  await supabase.auth.refreshSession()
  await supabase.rpc('two_factor_sync')
}

/** Signs out every other browser and device of this account. */
export async function signOutOthers(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'others' })
  if (error) throw error
}
