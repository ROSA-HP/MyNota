// `npm run mcp:setup`: gets the mapper ready on this computer, and says what is left to do.
// Claude Code needs nothing more (it reads .mcp.json and .claude/skills). Gemini CLI reads its
// skills from its own folder, so the skill is copied there. Claude Desktop is set up by hand.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const skill = join(root, '.claude', 'skills', 'mynota-mapper')
const gemini = join(root, '.gemini', 'skills', 'mynota-mapper')

mkdirSync(join(root, '.gemini', 'skills'), { recursive: true })
cpSync(skill, gemini, { recursive: true, force: true })

const out = (line = '') => process.stdout.write(`${line}\n`)
const config = {
  mcpServers: { mynota: { command: 'node', args: [join(root, 'mcp', 'run.mjs')] } },
}

out('The mapper is ready.')
out()
out('1. Sign in once, in your own terminal:')
out('     npm run mcp:login')
out('   (add -- --google if your account uses Google sign-in)')
out()
out('2. Then, in this project folder:')
out('   Claude Code: nothing to do. Approve the "mynota" server when it asks.')
out('   Gemini CLI:  nothing to do. The skill was copied to .gemini/skills.')
out()
out('3. Claude Desktop (chat) only. Add this to claude_desktop_config.json and restart it:')
out(JSON.stringify(config, null, 2))
out('   Then zip the folder .claude/skills/mynota-mapper and upload it under Settings > Capabilities.')
if (!existsSync(join(root, '.env'))) {
  out()
  out('Note: there is no .env file. Put VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in it.')
}
