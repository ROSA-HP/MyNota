import type { OutlineItem } from '../outline'
import type {
  BlockRow,
  BlockUnit,
  CardTile,
  ChapterUnit,
  CoverOutlineChapter,
  FlowUnit,
  SectionUnit,
  StudyDoc,
  StudyInclude,
  StudyPreset,
  TocEntry,
} from './types'

export function clip(text: string, max: number): string {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return chars.slice(0, max - 1).join('') + '…'
}

export function splitCloze(text: string): Array<{ text: string; gap: boolean }> {
  const res: Array<{ text: string; gap: boolean }> = []
  const re = /\{\{(.+?)(?:::.*?)?\}\}/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      const plain = text.slice(lastIndex, m.index)
      if (plain.length > 0) {
        res.push({ text: plain, gap: false })
      }
    }
    res.push({ text: m[1] ?? '', gap: true })
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex)
    if (rest.length > 0) {
      res.push({ text: rest, gap: false })
    }
  }
  return res
}

export function arrowFor(outgoing: boolean, dir: 'ltr' | 'rtl'): string {
  if (dir === 'rtl') {
    return outgoing ? '←' : '→'
  }
  return outgoing ? '→' : '←'
}

export function buildStudyDoc(input: {
  title: string
  kind: 'book' | 'notes' | 'blank'
  preset: StudyPreset
  dir: 'ltr' | 'rtl'
  items: OutlineItem[]
  include: StudyInclude
}): StudyDoc {
  const { title, kind, preset, dir, items, include } = input

  // 1. Keep flags
  const keep: boolean[] = new Array(items.length).fill(true)
  if (preset === 'summary') {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it) continue
      if (it.level === 'block') {
        let hasCore = it.importance === 'core'
        if (!hasCore) {
          for (let j = i + 1; j < items.length; j++) {
            const child = items[j]
            if (!child || child.depth <= it.depth) break
            if (child.importance === 'core') {
              hasCore = true
              break
            }
          }
        }
        keep[i] = hasCore
      }
    }
  }

  // 2. Build flow units
  let flow: FlowUnit[] = []
  if (preset !== 'cards' && preset !== 'maps') {
    let headingDepth = -1
    for (let i = 0; i < items.length; i++) {
      if (!keep[i]) continue
      const item = items[i]
      if (!item) continue

      if (item.level === 'book') {
        headingDepth = item.depth
        continue
      }

      if (item.level === 'chapter') {
        headingDepth = item.depth
        const chapterUnit: ChapterUnit = {
          kind: 'chapter',
          id: item.id,
          number: 0,
          title: item.title.trim() || '—',
          summary: item.summary,
          color: item.color,
          dir: item.dir,
        }
        flow.push(chapterUnit)
        continue
      }

      if (item.level === 'section') {
        headingDepth = item.depth
        const sectionUnit: SectionUnit = {
          kind: 'section',
          id: item.id,
          label: '',
          title: item.title.trim() || '—',
          summary: item.summary,
          color: item.color,
          dir: item.dir,
        }
        flow.push(sectionUnit)
        continue
      }

      if (item.level === 'block') {
        const rawRel = item.depth - headingDepth - 1
        const relDepth = Math.max(0, Math.min(3, rawRel)) as 0 | 1 | 2 | 3
        const rows: BlockRow[] = []

        // (a) summary
        if (item.summary && item.summary.trim() !== '') {
          rows.push({ kind: 'summary', text: item.summary })
        }

        // (b) detailBlocks
        for (const detail of item.detailBlocks) {
          if (preset === 'summary') {
            if (detail.kind === 'formula') {
              rows.push({ kind: 'detail', detail })
            }
          } else {
            rows.push({ kind: 'detail', detail })
          }
        }

        // (c) links
        if (preset === 'notes' && include.links) {
          for (const l of item.links) {
            rows.push({ kind: 'link', label: l.label, other: l.other, outgoing: l.outgoing })
          }
        }

        // (d) source
        if (include.sources && item.page !== null) {
          rows.push({ kind: 'source', page: item.page })
        }

        // (e) cards
        if (preset === 'notes' && include.cards && item.cards.length > 0) {
          rows.push({ kind: 'cardsHead' })
          for (const c of item.cards) {
            rows.push({ kind: 'card', front: c.front, back: c.back })
          }
        }

        const blockUnit: BlockUnit = {
          kind: 'block',
          id: item.id,
          relDepth,
          title: item.title.trim() || '—',
          type: item.type,
          importance: item.importance,
          color: item.color,
          dir: item.dir,
          aiAdded: item.aiAdded,
          rows,
        }
        flow.push(blockUnit)
      }
    }

    // 4. Pruning (only when preset is 'summary')
    if (preset === 'summary') {
      // First remove every SectionUnit whose next unit is not a BlockUnit (or that has no next unit)
      const afterSectionPrune: FlowUnit[] = []
      for (let i = 0; i < flow.length; i++) {
        const u = flow[i]
        if (!u) continue
        if (u.kind === 'section') {
          const next = flow[i + 1]
          if (!next || next.kind !== 'block') {
            continue
          }
        }
        afterSectionPrune.push(u)
      }

      // Then remove every ChapterUnit whose next unit is a ChapterUnit or missing
      const afterChapterPrune: FlowUnit[] = []
      for (let i = 0; i < afterSectionPrune.length; i++) {
        const u = afterSectionPrune[i]
        if (!u) continue
        if (u.kind === 'chapter') {
          const next = afterSectionPrune[i + 1]
          if (!next || next.kind === 'chapter') {
            continue
          }
        }
        afterChapterPrune.push(u)
      }
      flow = afterChapterPrune
    }

    // 5. Numbering
    let chapterCounter = 0
    let sectionCounter = 0
    for (const u of flow) {
      if (u.kind === 'chapter') {
        chapterCounter++
        u.number = chapterCounter
        sectionCounter = 0
      } else if (u.kind === 'section') {
        sectionCounter++
        u.label =
          chapterCounter > 0 ? `${chapterCounter}.${sectionCounter}` : String(sectionCounter)
      }
    }
  }

  // 6. toc
  let toc: TocEntry[] = []
  if (preset === 'notes' || preset === 'summary') {
    flow.forEach((u, idx) => {
      if (u.kind === 'chapter') {
        toc.push({
          unitIndex: idx,
          level: 'chapter',
          label: String(u.number),
          title: u.title,
          color: u.color,
          dir: u.dir,
        })
      } else if (u.kind === 'section') {
        toc.push({
          unitIndex: idx,
          level: 'section',
          label: u.label,
          title: u.title,
          color: u.color,
          dir: u.dir,
        })
      }
    })
    if (toc.length < 2) {
      toc = []
    }
  }

  // 7. tiles
  const tiles: CardTile[] = []
  if (preset === 'cards') {
    let n = 1
    for (const it of items) {
      for (const c of it.cards) {
        tiles.push({
          n: n++,
          front: c.front,
          back: c.back,
          title: it.title,
          color: it.color,
          dir: it.dir,
        })
      }
    }
  }

  // 8. tabs & coverOutline
  const tabs = flow
    .filter((u): u is ChapterUnit => u.kind === 'chapter')
    .map((c) => ({ number: c.number, title: c.title, color: c.color }))

  const coverOutline: CoverOutlineChapter[] = []

  if (flow.length > 0) {
    let standaloneGroup: CoverOutlineChapter | null = null
    for (const u of flow) {
      if (u.kind === 'chapter') {
        coverOutline.push({
          number: u.number,
          title: u.title,
          summary: u.summary,
          color: u.color,
          dir: u.dir,
          sections: [],
        })
      } else if (u.kind === 'section') {
        const lastChapter = coverOutline[coverOutline.length - 1]
        const secEntry = { label: u.label, title: u.title, summary: u.summary, dir: u.dir }
        if (lastChapter && lastChapter.number !== null) {
          lastChapter.sections.push(secEntry)
        } else {
          if (!standaloneGroup) {
            standaloneGroup = {
              number: null,
              title: '',
              color: u.color,
              dir,
              sections: [],
            }
            coverOutline.push(standaloneGroup)
          }
          standaloneGroup.sections.push(secEntry)
        }
      }
    }
  } else {
    let chNo = 0
    let secNo = 0
    let standaloneGroup: CoverOutlineChapter | null = null
    for (const it of items) {
      if (it.level === 'chapter') {
        chNo++
        secNo = 0
        coverOutline.push({
          number: chNo,
          title: it.title.trim() || '—',
          summary: it.summary,
          color: it.color,
          dir: it.dir,
          sections: [],
        })
      } else if (it.level === 'section') {
        secNo++
        const label = chNo > 0 ? `${chNo}.${secNo}` : String(secNo)
        const lastChapter = coverOutline[coverOutline.length - 1]
        const secEntry = {
          label,
          title: it.title.trim() || '—',
          summary: it.summary,
          dir: it.dir,
        }
        if (lastChapter && lastChapter.number !== null) {
          lastChapter.sections.push(secEntry)
        } else {
          if (!standaloneGroup) {
            standaloneGroup = {
              number: null,
              title: '',
              color: it.color,
              dir,
              sections: [],
            }
            coverOutline.push(standaloneGroup)
          }
          standaloneGroup.sections.push(secEntry)
        }
      }
    }
  }

  // 9. stats
  let chapters = 0
  let sections = 0
  let blocks = 0
  let formulas = 0
  let cards = 0

  if (flow.length > 0) {
    for (const u of flow) {
      if (u.kind === 'chapter') chapters++
      else if (u.kind === 'section') sections++
      else if (u.kind === 'block') {
        blocks++
        for (const r of u.rows) {
          if (r.kind === 'detail' && r.detail.kind === 'formula') formulas++
          else if (r.kind === 'card') cards++
        }
      }
    }
  } else {
    for (const it of items) {
      if (it.level === 'chapter') chapters++
      else if (it.level === 'section') sections++
      else if (it.level === 'block') blocks++
      for (const d of it.detailBlocks) {
        if (d.kind === 'formula') formulas++
      }
      cards += it.cards.length
    }
  }

  return {
    title,
    kind,
    preset,
    dir,
    flow,
    toc,
    tiles,
    tabs,
    coverOutline,
    stats: { chapters, sections, blocks, formulas, cards },
  }
}
