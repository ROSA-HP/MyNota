import React from 'react'
import { MathFormula } from '@/components/ui/MathFormula'
import { TYPE_ICON } from '@/features/workspace/canvas/visuals'
import type { ChapterColor } from '@/lib/database.types'
import { arrowFor, clip, splitCloze } from './model'
import {
  BORDER,
  CHAPTER_FILL,
  COLORS,
  FONT_MONO,
  PAD,
  RADIUS,
  SHADOW,
  TEXT,
  fontFor,
  mmToPx,
  textStyle,
} from './tokens'
import type { BlockRow, CardTile, FlowUnit, PaperTone, StudyLabels } from './types'

export function PageShell({
  w,
  h,
  tone,
  dir,
  children,
}: {
  w: number
  h: number
  tone: PaperTone
  dir: 'ltr' | 'rtl'
  children: React.ReactNode
}) {
  return (
    <div
      data-page=""
      dir={dir}
      style={{
        boxSizing: 'border-box',
        margin: 0,
        position: 'relative',
        width: w,
        height: h,
        overflow: 'hidden',
        background: tone === 'mint' ? COLORS.mintFrost : COLORS.white,
        color: COLORS.ink,
        fontFamily: fontFor(dir),
      }}
    >
      {children}
    </div>
  )
}

