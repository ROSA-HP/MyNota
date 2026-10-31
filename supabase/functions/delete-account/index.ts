// Deletes the caller's own account and everything it owns (Phase 7.5, docs/security.md ›
// Privacy and data rights). Deleting the auth user cascades in the database to the profile,
// subjects, maps (with blocks, links, sources, cards, live documents), memberships, progress and
// sign-in records; audit entries keep the action but lose the name.
//
// Safety: the person must type their username, accounts with two-factor sign-in must be in a
// two-factor session (aal2), and only the caller's own account can be deleted.
// Deploy: docs/migrations.md › Edge Functions.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const ORIGIN = Deno.env.get('APP_ORIGIN') ?? '*'
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, error?: string) =>
  new Response(error ? JSON.stringify({ error }) : null, {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

/** The `aal` claim of a JWT the Auth server already verified (getUser below). */
function aal(jwt: string): string {
  try {
    const part = jwt.split('.')[1] ?? ''
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return String((JSON.parse(json) as { aal?: unknown }).aal ?? '')
  } catch {
    return ''
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, 'method')

  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!jwt) return reply(401, 'auth')

  let confirm = ''
  try {
    const body = (await req.json()) as { confirm?: unknown }
    if (typeof body.confirm === 'string') confirm = body.confirm.trim().replace(/^@/, '').toLowerCase()
  } catch {
    return reply(400, 'confirm')
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  // Verifies the token with the Auth server (signature, expiry, not signed out).
  const { data: userData, error: userError } = await admin.auth.getUser(jwt)
  const user = userData?.user
  if (userError || !user) return reply(401, 'auth')

  const { data: profile } = await admin
    .from('profiles')
    .select('username, two_factor_enabled')
    .eq('id', user.id)
    .single()
  if (!profile) return reply(404, 'profile')
  if (confirm !== profile.username) return reply(400, 'confirm')
  if (profile.two_factor_enabled && aal(jwt) !== 'aal2') return reply(403, 'mfa')

  const { data: allowed } = await admin.rpc('rate_hit', {
    p_key: `delete:${user.id}`,
    p_max: 5,
    p_window: '1 hour',
  })
  if (allowed === false) return reply(429, 'limit')

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return reply(500, 'failed')
  return reply(204)
})
