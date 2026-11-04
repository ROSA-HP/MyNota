import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TOOLS, type ImportArgs, type ToolContext } from '../tools'

/** Keeps a test's drafts in its own throwaway folder. */
export function useTempData(): { dir: string; done: () => void } {
  const dir = mkdtempSync(join(process.env.MYNOTA_TEST_TMP ?? tmpdir(), 'mynota-mcp-'))
  process.env.MYNOTA_MCP_DATA = dir
  return {
    dir,
    done: () => {
      delete process.env.MYNOTA_MCP_DATA
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

export interface FakeDatabase extends ToolContext {
  calls: ImportArgs[]
  failNext: Error | null
}

/** An admin's session, and a database that remembers what it was sent. */
export function fakeDatabase(admin = true): FakeDatabase {
  const db: FakeDatabase = {
    calls: [],
    failNext: null,
    identity: async () => ({ signedIn: true, email: 'admin@test.dev', admin }),
    async importPart(args) {
      if (db.failNext) {
        const e = db.failNext
        db.failNext = null
        throw e
      }
      db.calls.push(args)
    },
  }
  return db
}

// Test results are read field by field; a full type for every tool would add nothing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function call(name: string, args: unknown, ctx: ToolContext): Promise<any> {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) throw new Error(`no tool ${name}`)
  return tool.call(args, ctx)
}
