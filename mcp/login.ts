import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import type { SupabaseClient } from '@supabase/supabase-js'
import { forgetSession, identify, makeClient } from './auth'
import { sessionFile } from './config'

/**
 * `npm run mcp:login`: signs the admin in, in their own terminal, so a password or two-factor
 * code never passes through the AI. Add `-- --google` for an account that uses Google sign-in.
 * Add `-- --logout` to sign out of the mapper on this computer.
 */

/** Fixed, so it can be added once to Supabase › Authentication › URL Configuration. */
const GOOGLE_PORT = 54399
const REDIRECT = `http://127.0.0.1:${GOOGLE_PORT}/callback`

const say = (line: string) => stdout.write(`${line}\n`)

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout })
  const answer = await rl.question(question)
  rl.close()
  return answer.trim()
}

/** Reads a line without showing what is typed. */
async function askHidden(question: string): Promise<string> {
  stdout.write(question)
  let muted = true
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (!muted) stdout.write(chunk)
      done()
    },
  })
  const rl = createInterface({ input: stdin, output, terminal: true })
  const answer = await rl.question('')
  muted = false
  rl.close()
  stdout.write('\n')
  return answer
}

async function passwordSignIn(db: SupabaseClient): Promise<void> {
  const email = await ask('Admin email: ')
  const password = await askHidden('Password (not shown): ')
  const { error } = await db.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed: ${error.message}`)
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? (['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]] as const)
      : process.platform === 'darwin'
        ? (['open', [url]] as const)
        : (['xdg-open', [url]] as const)
  spawn(command, [...args], { stdio: 'ignore', detached: true }).unref()
}

async function googleSignIn(db: SupabaseClient): Promise<void> {
  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const value = url.searchParams.get('code')
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(value ? 'Signed in. You can close this tab.' : 'Sign-in failed. Try again.')
      server.close()
      if (value) resolve(value)
      else reject(new Error(url.searchParams.get('error_description') ?? 'Sign-in failed.'))
    })
    server.on('error', reject)
    server.listen(GOOGLE_PORT, '127.0.0.1', () => {
      void db.auth
        .signInWithOAuth({
          provider: 'google',
          options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
        })
        .then(({ data, error }) => {
          if (error || !data.url) {
            server.close()
            reject(error ?? new Error('Google sign-in is not available.'))
            return
          }
          say(`Opening your browser. If nothing opens, go to:\n${data.url}`)
          openBrowser(data.url)
        })
    })
  })
  const { error } = await db.auth.exchangeCodeForSession(code)
  if (error) throw new Error(`Sign-in failed: ${error.message}`)
}

/** The second step every admin needs: the code from their authenticator app. */
async function secondFactor(db: SupabaseClient): Promise<void> {
  const { data, error } = await db.auth.mfa.listFactors()
  if (error) throw new Error(`Could not read two-factor settings: ${error.message}`)
  const factor = data.totp.find((f) => f.status === 'verified')
  if (!factor) {
    throw new Error(
      'This account has no authenticator app. Turn on two-factor sign-in in Settings first: admins need it.',
    )
  }
  const code = await ask('Code from your authenticator app: ')
  const verified = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
  if (verified.error) throw new Error(`Wrong code: ${verified.error.message}`)
}

async function main(): Promise<void> {
  if (process.argv.includes('--logout')) {
    forgetSession()
    say('Signed out of the mapper on this computer.')
    return
  }
  const google = process.argv.includes('--google')
  const db = makeClient(google ? 'pkce' : 'implicit')
  await (google ? googleSignIn(db) : passwordSignIn(db))
  await secondFactor(db)

  const me = await identify(db)
  if (!me.admin) {
    forgetSession()
    throw new Error(
      'Signed in, but the database says this account is not an active admin. Nothing was saved.',
    )
  }
  say(`Signed in as ${me.email ?? 'admin'}. Saved in ${sessionFile()}.`)
  say('You can now use the mapper in Claude or Gemini.')
}

try {
  await main()
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exitCode = 1
}
