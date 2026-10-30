import { describe, expect, it } from 'vitest'
import {
  detectLanguage,
  estimateRun,
  estimateTokens,
  fitsInOneRequest,
  splitParagraphs,
} from '@/ai/pipeline/prepare'

describe('splitParagraphs', () => {
  it('splits on blank lines and numbers from P1', () => {
    const p = splitParagraphs('First para.\n\nSecond para\nstill second.\n\n\n\nThird.')
    expect(p).toEqual([
      { n: 1, text: 'First para.' },
      { n: 2, text: 'Second para\nstill second.' },
      { n: 3, text: 'Third.' },
    ])
  })

  it('handles Windows line endings, trailing spaces and zero-width characters', () => {
    expect(splitParagraphs('A​ line.  \r\n\r\nB line.')).toEqual([
      { n: 1, text: 'A line.' },
      { n: 2, text: 'B line.' },
    ])
  })

  it('splits notes that have no blank lines: headings alone, bullets packed', () => {
    const notes = [
      'Cell Membrane',
      '- phospholipid bilayer',
      '- proteins: channels, carriers',
      'Transport',
      '- passive: no ATP',
      '- active: needs ATP',
    ].join('\n')
    const p = splitParagraphs(notes)
    expect(p.map((x) => x.text)).toEqual([
      'Cell Membrane',
      '- phospholipid bilayer\n- proteins: channels, carriers',
      'Transport',
      '- passive: no ATP\n- active: needs ATP',
    ])
  })

  it('cuts very long paragraphs at sentence ends', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(' ')
    const p = splitParagraphs(long)
    expect(p.length).toBeGreaterThan(1)
    expect(p.every((x) => x.text.length <= 1500)).toBe(true)
    expect(p.map((x) => x.text).join(' ')).toBe(long)
  })

  it('works for Arabic text with Arabic punctuation', () => {
    const p = splitParagraphs('الغشاء الخلوي طبقة مزدوجة.\n\nالنقل النشط يحتاج إلى طاقة؟')
    expect(p).toHaveLength(2)
    expect(p[1]?.text).toBe('النقل النشط يحتاج إلى طاقة؟')
  })

  it('returns nothing for empty input', () => {
    expect(splitParagraphs('   \n\n  ')).toEqual([])
  })
})

describe('detectLanguage', () => {
  it('detects English, German and Arabic', () => {
    expect(
      detectLanguage('The membrane is made of a bilayer and it controls what enters the cell.')
        .lang,
    ).toBe('en')
    expect(
      detectLanguage(
        'Die Zellmembran ist eine Doppelschicht und sie kontrolliert, was in die Zelle gelangt.',
      ).lang,
    ).toBe('de')
    expect(
      detectLanguage('الغشاء الخلوي طبقة مزدوجة من الدهون الفوسفورية تتحكم في دخول المواد').lang,
    ).toBe('ar')
  })
  it('returns null for other or too little text', () => {
    expect(detectLanguage('12345 ---').lang).toBeNull()
    expect(detectLanguage('xyzzy').lang).toBeNull()
  })
})

describe('estimates', () => {
  it('counts Arabic as more tokens per character', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100)
    expect(estimateTokens('ب'.repeat(250))).toBe(100)
  })

  it('estimates 1 outline + 1 request per section', () => {
    const paragraphs = Array.from({ length: 23 }, (_, i) => ({ n: i + 1, text: 'x'.repeat(400) }))
    const e = estimateRun(paragraphs)
    expect(e.requestsMin).toBe(4)
    expect(e.requestsMax).toBe(8)
    expect(e.tokensSent).toBeGreaterThan(e.textTokens * 2)
  })

  it('checks whether the text fits one request for the model', () => {
    const small = [{ n: 1, text: 'x'.repeat(4000) }]
    const huge = [{ n: 1, text: 'x'.repeat(600_000) }]
    expect(fitsInOneRequest(small, 32_000)).toBe(true)
    expect(fitsInOneRequest(huge, 128_000)).toBe(false)
    expect(fitsInOneRequest(huge, 1_000_000)).toBe(true)
  })
})
