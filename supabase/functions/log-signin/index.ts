// Records a successful sign-in in login_events (Phase 7.4): which method, a short device name
// ("Firefox on Windows"), the approximate country, and a salted hash of the IP address (the
// address itself is never stored). Failed password attempts are recorded by the database hook
// public.hook_password_attempt instead.
//
// Deploy: docs/migrations.md › Edge Functions. Secret: IP_HASH_SALT (any long random string).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const ORIGIN = Deno.env.get('APP_ORIGIN') ?? '*'
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function device(ua: string): string {
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser'
  const os =
    /iPad/.test(ua) ? 'iPad'
    : /iPhone/.test(ua) ? 'iPhone'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : ''
  return os ? `${browser} on ${os}` : browser
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors })

  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return new Response('sign in first', { status: 401, headers: cors })

  let method = 'password'
  try {
    const body = (await req.json()) as { method?: unknown }
    if (typeof body.method === 'string') method = body.method
  } catch {
    /* no body: password */
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ?? ''
  const salt = Deno.env.get('IP_HASH_SALT') ?? ''
  const ipHash = ip && salt ? await sha256(`${salt}:${ip}`) : null
  // Set by the platform's proxy when available; otherwise the country stays empty.
  const country = req.headers.get('cf-ipcountry') ?? req.headers.get('x-country') ?? null

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  // At most 30 records per IP an hour (a script cannot fill the table).
  if (ipHash) {
    const admin = createClient(url, service, { auth: { persistSession: false } })
    const { data: ok } = await admin.rpc('rate_hit', {
      p_key: `signin:${ipHash}`,
      p_max: 30,
      p_window: '1 hour',
    })
    if (ok === false) return new Response('too many', { status: 429, headers: cors })
  }

  // As the user: log_signin() only ever writes a row for the caller's own account.
  const user = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  })
  const { error } = await user.rpc('log_signin', {
    p_method: method,
    p_device: device(req.headers.get('user-agent') ?? ''),
    p_country: country,
    p_ip_hash: ipHash,
  })
  if (error) return new Response('not recorded', { status: 400, headers: cors })
  return new Response(null, { status: 204, headers: cors })
})
