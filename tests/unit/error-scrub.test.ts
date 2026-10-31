import { describe, expect, it } from 'vitest'
import { buildReport } from '@/lib/errors/report'
import { scrubMessage, scrubRoute, scrubStack, shortBrowser } from '@/lib/errors/scrub'

describe('error scrubbing (Phase 7.6)', () => {
  it('removes AI keys and tokens', () => {
    const msg =
      'Request failed for AIzaSyA1234567890abcdefghijklmnopqrs with sk-ant-api03-abcdefghijkl and sk-proj-ABCDEFGHIJKLMNOPQRST, Authorization: Bearer abc.def.ghi'
    const out = scrubMessage(msg)
    expect(out).not.toMatch(/AIza|sk-ant|sk-proj|abc\.def/)
    expect(out).toContain('[secret]')
    expect(scrubMessage('token=0123456789abcdef&x=1')).not.toContain('0123456789abcdef')
    expect(scrubMessage('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl')).toBe(
      'jwt [secret]',
    )
  })

  it('removes map content in quotes, emails and URL queries', () => {
    expect(scrubMessage('Invalid block title "Osmosis is the movement of water" at index 3')).toBe(
      'Invalid block title [text] at index 3',
    )
    expect(scrubMessage('Ungültiger Titel „Zellmembran“ und «الغشاء الخلوي»')).toBe(
      'Ungültiger Titel [text] und [text]',
    )
    expect(scrubMessage('user liv@example.com failed')).toBe('user [email] failed')
    expect(scrubMessage('GET https://x.supabase.co/rest/v1/nodes?select=*&apikey=abc failed')).toBe(
      'GET https://x.supabase.co/rest/v1/nodes failed',
    )
  })

  it('replaces ids and caps length', () => {
    expect(scrubMessage('map 9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70 not found')).toBe(
      'map :id not found',
    )
    expect(scrubMessage('x'.repeat(39) + ' ' + 'word '.repeat(200)).length).toBeLessThanOrEqual(300)
  })

  it('keeps only frame locations from stacks (Chrome and Firefox)', () => {
    const chrome = [
      'TypeError: Cannot read properties of undefined (reading "title")',
      '    at BlockNode (http://localhost:5173/src/features/workspace/canvas/nodes.tsx?t=1:263:20)',
      '    at renderWithHooks (http://localhost:5173/node_modules/.vite/deps/react-dom.js:100:5)',
      '    some content line with Osmosis',
    ].join('\n')
    expect(scrubStack(chrome)).toBe(
      'BlockNode /src/features/workspace/canvas/nodes.tsx:263:20\nrenderWithHooks /node_modules/.vite/deps/react-dom.js:100:5',
    )
    const firefox =
      'onClick@https://mynota.app/assets/index-abc.js:1:2345\n@https://mynota.app/assets/x.js:2:3'
    expect(scrubStack(firefox)).toBe('onClick /assets/index-abc.js:1:2345\n? /assets/x.js:2:3')
    expect(scrubStack(undefined)).toBe('')
  })

  it('routes lose ids and share tokens', () => {
    expect(scrubRoute('/maps/9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70/study')).toBe('/maps/:id/study')
    expect(scrubRoute('/s/Zx8_secretTokenValue-123')).toBe('/s/:token')
  })

  it('a whole report carries no key, content, id or token', () => {
    const e = new Error(
      'Gemini rejected key AIzaSyA1234567890abcdefghijklmnopqrs for "Cell membrane"',
    )
    e.stack = `Error: ${e.message}\n    at callGemini (https://mynota.app/assets/ai-1.js:10:5)`
    const r = buildReport(
      'rejection',
      e,
      '/maps/9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70',
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0 Safari/537.36',
    )
    expect(r).toEqual({
      kind: 'rejection',
      message: 'Error: Gemini rejected key [secret] for [text]',
      stack: 'callGemini /assets/ai-1.js:10:5',
      route: '/maps/:id',
      version: expect.any(String),
      browser: 'Chrome 141 on Linux',
    })
    expect(JSON.stringify(r)).not.toMatch(/AIza|Cell membrane|9d2b8f0e/)
  })

  it('names the browser without details', () => {
    expect(
      shortBrowser(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
      ),
    ).toBe('Firefox 140 on Windows')
    expect(
      shortBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      ),
    ).toBe('Safari 18 on macOS')
  })
})