export function ContentPage({
  size,
  body,
  tone,
  dir,
  headerTitle,
  headerChapter,
  headerTag,
  pageNo,
  total,
  children,
}: {
  size: { w: number; h: number }
  body: { x: number; y: number; w: number; h: number }
  tone: PaperTone
  dir: 'ltr' | 'rtl'
  headerTitle: string
  headerChapter: { label: string; title: string; color: ChapterColor } | null
  headerTag: string | null
  pageNo: number
  total: number
  children: React.ReactNode
}) {
  return (
    <PageShell w={size.w} h={size.h} tone={tone} dir={dir}>
      {/* Header */}
      <div
        style={{
          boxSizing: 'border-box',
          margin: 0,
          position: 'absolute',
          left: body.x,
          width: body.w,
          top: mmToPx(10),
          height: mmToPx(8),
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: BORDER,
        }}
      >
        <span
          style={{
            ...textStyle('monoSmall', dir),
            minWidth: 0,
            flex: 1,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
          }}
        >
          {clip(headerTitle, 60)}
        </span>
        <div
          style={{
            flexShrink: 0,
            maxWidth: '55%',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {headerChapter ? (
            <>
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  width: 10,
                  height: 10,
                  background: CHAPTER_FILL[headerChapter.color],
                  border: BORDER,
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  ...textStyle('monoSmall', dir),
                  color: COLORS.charcoal,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {headerChapter.label} . {clip(headerChapter.title, 40)}
              </span>
            </>
          ) : headerTag ? (
            <span
              style={{
                ...textStyle('monoSmall', dir),
                color: COLORS.charcoal,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              {headerTag}
            </span>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          boxSizing: 'border-box',
          margin: 0,
          position: 'absolute',
          left: body.x,
          top: body.y,
          width: body.w,
          height: body.h,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>

      {/* Footer */}
      <div
        style={{
          boxSizing: 'border-box',
          margin: 0,
          position: 'absolute',
          left: body.x,
          width: body.w,
          bottom: mmToPx(10),
          height: mmToPx(8),
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: BORDER,
        }}
      >
        <span style={{ ...textStyle('footer', dir), color: COLORS.ink }}>MyNota</span>
        <span style={{ ...textStyle('footer', 'ltr'), direction: 'ltr', color: COLORS.ink }}>
          {pageNo} / {total}
        </span>
      </div>
    </PageShell>
  )
}

export function CoverPage({
  size,
  tone,
  dir,
  title,
  kindLabel,
  stickerLabel,
  stats,
  tabs,
  moreLabel,
  madeWith,
}: {
  size: { w: number; h: number }
  tone: PaperTone
  dir: 'ltr' | 'rtl'
  title: string
  kindLabel: string
  stickerLabel: string
  stats: Array<{ n: number; label: string }>
  tabs: Array<{ number: number; title: string; color: ChapterColor }>
  moreLabel: string | null
  madeWith: string
}) {
  const visibleStats = stats.filter((s) => s.n > 0)
  const visibleTabs = tabs.slice(0, 12)

  return (
    <PageShell w={size.w} h={size.h} tone={tone} dir={dir}>
      <div
        style={{
          boxSizing: 'border-box',
          margin: 0,
          position: 'absolute',
          top: mmToPx(14),
          bottom: mmToPx(14),
          left: mmToPx(14),
          right: mmToPx(14),
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {/* Top */}
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            background: COLORS.white,
            border: BORDER,
            borderRadius: RADIUS.pill,
            padding: '4px 12px',
            ...textStyle('monoSmall', dir),
            boxShadow: `2px 2px 0 ${COLORS.ink}`,
            alignSelf: 'flex-start',
          }}
        >
          MyNota
        </div>

        {/* Middle */}
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 28,
          }}
        >
          {/* Title card */}
          <div
            style={{
              boxSizing: 'border-box',
              margin: 0,
              position: 'relative',
              background: COLORS.white,
              border: BORDER,
              borderRadius: RADIUS.big,
              boxShadow: SHADOW.cover,
              padding: '32px 32px 36px',
            }}
          >
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                display: 'inline-flex',
                background: COLORS.surgicalTeal,
                color: COLORS.mintFrost,
                border: BORDER,
                borderRadius: RADIUS.pill,
                padding: '3px 12px',
                ...textStyle('monoSmall', dir),
                marginBottom: 18,
              }}
            >
              {kindLabel}
            </div>

            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                ...textStyle('coverTitle', dir),
                overflowWrap: 'anywhere',
              }}
            >
              {clip(title, 140)}
            </div>

            {/* Tilted sticker */}
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                position: 'absolute',
                top: -16,
                insetInlineEnd: 24,
                transform: 'rotate(-4deg)',
                background: CHAPTER_FILL.yellow,
                border: BORDER,
                borderRadius: 8,
                padding: '5px 12px',
                ...textStyle('mono', dir),
                boxShadow: `2px 2px 0 ${COLORS.ink}`,
              }}
            >
              {stickerLabel}
            </div>
          </div>

          {/* Stats row */}
          {visibleStats.length > 0 && (
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              {visibleStats.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    background: COLORS.white,
                    border: BORDER,
                    borderRadius: RADIUS.pill,
                    padding: '6px 14px',
                    boxShadow: SHADOW.card,
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {s.n}
                  </span>
                  <span
                    style={{
                      ...textStyle('small', dir),
                      color: COLORS.charcoal,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Tabs row */}
          {tabs.length >= 2 && (
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {visibleTabs.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    background: CHAPTER_FILL[t.color],
                    border: BORDER,
                    borderRadius: 8,
                    padding: '4px 10px',
                    maxWidth: 220,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {t.number}
                  </span>
                  <span
                    style={{
                      ...textStyle('small', dir),
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                    }}
                  >
                    {t.title}
                  </span>
                </div>
              ))}
              {moreLabel !== null && (
                <div
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    background: COLORS.white,
                    border: BORDER,
                    borderRadius: 8,
                    padding: '4px 10px',
                    ...textStyle('small', dir),
                    fontWeight: 700,
                  }}
                >
                  {moreLabel}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom */}
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            ...textStyle('footer', dir),
            color: COLORS.charcoal,
            alignSelf: 'flex-start',
          }}
        >
          {madeWith}
        </div>
      </div>
    </PageShell>
  )
}

