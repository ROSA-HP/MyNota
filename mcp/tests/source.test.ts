// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { jsPDF } from 'jspdf'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SourceError, readSource } from '../source'
import { isSecretKey } from '../config'
import { useTempData } from './helpers'

let temp: ReturnType<typeof useTempData>
const file = (name: string, content: string | Uint8Array) => {
  const path = join(temp.dir, name)
  writeFileSync(path, content)
  return path
}

beforeAll(() => {
  temp = useTempData()
})
afterAll(() => temp.done())

/** A text PDF with a big heading at the top of each chapter's first page. */
function bookPdf(): Uint8Array {
  const doc = new jsPDF()
  const body =
    'Light is a wave that spreads out when it passes through a narrow opening in a barrier.'
  ;['Chapter 1: Waves', 'Chapter 2: Optics', 'Index'].forEach((title, i) => {
    if (i) doc.addPage()
    doc.setFontSize(26).text(title, 20, 30)
    doc.setFontSize(11)
    for (let line = 0; line < 8; line++) doc.text(`${body} (${i + 1}.${line})`, 20, 50 + line * 8)
  })
  doc.addPage() // a page with nothing to read, like a scan
  return new Uint8Array(doc.output('arraybuffer'))
}

describe('reading a source', () => {
  it('numbers the paragraphs of a text file and finds the language', async () => {
    const path = file(
      'photosynthese.md',
      'Der Baum wächst im Wald.\n\nEr ist nicht klein und auch sehr alt.',
    )
    const source = await readSource({ path })
    expect(source.kind).toBe('text')
    expect(source.title).toBe('photosynthese')
    expect(source.language).toBe('de')
    expect(source.chapters).toHaveLength(1)
    expect(source.chapters[0]?.paragraphs.map((p) => p.n)).toEqual([1, 2])
  })

  it('takes text directly, keeping every word', async () => {
    const source = await readSource({ text: 'First point.\n\nSecond point.', title: 'My notes' })
    expect(source.title).toBe('My notes')
    expect(source.chapters[0]?.paragraphs.map((p) => p.text)).toEqual([
      'First point.',
      'Second point.',
    ])
  })

  it('reads a PDF into chapters with the same rules as the browser', async () => {
    const path = file('book.pdf', bookPdf())
    const source = await readSource({ path })
    expect(source.kind).toBe('pdf')
    expect(source.pageCount).toBe(4)
    expect(source.file?.name).toBe('book.pdf')
    expect(source.file?.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(source.chapters.map((c) => c.title)).toEqual([
      'Chapter 1: Waves',
      'Chapter 2: Optics',
      'Index',
    ])
    expect(source.chapters.map((c) => c.kind)).toEqual(['chapter', 'chapter', 'back'])
    const first = source.chapters[0]?.paragraphs[0]
    expect(first?.n).toBe(1)
    expect(first?.page).toBe(1)
    expect(source.chapters[1]?.paragraphs.every((p) => p.page === 2)).toBe(true)
  })

  it('says which pages had no text, instead of dropping them silently', async () => {
    const source = await readSource({ path: file('book2.pdf', bookPdf()) })
    expect(source.pagesWithoutText).toEqual([4])
  })

  it('refuses anything that is not a study file', async () => {
    const secret = file('.env', 'SECRET=1')
    await expect(readSource({ path: secret })).rejects.toBeInstanceOf(SourceError)
    await expect(readSource({ path: file('id_rsa', 'key') })).rejects.toThrow(/Only .pdf/)
    await expect(readSource({ path: file('run.exe', 'x') })).rejects.toThrow(/Only .pdf/)
  })

  it('explains a missing file and an empty text', async () => {
    await expect(readSource({ path: join(temp.dir, 'nope.pdf') })).rejects.toThrow(/no file/)
    await expect(readSource({ text: '   ' })).rejects.toThrow(/no text/)
    await expect(readSource({})).rejects.toThrow(/file path/)
  })

  it('refuses a damaged PDF with a clear message', async () => {
    const path = file('broken.pdf', 'this is not a pdf')
    await expect(readSource({ path })).rejects.toThrow(/could not be read/)
  })
})

describe('the Supabase key', () => {
  const token = (role: string) =>
    `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`

  it('refuses keys that would skip the permission checks', () => {
    expect(isSecretKey('sb_secret_abc')).toBe(true)
    expect(isSecretKey(token('service_role'))).toBe(true)
  })

  it('accepts the public keys', () => {
    expect(isSecretKey('sb_publishable_abc')).toBe(false)
    expect(isSecretKey(token('anon'))).toBe(false)
  })
})
