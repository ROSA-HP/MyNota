import React from 'react'
import { MathFormula, RichMathText } from '@/components/ui/MathFormula'
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
import type {
  BlockRow,
  CardTile,
  CoverOutlineChapter,
  FlowUnit,
  PaperTone,
  StudyLabels,
} from './types'

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
  outline,
  outlineLabel,
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
  outline?: CoverOutlineChapter[]
  outlineLabel?: string
  moreLabel: string | null
  madeWith: string
}) {
  const visibleStats = stats.filter((s) => s.n > 0)
  const visibleTabs = tabs.slice(0, 12)
  const hasOutline = Boolean(outline && outline.length > 0)
  const visibleOutline = outline ? outline.slice(0, 6) : []
  const hiddenChapters = outline && outline.length > 6 ? outline.length - 6 : 0
  const coverShadow = dir === 'rtl' ? `-6px 6px 0 ${COLORS.ink}` : SHADOW.cover
  const chapterShadow = dir === 'rtl' ? `-4px 4px 0 ${COLORS.ink}` : SHADOW.chapter
  const cardShadow = dir === 'rtl' ? `-2px 2px 0 ${COLORS.ink}` : SHADOW.card

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
          gap: 18,
        }}
      >
        {/* Top bar (flush left to right) */}
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 12,
            borderBottom: BORDER,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              boxSizing: 'border-box',
              margin: 0,
              background: COLORS.white,
              border: BORDER,
              borderRadius: RADIUS.pill,
              padding: '4px 12px',
              ...textStyle('monoSmall', dir),
              boxShadow: cardShadow,
            }}
          >
            MyNota
          </div>

          <span
            style={{
              ...textStyle('monoSmall', dir),
              color: COLORS.surgicalTeal,
            }}
          >
            {kindLabel} · {stickerLabel}
          </span>
        </div>

        {/* Main Hero & Outline */}
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {/* Full-width Hero Title Card */}
          <div
            style={{
              boxSizing: 'border-box',
              margin: 0,
              paddingRight: dir === 'ltr' ? 6 : 0,
              paddingLeft: dir === 'rtl' ? 6 : 0,
              paddingBottom: 6,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                background: COLORS.white,
                border: BORDER,
                borderRadius: RADIUS.big,
                boxShadow: coverShadow,
                overflow: 'hidden',
              }}
            >
              {/* Card Meta Band */}
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 24px',
                  background: COLORS.bioSlate,
                  borderBottom: BORDER,
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
                  }}
                >
                  {kindLabel}
                </div>

                <div
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    transform: 'rotate(-2deg)',
                    background: CHAPTER_FILL.yellow,
                    border: BORDER,
                    borderRadius: 8,
                    padding: '4px 12px',
                    ...textStyle('mono', dir),
                    boxShadow: cardShadow,
                  }}
                >
                  {stickerLabel}
                </div>
              </div>

              {/* Hero Title */}
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  padding: '30px 26px',
                }}
              >
                <div
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    fontFamily: fontFor(dir),
                    fontSize: 40,
                    lineHeight: dir === 'rtl' ? '50px' : '46px',
                    fontWeight: 700,
                    letterSpacing: dir === 'rtl' ? undefined : '-0.025em',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {clip(title, 140)}
                </div>
              </div>

              {/* Integrated Flush Stats Strip */}
              {visibleStats.length > 0 && (
                <div
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${visibleStats.length}, minmax(0, 1fr))`,
                    borderTop: BORDER,
                    background: COLORS.white,
                  }}
                >
                  {visibleStats.map((s, idx) => (
                    <div
                      key={idx}
                      style={{
                        boxSizing: 'border-box',
                        margin: 0,
                        padding: '14px 16px',
                        borderInlineEnd: idx < visibleStats.length - 1 ? BORDER : undefined,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 22,
                          lineHeight: '26px',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {s.n}
                      </span>
                      <span
                        style={{
                          ...textStyle('monoSmall', dir),
                          color: COLORS.charcoal,
                        }}
                      >
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chapter & Section Outline Panel */}
          {hasOutline ? (
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                flex: 1,
                minHeight: 0,
                paddingRight: dir === 'ltr' ? 4 : 0,
                paddingLeft: dir === 'rtl' ? 4 : 0,
                paddingBottom: 4,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  flex: 1,
                  minHeight: 0,
                  background: COLORS.white,
                  border: BORDER,
                  borderRadius: RADIUS.card,
                  boxShadow: chapterShadow,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    padding: '10px 18px',
                    background: COLORS.bioSlate,
                    borderBottom: BORDER,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ ...textStyle('mono', dir) }}>{outlineLabel ?? 'Contents'}</span>
                  <span style={{ ...textStyle('monoSmall', dir), color: COLORS.charcoal }}>
                    {outline?.reduce((sum, ch) => sum + Math.max(1, ch.sections.length), 0) ?? 0}
                  </span>
                </div>

                <div
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    flex: 1,
                    minHeight: 0,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    overflow: 'hidden',
                  }}
                >
                  {visibleOutline.map((ch, cIdx) => (
                    <div
                      key={cIdx}
                      dir={ch.dir}
                      style={{
                        boxSizing: 'border-box',
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        paddingBottom: cIdx < visibleOutline.length - 1 ? 12 : 0,
                        borderBottom:
                          cIdx < visibleOutline.length - 1
                            ? `1.5px dashed ${COLORS.charcoal}`
                            : undefined,
                      }}
                    >
                      {ch.number !== null && (
                        <div
                          style={{
                            boxSizing: 'border-box',
                            margin: 0,
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              boxSizing: 'border-box',
                              margin: 0,
                              width: 28,
                              height: 28,
                              background: CHAPTER_FILL[ch.color],
                              border: BORDER,
                              borderRadius: RADIUS.tile,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              fontFamily: FONT_MONO,
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            {ch.number}
                          </div>
                          <div
                            style={{
                              boxSizing: 'border-box',
                              margin: 0,
                              ...textStyle('h2', ch.dir),
                              minWidth: 0,
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {ch.title}
                          </div>
                        </div>
                      )}

                      {ch.sections.length > 0 && (
                        <div
                          style={{
                            boxSizing: 'border-box',
                            margin: 0,
                            display: 'grid',
                            gridTemplateColumns:
                              ch.sections.length > 6
                                ? 'repeat(2, minmax(0, 1fr))'
                                : 'minmax(0, 1fr)',
                            gap: '8px 14px',
                            paddingInlineStart: ch.number !== null ? 38 : 0,
                          }}
                        >
                          {ch.sections.slice(0, 14).map((sec, sIdx) => (
                            <div
                              key={sIdx}
                              dir={sec.dir}
                              style={{
                                boxSizing: 'border-box',
                                margin: 0,
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  boxSizing: 'border-box',
                                  margin: 0,
                                  fontFamily: FONT_MONO,
                                  fontSize: 10,
                                  lineHeight: '14px',
                                  fontWeight: 700,
                                  direction: 'ltr',
                                  background: CHAPTER_FILL[ch.color],
                                  border: BORDER,
                                  borderRadius: RADIUS.pill,
                                  padding: '1px 8px',
                                  flexShrink: 0,
                                }}
                              >
                                {sec.label}
                              </span>
                              <span
                                style={{
                                  ...textStyle('detail', sec.dir),
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {sec.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {hiddenChapters > 0 && moreLabel !== null && (
                    <div
                      style={{
                        boxSizing: 'border-box',
                        margin: 0,
                        marginTop: 'auto',
                        alignSelf: 'flex-start',
                        background: COLORS.bioSlate,
                        border: BORDER,
                        borderRadius: RADIUS.tile,
                        padding: '3px 10px',
                        ...textStyle('small', dir),
                        fontWeight: 700,
                      }}
                    >
                      {moreLabel}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            tabs.length >= 2 && (
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
            )
          )}
        </div>

        {/* Bottom Footer Strip */}
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            paddingTop: 10,
            borderTop: BORDER,
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ ...textStyle('footer', dir), color: COLORS.charcoal }}>{madeWith}</span>
          <span style={{ ...textStyle('footer', dir), color: COLORS.charcoal }}>MyNota</span>
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
            marginTop: 6,
            textAlign: 'justify',
            direction: dir,
            ...textStyle('small', dir),
            color: COLORS.charcoal,
          }}
        >
          <RichMathText text={variables} />
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
            textAlign: 'justify',
          }}
        >
          <RichMathText text={row.text} />
        </div>
      )
    case 'detail': {
      const d = row.detail
      switch (d.kind) {
        case 'text':
          return (
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                ...textStyle('detail', dir),
                textAlign: 'justify',
              }}
            >
              <RichMathText text={d.text} />
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
                  textAlign: 'justify',
                }}
              >
                <RichMathText text={d.text} />
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
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  ...textStyle('detail', dir),
                  textAlign: 'justify',
                }}
              >
                <RichMathText text={d.text} />
              </div>
              {d.translation && (
                <div
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    ...textStyle('small', dir),
                    color: COLORS.charcoal,
                    marginTop: 2,
                    textAlign: 'justify',
                  }}
                >
                  <RichMathText text={d.translation} />
                </div>
              )}
            </div>
          )
        case 'cloze':
          return (
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                ...textStyle('detail', dir),
                textAlign: 'justify',
              }}
            >
              {splitCloze(d.text).map((seg, idx) => (
                <span
                  key={idx}
                  style={seg.gap ? { fontWeight: 700, textDecoration: 'underline 2px' } : undefined}
                >
                  <RichMathText text={seg.text} />
                </span>
              ))}
            </div>
          )
        case 'vocab':
          return (
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                ...textStyle('detail', dir),
                textAlign: 'justify',
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {[d.article, d.term].filter(Boolean).join(' ')}
              </span>
              {d.plural && <span> ({d.plural})</span>}
              {d.meaning && (
                <span style={{ color: COLORS.charcoal }}>
                  {' '}
                  — <RichMathText text={d.meaning} />
                </span>
              )}
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
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
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
                    marginTop: 2,
                  }}
                >
                  {labels.q}
                </span>
                <span
                  style={{
                    ...textStyle('detail', dir),
                    fontWeight: 700,
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'justify',
                  }}
                >
                  <RichMathText text={d.front} />
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
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
                    marginTop: 2,
                  }}
                >
                  {labels.a}
                </span>
                <span
                  style={{
                    ...textStyle('detail', dir),
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'justify',
                  }}
                >
                  <RichMathText text={d.back} />
                </span>
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
          <span style={{ ...textStyle('small', dir), fontWeight: 700 }}>
            <RichMathText text={row.label} />
          </span>
          <span style={{ ...textStyle('small', dir), color: COLORS.charcoal }}>
            : <RichMathText text={row.other} />
          </span>
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
          <div style={{ ...textStyle('small', dir), fontWeight: 700, textAlign: 'justify' }}>
            {labels.q} <RichMathText text={row.front} />
          </div>
          <div style={{ ...textStyle('small', dir), textAlign: 'justify' }}>
            {labels.a} <RichMathText text={row.back} />
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
    const chapterShadow = dir === 'rtl' ? `-4px 4px 0 ${COLORS.ink}` : SHADOW.chapter
    return (
      <div
        dir={dir}
        style={{
          boxSizing: 'border-box',
          margin: 0,
          paddingTop: atTop ? 0 : PAD.chapterTop,
          paddingBottom: PAD.chapterBottom + 4,
          paddingRight: dir === 'ltr' ? 4 : 0,
          paddingLeft: dir === 'rtl' ? 4 : 0,
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
            boxShadow: chapterShadow,
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
                  textAlign: 'justify',
                }}
              >
                <RichMathText text={unit.summary} />
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
              textAlign: 'justify',
            }}
          >
            <RichMathText text={unit.summary} />
          </div>
        )}
      </div>
    )
  }

  // Block unit (aligned flush left and right with shadow clearance inside body width)
  const totalRows = unit.rows.length
  const to = rowTo ?? totalRows
  const visibleRows = unit.rows.slice(rowFrom, to)
  const IconComponent = unit.type ? TYPE_ICON[unit.type] : null
  const blockShadow = dir === 'rtl' ? `-2px 2px 0 ${COLORS.ink}` : SHADOW.card

  return (
    <div
      dir={dir}
      style={{
        boxSizing: 'border-box',
        margin: 0,
        direction: dir,
        paddingInlineStart: 0,
        paddingRight: dir === 'ltr' ? 2 : 0,
        paddingLeft: dir === 'rtl' ? 2 : 0,
        paddingBottom: PAD.blockBottom + 2,
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
          boxShadow: blockShadow,
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
  const tileShadow = tile.dir === 'rtl' ? `-2px 2px 0 ${COLORS.ink}` : SHADOW.card
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
        boxShadow: tileShadow,
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
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
                  marginTop: 2,
                }}
              >
                {labels.q}
              </span>
              <span
                style={{
                  ...textStyle('summary', tile.dir),
                  fontWeight: 700,
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'justify',
                }}
              >
                <RichMathText text={tile.front} />
              </span>
            </div>
            <div
              style={{
                boxSizing: 'border-box',
                margin: 0,
                borderTop: `2px dashed ${COLORS.charcoal}`,
                paddingTop: 6,
                display: 'flex',
                alignItems: 'flex-start',
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
                  marginTop: 2,
                }}
              >
                {labels.a}
              </span>
              <span
                style={{
                  ...textStyle('detail', tile.dir),
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'justify',
                }}
              >
                <RichMathText text={tile.back} />
              </span>
            </div>
          </>
        )}

        {mode === 'front' && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
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
                marginTop: 2,
              }}
            >
              {labels.q}
            </span>
            <span
              style={{
                ...textStyle('summary', tile.dir),
                fontWeight: 700,
                flex: 1,
                minWidth: 0,
                textAlign: 'justify',
              }}
            >
              <RichMathText text={tile.front} />
            </span>
          </div>
        )}

        {mode === 'answer' && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
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
                marginTop: 2,
              }}
            >
              {labels.a}
            </span>
            <span
              style={{
                ...textStyle('detail', tile.dir),
                flex: 1,
                minWidth: 0,
                textAlign: 'justify',
              }}
            >
              <RichMathText text={tile.back} />
            </span>
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
        paddingBottom: PAD.cardRowBottom + 2,
        paddingRight: dir === 'ltr' ? 2 : 0,
        paddingLeft: dir === 'rtl' ? 2 : 0,
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