export function TocPage({
  size,
  body,
  tone,
  dir,
  headerTitle,
  pageNo,
  total,
  contentsLabel,
  rows,
}: {
  size: { w: number; h: number }
  body: { x: number; y: number; w: number; h: number }
  tone: PaperTone
  dir: 'ltr' | 'rtl'
  headerTitle: string
  pageNo: number
  total: number
  contentsLabel: string
  rows: Array<{
    level: 'chapter' | 'section'
    label: string
    title: string
    color: ChapterColor
    page: number
    dir: 'ltr' | 'rtl'
  }>
}) {
  return (
    <ContentPage
      size={size}
      body={body}
      tone={tone}
      dir={dir}
      headerTitle={headerTitle}
      headerChapter={null}
      headerTag={null}
      pageNo={pageNo}
      total={total}
    >
      <div
        style={{
          boxSizing: 'border-box',
          margin: 0,
          width: 'fit-content',
          height: 40,
          display: 'flex',
          alignItems: 'center',
          background: COLORS.white,
          border: BORDER,
          borderRadius: RADIUS.card,
          boxShadow: SHADOW.chapter,
          padding: '0 18px',
          ...textStyle('h1', dir),
          marginBottom: 24,
        }}
      >
        {contentsLabel}
      </div>

      {rows.map((row, idx) => {
        const isChapter = row.level === 'chapter'
        return (
          <div
            key={idx}
            data-toc-page={row.page}
            dir={row.dir}
            style={{
              boxSizing: 'border-box',
              margin: 0,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              height: isChapter ? 32 : 26,
              overflow: 'hidden',
              paddingInlineStart: isChapter ? 0 : 36,
            }}
          >
            {isChapter ? (
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  width: 26,
                  height: 26,
                  background: CHAPTER_FILL[row.color],
                  border: BORDER,
                  borderRadius: RADIUS.tile,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {row.label}
              </div>
            ) : (
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  fontWeight: 700,
                  color: COLORS.charcoal,
                  flexShrink: 0,
                }}
              >
                {row.label}
              </span>
            )}

            <div style={{ width: 10, flexShrink: 0 }} />

            <span
              style={{
                ...(isChapter ? textStyle('blockTitle', row.dir) : textStyle('detail', row.dir)),
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
              }}
            >
              {row.title}
            </span>

            <div
              style={{
                flex: 1,
                height: 0,
                borderBottom: `2px dotted ${COLORS.charcoal}`,
                margin: '0 8px',
              }}
            />

            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: isChapter ? 12 : 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {row.page}
            </span>
          </div>
        )
      })}
    </ContentPage>
  )
}

export function FormulaBox({
  latex,
  variables,
  dir,
}: {
  latex: string
  variables?: string
  dir: 'ltr' | 'rtl'
}) {
  return (
    <div
      style={{
        boxSizing: 'border-box',
        margin: 0,
        background: COLORS.bioSlate,
        border: BORDER,
        borderRadius: 8,
        padding: '8px 12px',
        textAlign: 'center',
        overflow: 'hidden',
      }}
    >
      <span style={{ fontSize: 15 }}>
        <MathFormula latex={latex} display />
      </span>
      {variables && (
        <div
          dir={dir}
          style={{
            boxSizing: 'border-box',
            margin: 0,
            marginTop: 4,
            textAlign: 'start',
            direction: dir,
            ...textStyle('small', dir),
            color: COLORS.charcoal,
          }}
        >
          {variables}
        </div>
      )}
    </div>
  )
}

