// @vitest-environment node
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROOT } from '../config'
import { TOOLS } from '../tools'
import { useTempData } from './helpers'

// The real thing: starts the server the way Claude and Gemini do, and talks to it over stdio.

let temp: ReturnType<typeof useTempData>
let client: Client

const text = (r: unknown) => {
  const content = (r as { content: Array<{ text: string }> }).content
  return content[0]?.text ?? ''
}

beforeAll(async () => {
  temp = useTempData()
  client = new Client({ name: 'test', version: '1' })
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(ROOT, 'mcp', 'run.mjs')],
      cwd: temp.dir,
      env: {
        ...(process.env as Record<string, string>),
        MYNOTA_MCP_DATA: temp.dir,
        MYNOTA_MCP_SESSION: join(temp.dir, 'session.json'),
        MYNOTA_SUPABASE_URL: 'http://127.0.0.1:9',
        MYNOTA_SUPABASE_KEY: 'sb_publishable_test',
      },
    }),
  )
}, 60_000)

afterAll(async () => {
  await client.close()
  temp.done()
})

describe('over stdio', () => {
  it('lists every tool with a schema a host can use', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name))
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.description?.length).toBeGreaterThan(40)
    }
    const save = tools.find((t) => t.name === 'save_section')
    expect(Object.keys(save?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining([
        'draft_id',
        'chapter',
        'section',
        'blocks',
        'relations',
        'flashcards',
      ]),
    )
  })

  it('tells the host what it is for', () => {
    expect(client.getInstructions()).toContain('Start with map_status')
  })

  it('reports that nobody is signed in', async () => {
    const r = await client.callTool({ name: 'map_status', arguments: {} })
    expect(text(r)).toContain('mcp:login')
  })

  it('builds a draft from start to finish of the first section', async () => {
    const loaded = await client.callTool({
      name: 'load_source',
      arguments: { text: 'Plants make food from sunlight in their green leaves every single day.' },
    })
    const id = (JSON.parse(text(loaded)) as { draft_id: string }).draft_id
    const saved = await client.callTool({
      name: 'save_outline',
      arguments: {
        draft_id: id,
        chapter: 1,
        sections: [
          {
            title: 'Plants',
            summary: 'How plants feed.',
            shape: 'tree',
            paragraphs: { from: 1, to: 1 },
            subsections: [],
          },
        ],
      },
    })
    expect(text(saved)).toContain('"saved": true')
  })

  it('sends a mistake back as an error the model can read, and keeps running', async () => {
    const r = await client.callTool({
      name: 'read_source',
      arguments: { draft_id: 'nope', chapter: 1 },
    })
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('not a draft id')
    await expect(client.ping()).resolves.toBeDefined()
  })

  it('offers the whole skill as a prompt, for a host without the skill installed', async () => {
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name)).toEqual(['map_source'])
    const prompt = await client.getPrompt({ name: 'map_source', arguments: { source: 'book.pdf' } })
    const body = (prompt.messages[0]?.content as { text: string }).text
    expect(body).toContain('# MyNota mapper')
    expect(body).toContain('# Mapping rules')
    expect(body).toContain('Map this source: book.pdf')
    expect(body).not.toContain('description: Builds')
  })
})