function RenderRow({
  row,
  dir,
  labels,
}: {
  row: BlockRow
  dir: 'ltr' | 'rtl'
  labels: StudyLabels
}) {
  switch (row.kind) {
    case 'summary':
      return (
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            ...textStyle('summary', dir),
            color: COLORS.ink,
          }}
        >
          {row.text}
        </div>
      )
    case 'detail': {
      const d = row.detail
      switch (d.kind) {
        case 'text':
          return (
            <div style={{ boxSizing: 'border-box', margin: 0, ...textStyle('detail', dir) }}>
              {d.text}
            </div>
          )
        case 'bullet':
          return (
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                display: 'flex',
                flexDirection: 'row',
                gap: 7,
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  width: 6,
                  height: 6,
                  background: COLORS.ink,
                  borderRadius: 1,
                  flexShrink: 0,
                  marginTop: Math.floor(TEXT.detail.line / 2) - 3,
                }}
              />
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  flex: 1,
                  minWidth: 0,
                  ...textStyle('detail', dir),
                }}
              >
                {d.text}
              </div>
            </div>
          )
        case 'example':
          return (
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                borderInlineStart: `3px solid ${COLORS.ink}`,
                paddingInlineStart: 8,
              }}
            >
              <div style={{ boxSizing: 'border-box', margin: 0, ...textStyle('detail', dir) }}>
                {d.text}
              </div>
              {d.translation && (
                <div
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    ...textStyle('small', dir),
                    color: COLORS.charcoal,
                    marginTop: 2,
                  }}
                >
                  {d.translation}
                </div>
              )}
            </div>
          )
        case 'cloze':
          return (
            <div style={{ boxSizing: 'border-box', margin: 0, ...textStyle('detail', dir) }}>
              {splitCloze(d.text).map((seg, idx) => (
                <span
                  key={idx}
                  style={seg.gap ? { fontWeight: 700, textDecoration: 'underline 2px' } : undefined}
                >
                  {seg.text}
                </span>
              ))}
            </div>
          )
        case 'vocab':
          return (
            <div style={{ boxSizing: 'border-box', margin: 0, ...textStyle('detail', dir) }}>
              <span style={{ fontWeight: 700 }}>
                {[d.article, d.term].filter(Boolean).join(' ')}
              </span>
              {d.plural && <span> ({d.plural})</span>}
              {d.meaning && <span style={{ color: COLORS.charcoal }}> — {d.meaning}</span>}
            </div>
          )
        case 'formula':
          return <FormulaBox latex={d.latex} variables={d.variables} dir={dir} />
        case 'question':
          return (
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '0 6px',
                    borderRadius: 4,
                    border: BORDER,
                    background: COLORS.ink,
                    color: COLORS.mintFrost,
                    flexShrink: 0,
                  }}
                >
                  {labels.q}
                </span>
                <span style={{ ...textStyle('detail', dir), fontWeight: 700 }}>{d.front}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '0 6px',
                    borderRadius: 4,
                    border: BORDER,
                    background: COLORS.cyanGlow,
                    color: COLORS.ink,
                    flexShrink: 0,
                  }}
                >
                  {labels.a}
                </span>
                <span style={{ ...textStyle('detail', dir) }}>{d.back}</span>
              </div>
            </div>
          )
      }
      break
    }
    case 'link':
      return (
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            display: 'flex',
            flexDirection: 'row',
            gap: 6,
            alignItems: 'baseline',
          }}
        >
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700 }}>
            {arrowFor(row.outgoing, dir)}
          </span>
          <span style={{ ...textStyle('small', dir), fontWeight: 700 }}>{row.label}</span>
          <span style={{ ...textStyle('small', dir), color: COLORS.charcoal }}>: {row.other}</span>
        </div>
      )
    case 'source':
      return (
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            textAlign: 'end',
            ...textStyle('monoSmall', dir),
            color: COLORS.charcoal,
          }}
        >
          {labels.page(row.page)}
        </div>
      )
    case 'cardsHead':
      return (
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            ...textStyle('monoSmall', dir),
            color: COLORS.charcoal,
            marginTop: 2,
          }}
        >
          {labels.flashcards}
        </div>
      )
    case 'card':
      return (
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            background: COLORS.parchment,
            border: `2px dashed ${COLORS.charcoal}`,
            borderRadius: 6,
            padding: '5px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ ...textStyle('small', dir), fontWeight: 700 }}>
            {labels.q} {row.front}
          </div>
          <div style={{ ...textStyle('small', dir) }}>
            {labels.a} {row.back}
          </div>
        </div>
      )
  }
}

export function FlowUnitView({
  unit,
  dir,
  labels,
  aiTags,
  atTop,
  rowFrom = 0,
  rowTo,
  continued = false,
}: {
  unit: FlowUnit
  dir: 'ltr' | 'rtl'
  labels: StudyLabels
  aiTags: boolean
  atTop: boolean
  rowFrom?: number
  rowTo?: number
  continued?: boolean
}) {
  if (unit.kind === 'chapter') {
    return (
      <div
        dir={dir}
        style={{
          boxSizing: 'border-box',
          margin: 0,
          paddingTop: atTop ? 0 : PAD.chapterTop,
          paddingBottom: PAD.chapterBottom,
        }}
      >
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            display: 'flex',
            flexDirection: 'row',
            background: COLORS.white,
            border: BORDER,
            borderRadius: RADIUS.card,
            boxShadow: SHADOW.chapter,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              boxSizing: 'border-box',
              margin: 0,
              width: 64,
              flexShrink: 0,
              background: CHAPTER_FILL[unit.color],
              borderInlineEnd: BORDER,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <span style={{ ...textStyle('monoSmall', dir) }}>{labels.chapter}</span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 22,
                lineHeight: '26px',
                fontWeight: 700,
              }}
            >
              {unit.number}
            </span>
          </div>

          <div
            dir={unit.dir}
            style={{
              boxSizing: 'border-box',
              margin: 0,
              flex: 1,
              minWidth: 0,
              padding: '12px 16px',
              direction: unit.dir,
            }}
          >
            <div style={{ boxSizing: 'border-box', margin: 0, ...textStyle('h1', unit.dir) }}>
              {unit.title}
            </div>
            {unit.summary && (
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  ...textStyle('detail', unit.dir),
                  color: COLORS.charcoal,
                  marginTop: 4,
                }}
              >
                {unit.summary}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (unit.kind === 'section') {
    return (
      <div
        dir={dir}
        style={{
          boxSizing: 'border-box',
          margin: 0,
          paddingTop: atTop ? 0 : PAD.sectionTop,
          paddingBottom: PAD.sectionBottom,
        }}
      >
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              boxSizing: 'border-box',
              margin: 0,
              fontFamily: FONT_MONO,
              fontSize: 10,
              lineHeight: '13px',
              fontWeight: 700,
              direction: 'ltr',
              background: CHAPTER_FILL[unit.color],
              border: BORDER,
              borderRadius: RADIUS.pill,
              padding: '2px 9px',
              whiteSpace: 'nowrap',
            }}
          >
            {unit.label}
          </div>

          <div
            dir={unit.dir}
            style={{
              boxSizing: 'border-box',
              margin: 0,
              flex: 1,
              minWidth: 0,
              direction: unit.dir,
              ...textStyle('h2', unit.dir),
            }}
          >
            {unit.title}
          </div>
        </div>

        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            height: 2,
            background: COLORS.ink,
            marginTop: 6,
          }}
        />

        {unit.summary && (
          <div
            dir={unit.dir}
            style={{
              boxSizing: 'border-box',
              margin: 0,
              direction: unit.dir,
              ...textStyle('summary', unit.dir),
              color: COLORS.charcoal,
              paddingTop: 6,
            }}
          >
            {unit.summary}
          </div>
        )}
      </div>
    )
  }

  // Block unit
  const totalRows = unit.rows.length
  const to = rowTo ?? totalRows
  const visibleRows = unit.rows.slice(rowFrom, to)
  const IconComponent = unit.type ? TYPE_ICON[unit.type] : null

  return (
    <div
      dir={dir}
      style={{
        boxSizing: 'border-box',
        margin: 0,
        direction: dir,
        paddingInlineStart: unit.relDepth * PAD.blockIndent,
        paddingBottom: PAD.blockBottom,
      }}
    >
      <div
        dir={unit.dir}
        style={{
          boxSizing: 'border-box',
          margin: 0,
          direction: unit.dir,
          fontFamily: fontFor(unit.dir),
          background: COLORS.white,
          border: BORDER,
          borderRadius: RADIUS.card,
          boxShadow: SHADOW.card,
          overflow: 'hidden',
        }}
      >
        {/* Head */}
        <div
          data-part="head"
          style={{
            boxSizing: 'border-box',
            margin: 0,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            background: CHAPTER_FILL[unit.color],
            borderBottom: visibleRows.length > 0 ? BORDER : undefined,
          }}
        >
          {unit.type !== null && IconComponent && (
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                width: 22,
                height: 22,
                border: BORDER,
                borderRadius: RADIUS.pill,
                background: unit.type === 'warning' ? COLORS.softPeach : COLORS.white,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <IconComponent size={12} strokeWidth={2.5} color={COLORS.ink} />
            </div>
          )}

          <div
            style={{
              boxSizing: 'border-box',
              margin: 0,
              flex: 1,
              minWidth: 0,
              overflowWrap: 'anywhere',
              ...textStyle('blockTitle', unit.dir),
            }}
          >
            {unit.title}
          </div>

          <div
            style={{
              boxSizing: 'border-box',
              margin: 0,
              display: 'flex',
              gap: 6,
              flexShrink: 0,
              alignItems: 'center',
            }}
          >
            {continued ? (
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  background: COLORS.white,
                  border: `2px dashed ${COLORS.ink}`,
                  borderRadius: RADIUS.pill,
                  padding: '1px 7px',
                  ...textStyle('monoSmall', unit.dir),
                }}
              >
                {labels.continued}
              </div>
            ) : (
              <>
                {unit.type !== null && (
                  <span style={{ ...textStyle('monoSmall', unit.dir) }}>
                    {labels.types[unit.type]}
                  </span>
                )}
                {unit.importance === 'core' && (
                  <div
                    style={{
                      boxSizing: 'border-box',
                      margin: 0,
                      background: COLORS.ink,
                      color: COLORS.mintFrost,
                      border: BORDER,
                      borderRadius: RADIUS.pill,
                      padding: '1px 7px',
                      ...textStyle('monoSmall', unit.dir),
                    }}
                  >
                    {labels.importance.core}
                  </div>
                )}
                {unit.importance === 'extra' && (
                  <div
                    style={{
                      boxSizing: 'border-box',
                      margin: 0,
                      background: 'transparent',
                      border: `2px dashed ${COLORS.ink}`,
                      borderRadius: RADIUS.pill,
                      padding: '1px 7px',
                      ...textStyle('monoSmall', unit.dir),
                    }}
                  >
                    {labels.importance.extra}
                  </div>
                )}
                {aiTags && unit.aiAdded && (
                  <div
                    style={{
                      boxSizing: 'border-box',
                      margin: 0,
                      background: COLORS.parchment,
                      border: `2px dashed ${COLORS.ink}`,
                      borderRadius: RADIUS.pill,
                      padding: '1px 7px',
                      ...textStyle('monoSmall', unit.dir),
                    }}
                  >
                    {labels.addedByAi}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Body */}
        {visibleRows.length > 0 && (
          <div
            style={{
              boxSizing: 'border-box',
              margin: 0,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: PAD.rowGap,
            }}
          >
            {visibleRows.map((row, idx) => {
              const realIndex = rowFrom + idx
              return (
                <div
                  key={realIndex}
                  data-row={realIndex}
                  style={{ boxSizing: 'border-box', margin: 0 }}
                >
                  <RenderRow row={row} dir={unit.dir} labels={labels} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function CardTileView({
  tile,
  mode,
  labels,
  width,
}: {
  tile: CardTile
  mode: 'full' | 'front' | 'answer'
  labels: StudyLabels
  width: number
}) {
  return (
    <div
      dir={tile.dir}
      style={{
        boxSizing: 'border-box',
        margin: 0,
        width,
        background: COLORS.white,
        border: BORDER,
        borderRadius: RADIUS.card,
        boxShadow: SHADOW.card,
        overflow: 'hidden',
        direction: tile.dir,
      }}
    >
      {/* Head */}
      <div
        style={{
          boxSizing: 'border-box',
          margin: 0,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          padding: '5px 8px',
          background: CHAPTER_FILL[tile.color],
          borderBottom: BORDER,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          #{tile.n}
        </span>
        <span
          style={{
            ...textStyle('small', tile.dir),
            fontWeight: 700,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
          }}
        >
          {tile.title}
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          boxSizing: 'border-box',
          margin: 0,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {mode === 'full' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '0 6px',
                  borderRadius: 4,
                  border: BORDER,
                  background: COLORS.ink,
                  color: COLORS.mintFrost,
                  flexShrink: 0,
                }}
              >
                {labels.q}
              </span>
              <span style={{ ...textStyle('summary', tile.dir), fontWeight: 700 }}>
                {tile.front}
              </span>
            </div>
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                borderTop: `2px dashed ${COLORS.charcoal}`,
                paddingTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '0 6px',
                  borderRadius: 4,
                  border: BORDER,
                  background: COLORS.cyanGlow,
                  color: COLORS.ink,
                  flexShrink: 0,
                }}
              >
                {labels.a}
              </span>
              <span style={{ ...textStyle('detail', tile.dir) }}>{tile.back}</span>
            </div>
          </>
        )}

        {mode === 'front' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 9,
                fontWeight: 700,
                padding: '0 6px',
                borderRadius: 4,
                border: BORDER,
                background: COLORS.ink,
                color: COLORS.mintFrost,
                flexShrink: 0,
              }}
            >
              {labels.q}
            </span>
            <span style={{ ...textStyle('summary', tile.dir), fontWeight: 700 }}>{tile.front}</span>
          </div>
        )}

        {mode === 'answer' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 9,
                fontWeight: 700,
                padding: '0 6px',
                borderRadius: 4,
                border: BORDER,
                background: COLORS.cyanGlow,
                color: COLORS.ink,
                flexShrink: 0,
              }}
            >
              {labels.a}
            </span>
            <span style={{ ...textStyle('detail', tile.dir) }}>{tile.back}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function CardRowView({
  tiles,
  mode,
  labels,
  width,
  dir,
}: {
  tiles: CardTile[]
  mode: 'full' | 'front' | 'answer'
  labels: StudyLabels
  width: number
  dir: 'ltr' | 'rtl'
}) {
  return (
    <div
      dir={dir}
      style={{
        boxSizing: 'border-box',
        margin: 0,
        display: 'flex',
        flexDirection: 'row',
        gap: PAD.cardGap,
        paddingBottom: PAD.cardRowBottom,
        direction: dir,
      }}
    >
      {tiles.map((tile) => (
        <CardTileView key={tile.n} tile={tile} mode={mode} labels={labels} width={width} />
      ))}
    </div>
  )
}

export function MapSlot({
  size,
  caption,
}: {
  size: { w: number; h: number; x?: number; y?: number }
  caption: string
}) {
  return (
    <div
      style={{
        boxSizing: 'border-box',
        margin: 0,
        width: size.w - 4,
        height: size.h - 4,
        background: COLORS.white,
        border: BORDER,
        borderRadius: RADIUS.big,
        boxShadow: `4px 4px 0 ${COLORS.ink}`,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          boxSizing: 'border-box',
          margin: 0,
          alignSelf: 'flex-start',
          background: COLORS.cyanGlow,
          border: BORDER,
          borderRadius: RADIUS.pill,
          padding: '2px 12px',
          ...textStyle('mono', 'ltr'),
        }}
      >
        {clip(caption, 90)}
      </div>
      <div
        data-slot="picture"
        style={{
          boxSizing: 'border-box',
          margin: 0,
          flex: 1,
          minHeight: 0,
        }}
      />
    </div>
  )
}
