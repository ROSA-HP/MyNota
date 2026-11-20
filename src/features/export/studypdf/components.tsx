import React, { useLayoutEffect, useRef } from 'react'
import { FormulaLegendView, MathFormula, RichMathText } from '@/components/ui/MathFormula'
import { resolveFormulaLegend } from '@/lib/formulaLegend'
import { TYPE_ICON } from '@/features/workspace/canvas/visuals'
import type { ChapterColor } from '@/lib/database.types'
import { VectorMapSvg, type VectorMapPageData } from '../mindmapSvg'
import { EXPORT_BUILD_STAMP } from '../version'
import { proseTypographyStyle } from './cleanup'
import { arrowFor, clip, splitCloze } from './model'
import {
  BORDER,
  CHAPTER_FILL,
  COLORS,
  COMPACT_PAD,
  COVER_SHADOW_GUTTER,
  FONT_MONO,
  PAD,
  RADIUS,
  SHADOW,
  SHADOW_GUTTER,
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
  StatKey,
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
      {/* Header: spans full body width so shadows & cards stay flush inside L/R rule edges */}
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
          <RichMathText text={clip(headerTitle, 60)} />
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
                {headerChapter.label} · <RichMathText text={clip(headerChapter.title, 40)} />
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

      {/* Footer: spans full body width flush with Header & Cards */}
      <div
        data-pdf-footer=""
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
        <span style={{ ...textStyle('footer', 'ltr'), direction: 'ltr', fontSize: 9, color: COLORS.charcoal }}>
          {EXPORT_BUILD_STAMP}
        </span>
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
  statLabel,
  tabs,
  outline,
  outlineLabel,
  moreLabel,
  formatMore,
  madeWith,
  dateLabel,
  docLang = 'en',
}: {
  size: { w: number; h: number }
  tone: PaperTone
  dir: 'ltr' | 'rtl'
  title: string
  kindLabel: string
  stickerLabel: string
  stats: Array<{ key?: StatKey; n: number; label: string }>
  statLabel?: (key: StatKey, count: number) => string
  tabs: Array<{ number: number; title: string; color: ChapterColor }>
  outline?: CoverOutlineChapter[]
  outlineLabel?: string
  moreLabel: string | null
  formatMore?: (count: number) => string
  madeWith: string
  dateLabel?: string
  docLang?: 'en' | 'de' | 'ar'
}) {
  const isLandscape = size.w > size.h
  const marginMm = isLandscape ? 12 : 20
  const coverInnerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)

  const visibleStats = stats.filter((s) => s.n > 0)
  const visibleTabs = tabs.slice(0, 12)
  const hasOutline = Boolean(outline && outline.length > 0)

  // Limit displayed chapters & global section rows to max 8 main sections on the cover
  const maxChapters = isLandscape ? 4 : 6
  const rawOutline = outline ?? []
  const slicedChapters = rawOutline.slice(0, maxChapters)
  const totalSectionsAll = rawOutline.reduce((sum, ch) => sum + ch.sections.length, 0)

  const { visibleOutline } = slicedChapters.reduce<{
    visibleOutline: CoverOutlineChapter[]
    budget: number
  }>(
    (acc, ch) => {
      const perChapterCap = isLandscape
        ? slicedChapters.length <= 2
          ? 8
          : 4
        : slicedChapters.length <= 2
          ? 8
          : slicedChapters.length <= 4
            ? 4
            : 2
      const take = Math.min(ch.sections.length, perChapterCap, acc.budget)
      return {
        visibleOutline: [...acc.visibleOutline, { ...ch, sections: ch.sections.slice(0, take) }],
        budget: Math.max(0, acc.budget - take),
      }
    },
    { visibleOutline: [], budget: 8 },
  )

  const shownSectionsCount = visibleOutline.reduce((sum, ch) => sum + ch.sections.length, 0)
  const hiddenChapters = rawOutline.length > maxChapters ? rawOutline.length - maxChapters : 0
  const hiddenSections = Math.max(0, totalSectionsAll - shownSectionsCount)
  const overflowCount = hiddenChapters > 0 && rawOutline.every((c) => c.sections.length <= 1)
    ? hiddenChapters
    : hiddenSections > 0
      ? hiddenSections
      : hiddenChapters
  const hasTruncatedOutline = hiddenChapters > 0 || hiddenSections > 0
  const resolvedOutlineMore = hasTruncatedOutline
    ? (formatMore ? formatMore(overflowCount) : moreLabel)
    : null

  const coverShadow = dir === 'rtl' ? `-6px 6px 0 ${COLORS.ink}` : SHADOW.cover
  const cardShadow = dir === 'rtl' ? `-2px 2px 0 ${COLORS.ink}` : SHADOW.card

  const isCompactOutline = !isLandscape && visibleOutline.length <= 3 && shownSectionsCount <= 8
  const titleTypo = proseTypographyStyle(title, docLang)

  // Auto-shrink title font size from 36pt (48px) down to 24pt (32px) so it stays <= 2 lines
  // and run dev assertion ensuring the entire cover fits on 1 A4 page with zero overflow.
  useLayoutEffect(() => {
    const titleEl = titleRef.current
    if (titleEl) {
      const startSize = isLandscape ? 36 : 48 // 27pt..36pt -> shrink to min 32px (24pt)
      const minSize = 32
      let curSize = startSize
      titleEl.style.fontSize = `${curSize}px`
      titleEl.style.lineHeight = `${Math.round(curSize * (dir === 'rtl' ? 1.24 : 1.15))}px`
      while (curSize > minSize) {
        const lineH = Math.round(curSize * (dir === 'rtl' ? 1.24 : 1.15))
        if (titleEl.scrollHeight <= lineH * 2 + 4) break
        curSize -= 2
        titleEl.style.fontSize = `${curSize}px`
        titleEl.style.lineHeight = `${Math.round(curSize * (dir === 'rtl' ? 1.24 : 1.15))}px`
      }
    }

    const inner = coverInnerRef.current
    if (inner) {
      const overflows = inner.scrollHeight > inner.clientHeight + 2
      inner.setAttribute('data-cover-overflow', overflows ? 'true' : 'false')
      if (overflows && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
        console.error(
          `[MyNota Cover Overflow] scrollHeight=${inner.scrollHeight} > clientHeight=${inner.clientHeight} for "${title}"`,
        )
      }
    }
  }, [title, isLandscape, dir, visibleOutline.length, shownSectionsCount])

  const coverGutter = (style?: React.CSSProperties): React.CSSProperties => ({
    boxSizing: 'border-box',
    margin: 0,
    paddingRight: dir === 'ltr' ? COVER_SHADOW_GUTTER : 0,
    paddingLeft: dir === 'rtl' ? COVER_SHADOW_GUTTER : 0,
    ...style,
  })

  return (
    <PageShell w={size.w} h={size.h} tone={tone} dir={dir}>
      <div
        ref={coverInnerRef}
        data-cover-frame=""
        style={{
          boxSizing: 'border-box',
          margin: 0,
          position: 'absolute',
          top: mmToPx(marginMm),
          bottom: mmToPx(marginMm),
          left: mmToPx(marginMm),
          right: mmToPx(marginMm),
          display: 'flex',
          flexDirection: 'column',
          gap: isLandscape ? 10 : 14,
        }}
      >
        {/* Top Brand Bar */}
        <div style={coverGutter({ flexShrink: 0 })}>
          <div
            style={{
              boxSizing: 'border-box',
              margin: 0,
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: 10,
              borderBottom: BORDER,
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
        </div>

        {/* Main Hero (Upper Third) & What's Inside */}
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: isLandscape ? 10 : 14,
          }}
        >
          {/* Hero Title Card in upper third */}
          <div
            style={{
              boxSizing: 'border-box',
              margin: 0,
              paddingRight: dir === 'ltr' ? COVER_SHADOW_GUTTER : 0,
              paddingLeft: dir === 'rtl' ? COVER_SHADOW_GUTTER : 0,
              paddingBottom: COVER_SHADOW_GUTTER,
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
                  padding: isLandscape ? '7px 18px' : '10px 22px',
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
                    padding: '3px 11px',
                    ...textStyle('mono', dir),
                    boxShadow: cardShadow,
                  }}
                >
                  {stickerLabel}
                </div>
              </div>

              {/* Hero Title (36pt -> 24pt auto-shrink, max 2 lines) */}
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  padding: isLandscape ? '14px 20px' : '22px 24px',
                }}
              >
                <div
                  ref={titleRef}
                  data-cover-title=""
                  lang={titleTypo.lang}
                  dir="auto"
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    fontFamily: titleTypo.lang === 'ar' ? fontFor('rtl') : fontFor(dir),
                    fontSize: isLandscape ? 36 : 48,
                    lineHeight: isLandscape ? '42px' : dir === 'rtl' ? '58px' : '54px',
                    fontWeight: 700,
                    letterSpacing: titleTypo.lang === 'ar' ? 'normal' : '-0.025em',
                    overflowWrap: 'anywhere',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  <RichMathText text={title} />
                </div>
              </div>

              {/* Integrated Flush Stats Strip (plural-aware) */}
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
                  {visibleStats.map((s, idx) => {
                    const resolvedLabel = s.key && statLabel ? statLabel(s.key, s.n) : s.label
                    return (
                      <div
                        key={idx}
                        style={{
                          boxSizing: 'border-box',
                          margin: 0,
                          padding: isLandscape ? '10px 12px' : '11px 14px',
                          borderInlineEnd: idx < visibleStats.length - 1 ? BORDER : undefined,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: FONT_MONO,
                            fontSize: 20,
                            lineHeight: '24px',
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
                          {resolvedLabel}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* What's Inside / Section Outline Panel */}
          {hasOutline ? (
            <div
              style={{
                ...coverGutter(),
                flex: '0 1 auto',
                minHeight: 0,
                paddingBottom: COVER_SHADOW_GUTTER,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  flex: '0 1 auto',
                  minHeight: 0,
                  background: COLORS.white,
                  border: BORDER,
                  borderRadius: RADIUS.card,
                  boxShadow: coverShadow,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    padding: '9px 16px',
                    background: COLORS.bioSlate,
                    borderBottom: BORDER,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ ...textStyle('mono', dir) }}>{outlineLabel ?? "What's inside"}</span>
                  <span style={{ ...textStyle('monoSmall', dir), color: COLORS.charcoal }}>
                    {totalSectionsAll || rawOutline.length}
                  </span>
                </div>

                <div
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    flex: 1,
                    minHeight: 0,
                    padding: isLandscape ? '10px 14px' : isCompactOutline ? '14px 16px' : '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    gap: isLandscape ? 8 : isCompactOutline ? 10 : 10,
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
                        flex: isCompactOutline && visibleOutline.length === 1 ? 1 : undefined,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: isLandscape ? 5 : isCompactOutline ? 8 : 6,
                        paddingBottom:
                          cIdx < visibleOutline.length - 1 ? (isLandscape ? 6 : 8) : 0,
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
                              width: 26,
                              height: 26,
                              background: CHAPTER_FILL[ch.color],
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
                            <RichMathText text={ch.title} />
                          </div>
                        </div>
                      )}

                      {isCompactOutline && ch.summary && (() => {
                        const sTypo = proseTypographyStyle(ch.summary, docLang)
                        return (
                          <div
                            lang={sTypo.lang}
                            dir={sTypo.dir}
                            style={{
                              boxSizing: 'border-box',
                              margin: 0,
                              ...textStyle('detail', ch.dir),
                              ...sTypo.style,
                              color: COLORS.charcoal,
                            }}
                          >
                            <RichMathText text={clip(ch.summary, 200)} />
                          </div>
                        )
                      })()}

                      {ch.sections.length > 0 && (
                        <div
                          style={{
                            boxSizing: 'border-box',
                            margin: 0,
                            display:
                              isCompactOutline && visibleOutline.length === 1 ? 'flex' : 'grid',
                            flexDirection:
                              isCompactOutline && visibleOutline.length === 1 ? 'column' : undefined,
                            justifyContent: 'flex-start',
                            gridTemplateColumns: isCompactOutline
                              ? 'minmax(0, 1fr)'
                              : ch.sections.length > 6 || (isLandscape && ch.sections.length > 2)
                                ? 'repeat(2, minmax(0, 1fr))'
                                : 'minmax(0, 1fr)',
                            gap: isLandscape ? '5px 12px' : isCompactOutline ? 7 : '6px 12px',
                          }}
                        >
                          {ch.sections.map((sec, sIdx) => {
                            const secSummaryTypo =
                              isCompactOutline && sec.summary
                                ? proseTypographyStyle(sec.summary, docLang)
                                : null
                            return (
                              <div
                                key={sIdx}
                                data-toc-page={sec.page}
                                dir={sec.dir}
                                style={{
                                  boxSizing: 'border-box',
                                  margin: 0,
                                  flex:
                                    isCompactOutline &&
                                    visibleOutline.length === 1 &&
                                    ch.sections.length >= 3 &&
                                    ch.sections.length <= 6
                                      ? 1
                                      : undefined,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: isCompactOutline ? 'center' : undefined,
                                  gap: isCompactOutline ? 3 : 0,
                                  padding: isCompactOutline ? '7px 12px' : '2px 0',
                                  borderRadius: isCompactOutline ? RADIUS.tile : 0,
                                  border: isCompactOutline
                                    ? `1.5px solid ${COLORS.ink}`
                                    : undefined,
                                  background: isCompactOutline ? COLORS.mintFrost : undefined,
                                  minWidth: 0,
                                }}
                              >
                                <div
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
                                      ...textStyle(
                                        isCompactOutline ? 'blockTitle' : 'detail',
                                        sec.dir,
                                      ),
                                      flex: 1,
                                      minWidth: 0,
                                      ...(isCompactOutline
                                        ? { overflowWrap: 'anywhere' }
                                        : {
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                          }),
                                    }}
                                  >
                                    <RichMathText text={sec.title} />
                                  </span>
                                  {sec.page !== undefined && (
                                    <span
                                      style={{
                                        fontFamily: FONT_MONO,
                                        fontSize: 11,
                                        lineHeight: '14px',
                                        fontWeight: 700,
                                        fontVariantNumeric: 'tabular-nums',
                                        color: COLORS.surgicalTeal,
                                        flexShrink: 0,
                                        marginInlineStart: 6,
                                      }}
                                    >
                                      {sec.page}
                                    </span>
                                  )}
                                </div>
                                {isCompactOutline && sec.summary && secSummaryTypo && (
                                  <div
                                    lang={secSummaryTypo.lang}
                                    dir={secSummaryTypo.dir}
                                    style={{
                                      boxSizing: 'border-box',
                                      margin: 0,
                                      ...textStyle('small', sec.dir),
                                      ...secSummaryTypo.style,
                                      color: COLORS.charcoal,
                                      paddingInlineStart: 32,
                                    }}
                                  >
                                    <RichMathText text={clip(sec.summary, 140)} />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}

                  {resolvedOutlineMore !== null && (
                    <div
                      data-outline-more=""
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
                      {resolvedOutlineMore}
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
                      <RichMathText text={t.title} />
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

        {/* Bottom Footer Strip (locale date e.g. 20 Nov 2026 + build stamp) */}
        <div style={coverGutter({ flexShrink: 0 })}>
          <div
            data-pdf-footer=""
            style={{
              boxSizing: 'border-box',
              margin: 0,
              paddingTop: 10,
              borderTop: BORDER,
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ ...textStyle('footer', dir), color: COLORS.charcoal }}>{madeWith}</span>
            <span
              style={{
                ...textStyle('footer', 'ltr'),
                direction: 'ltr',
                fontSize: 9,
                color: COLORS.charcoal,
                whiteSpace: 'nowrap',
              }}
            >
              {dateLabel && dateLabel !== madeWith ? `${dateLabel} · ${EXPORT_BUILD_STAMP}` : EXPORT_BUILD_STAMP}
            </span>
          </div>
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
              paddingRight: dir === 'ltr' ? SHADOW_GUTTER : 0,
              paddingLeft: dir === 'rtl' ? SHADOW_GUTTER : 0,
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
              <RichMathText text={row.title} />
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
  legend,
  dir,
  docLang = 'en',
}: {
  latex: string
  variables?: string
  legend?: Array<{ symbol: string; meaning: string }>
  dir: 'ltr' | 'rtl'
  docLang?: 'en' | 'de' | 'ar'
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const formulaRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const box = boxRef.current
    const wrap = wrapRef.current
    const formula = formulaRef.current
    if (!box || !wrap || !formula) return
    formula.style.transform = ''
    formula.style.transformOrigin = 'center center'
    wrap.style.height = ''
    const avail = box.clientWidth - 24
    const naturalW = formula.scrollWidth
    const naturalH = formula.scrollHeight
    if (avail > 0 && naturalW > avail && naturalW > 0) {
      const scale = Math.max(0.55, avail / naturalW)
      formula.style.transform = `scale(${scale})`
      if (naturalH > 0) wrap.style.height = `${Math.ceil(naturalH * scale)}px`
    }
  }, [latex])

  const entries = resolveFormulaLegend({ kind: 'formula', latex, variables, legend }).entries
  const legendTextSample = entries.length
    ? entries.map((e) => e.meaning).join(' ')
    : (variables ?? '')
  const legendTypo = legendTextSample ? proseTypographyStyle(legendTextSample, docLang) : null

  return (
    <div
      ref={boxRef}
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
      <div
        ref={wrapRef}
        style={{
          boxSizing: 'border-box',
          margin: 0,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <span ref={formulaRef} style={{ display: 'inline-block', fontSize: 15 }}>
          <MathFormula latex={latex} display />
        </span>
      </div>
      {(entries.length > 0 || variables) && legendTypo && (
        <div
          lang={legendTypo.lang}
          dir={legendTypo.dir}
          style={{
            boxSizing: 'border-box',
            margin: 0,
            marginTop: 6,
            ...textStyle('small', legendTypo.lang === 'ar' ? 'rtl' : dir),
            ...legendTypo.style,
            color: COLORS.legendText,
          }}
        >
          {entries.length > 0 ? (
            <FormulaLegendView entries={entries} />
          ) : (
            variables && <RichMathText text={variables} legend />
          )}
        </div>
      )}
    </div>
  )
}

function RenderRow({
  row,
  dir,
  labels,
  docLang = 'en',
}: {
  row: BlockRow
  dir: 'ltr' | 'rtl'
  labels: StudyLabels
  docLang?: 'en' | 'de' | 'ar'
}) {
  switch (row.kind) {
    case 'summary': {
      const typo = proseTypographyStyle(row.text, docLang)
      return (
        <div
          lang={typo.lang}
          dir={typo.dir}
          style={{
            boxSizing: 'border-box',
            margin: 0,
            ...textStyle('summary', typo.lang === 'ar' ? 'rtl' : dir),
            ...typo.style,
            color: COLORS.ink,
          }}
        >
          <RichMathText text={row.text} />
        </div>
      )
    }
    case 'detail': {
      const d = row.detail
      switch (d.kind) {
        case 'text': {
          const typo = proseTypographyStyle(d.text, docLang)
          return (
            <div
              lang={typo.lang}
              dir={typo.dir}
              style={{
                boxSizing: 'border-box',
                margin: 0,
                ...textStyle('detail', typo.lang === 'ar' ? 'rtl' : dir),
                ...typo.style,
              }}
            >
              <RichMathText text={d.text} />
            </div>
          )
        }
        case 'bullet': {
          const typo = proseTypographyStyle(d.text, docLang)
          return (
            <div
              lang={typo.lang}
              dir={typo.dir}
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
                  ...textStyle('detail', typo.lang === 'ar' ? 'rtl' : dir),
                  ...typo.style,
                }}
              >
                <RichMathText text={d.text} />
              </div>
            </div>
          )
        }
        case 'example': {
          const typo = proseTypographyStyle(d.text, docLang)
          const trTypo = d.translation ? proseTypographyStyle(d.translation, docLang) : null
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
                lang={typo.lang}
                dir={typo.dir}
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  ...textStyle('detail', typo.lang === 'ar' ? 'rtl' : dir),
                  ...typo.style,
                }}
              >
                <RichMathText text={d.text} />
              </div>
              {d.translation && trTypo && (
                <div
                  lang={trTypo.lang}
                  dir={trTypo.dir}
                  style={{
                    boxSizing: 'border-box',
                    margin: 0,
                    ...textStyle('small', trTypo.lang === 'ar' ? 'rtl' : dir),
                    ...trTypo.style,
                    color: COLORS.charcoal,
                    marginTop: 2,
                  }}
                >
                  <RichMathText text={d.translation} />
                </div>
              )}
            </div>
          )
        }
        case 'cloze': {
          const typo = proseTypographyStyle(d.text, docLang)
          return (
            <div
              lang={typo.lang}
              dir={typo.dir}
              style={{
                boxSizing: 'border-box',
                margin: 0,
                ...textStyle('detail', typo.lang === 'ar' ? 'rtl' : dir),
                ...typo.style,
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
        }
        case 'vocab': {
          const vocabText = [d.article, d.term, d.meaning].filter(Boolean).join(' ')
          const typo = proseTypographyStyle(vocabText, docLang)
          return (
            <div
              lang={typo.lang}
              dir={typo.dir}
              style={{
                boxSizing: 'border-box',
                margin: 0,
                ...textStyle('detail', typo.lang === 'ar' ? 'rtl' : dir),
                ...typo.style,
              }}
            >
              <span style={{ fontWeight: 700 }}>
                <RichMathText text={[d.article, d.term].filter(Boolean).join(' ')} />
              </span>
              {d.plural && (
                <span>
                  {' '}
                  (<RichMathText text={d.plural} />)
                </span>
              )}
              {d.meaning && (
                <span style={{ color: COLORS.charcoal }}>
                  {' '}
                  — <RichMathText text={d.meaning} />
                </span>
              )}
            </div>
          )
        }
        case 'formula':
          return (
            <FormulaBox
              latex={d.latex}
              variables={d.variables}
              legend={d.legend}
              dir={dir}
              docLang={docLang}
            />
          )
        case 'question': {
          const qTypo = proseTypographyStyle(d.front, docLang)
          const aTypo = proseTypographyStyle(d.back, docLang)
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
                  lang={qTypo.lang}
                  dir={qTypo.dir}
                  style={{
                    ...textStyle('detail', qTypo.lang === 'ar' ? 'rtl' : dir),
                    ...qTypo.style,
                    fontWeight: 700,
                    flex: 1,
                    minWidth: 0,
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
                  lang={aTypo.lang}
                  dir={aTypo.dir}
                  style={{
                    ...textStyle('detail', aTypo.lang === 'ar' ? 'rtl' : dir),
                    ...aTypo.style,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <RichMathText text={d.back} />
                </span>
              </div>
            </div>
          )
        }
      }
      break
    }
    case 'link': {
      const linkTypo = proseTypographyStyle(`${row.label}: ${row.other}`, docLang)
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
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {arrowFor(row.outgoing, dir)}
          </span>
          <span
            lang={linkTypo.lang}
            dir={linkTypo.dir}
            style={{
              ...textStyle('small', linkTypo.lang === 'ar' ? 'rtl' : dir),
              ...linkTypo.style,
              flex: 1,
              minWidth: 0,
            }}
          >
            <span style={{ fontWeight: 700 }}>
              <RichMathText text={row.label} />
            </span>
            <span style={{ color: COLORS.charcoal }}>
              : <RichMathText text={row.other} />
            </span>
          </span>
        </div>
      )
    }
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
    case 'card': {
      const qTypo = proseTypographyStyle(row.front, docLang)
      const aTypo = proseTypographyStyle(row.back, docLang)
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
          <div
            lang={qTypo.lang}
            dir={qTypo.dir}
            style={{
              ...textStyle('small', qTypo.lang === 'ar' ? 'rtl' : dir),
              ...qTypo.style,
              fontWeight: 700,
            }}
          >
            {labels.q} <RichMathText text={row.front} />
          </div>
          <div
            lang={aTypo.lang}
            dir={aTypo.dir}
            style={{
              ...textStyle('small', aTypo.lang === 'ar' ? 'rtl' : dir),
              ...aTypo.style,
            }}
          >
            {labels.a} <RichMathText text={row.back} />
          </div>
        </div>
      )
    }
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
  compact = false,
  docLang = 'en',
}: {
  unit: FlowUnit
  dir: 'ltr' | 'rtl'
  labels: StudyLabels
  aiTags: boolean
  atTop: boolean
  rowFrom?: number
  rowTo?: number
  continued?: boolean
  compact?: boolean
  docLang?: 'en' | 'de' | 'ar'
}) {
  const pad = compact ? COMPACT_PAD : PAD

  if (unit.kind === 'chapter') {
    const chapterShadow = dir === 'rtl' ? `-4px 4px 0 ${COLORS.ink}` : SHADOW.chapter
    const sumTypo = unit.summary ? proseTypographyStyle(unit.summary, docLang) : null
    return (
      <div
        dir={dir}
        style={{
          boxSizing: 'border-box',
          margin: 0,
          paddingTop: atTop ? 0 : pad.chapterTop,
          paddingBottom: pad.chapterBottom + 4,
          paddingRight: dir === 'ltr' ? SHADOW_GUTTER : 0,
          paddingLeft: dir === 'rtl' ? SHADOW_GUTTER : 0,
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
              <RichMathText text={unit.title} />
            </div>
            {unit.summary && sumTypo && (
              <div
                lang={sumTypo.lang}
                dir={sumTypo.dir}
                style={{
                  boxSizing: 'border-box',
                  margin: 0,
                  ...textStyle('detail', unit.dir),
                  ...sumTypo.style,
                  color: COLORS.charcoal,
                  marginTop: 4,
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
    const sumTypo = unit.summary ? proseTypographyStyle(unit.summary, docLang) : null
    return (
      <div
        dir={dir}
        style={{
          boxSizing: 'border-box',
          margin: 0,
          paddingTop: atTop ? 0 : pad.sectionTop,
          paddingBottom: pad.sectionBottom,
          paddingRight: 0,
          paddingLeft: 0,
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
            <RichMathText text={unit.title} />
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

        {unit.summary && sumTypo && (
          <div
            lang={sumTypo.lang}
            dir={sumTypo.dir}
            style={{
              boxSizing: 'border-box',
              margin: 0,
              ...textStyle('summary', unit.dir),
              ...sumTypo.style,
              color: COLORS.charcoal,
              paddingTop: 6,
            }}
          >
            <RichMathText text={unit.summary} />
          </div>
        )}
      </div>
    )
  }

  // Block unit (equal left and right edges, nested hierarchy shown with colored left rail & breadcrumb)
  const totalRows = unit.rows.length
  const to = rowTo ?? totalRows
  const visibleRows = unit.rows.slice(rowFrom, to)
  const IconComponent = unit.type ? TYPE_ICON[unit.type] : null
  const blockShadow = dir === 'rtl' ? `-2px 2px 0 ${COLORS.ink}` : SHADOW.card
  const isNested = unit.relDepth > 0

  return (
    <div
      dir={dir}
      style={{
        boxSizing: 'border-box',
        margin: 0,
        direction: dir,
        paddingInlineStart: 0,
        paddingRight: dir === 'ltr' ? SHADOW_GUTTER : 0,
        paddingLeft: dir === 'rtl' ? SHADOW_GUTTER : 0,
        paddingBottom: pad.blockBottom + 2,
      }}
    >
      <div
        dir={unit.dir}
        data-nested={isNested ? 'true' : 'false'}
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
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        {isNested && (
          <div
            data-left-rail=""
            style={{
              boxSizing: 'border-box',
              margin: 0,
              width: 6,
              flexShrink: 0,
              background: CHAPTER_FILL[unit.color],
              borderInlineEnd: BORDER,
            }}
          />
        )}
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
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
            {isNested && unit.parentTitle && (
              <div
                style={{
                  ...textStyle('monoSmall', unit.dir),
                  color: COLORS.charcoal,
                  fontSize: 8.5,
                  lineHeight: '11px',
                  marginBottom: 1,
                }}
              >
                ↳ <RichMathText text={unit.parentTitle} />
              </div>
            )}
            <RichMathText text={unit.title} />
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
              padding: compact ? '6px 12px' : '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: pad.rowGap,
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
                  <RenderRow row={row} dir={unit.dir} labels={labels} docLang={docLang} />
                </div>
              )
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

export function CardTileView({
  tile,
  mode,
  labels,
  width,
  docLang = 'en',
}: {
  tile: CardTile
  mode: 'full' | 'front' | 'answer'
  labels: StudyLabels
  width: number
  docLang?: 'en' | 'de' | 'ar'
}) {
  const tileShadow = tile.dir === 'rtl' ? `-2px 2px 0 ${COLORS.ink}` : SHADOW.card
  const qTypo = proseTypographyStyle(tile.front, docLang)
  const aTypo = proseTypographyStyle(tile.back, docLang)
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
          <RichMathText text={tile.title} />
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
                lang={qTypo.lang}
                dir={qTypo.dir}
                style={{
                  ...textStyle('summary', tile.dir),
                  ...qTypo.style,
                  fontWeight: 700,
                  flex: 1,
                  minWidth: 0,
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
                lang={aTypo.lang}
                dir={aTypo.dir}
                style={{
                  ...textStyle('detail', tile.dir),
                  ...aTypo.style,
                  flex: 1,
                  minWidth: 0,
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
              lang={qTypo.lang}
              dir={qTypo.dir}
              style={{
                ...textStyle('summary', tile.dir),
                ...qTypo.style,
                fontWeight: 700,
                flex: 1,
                minWidth: 0,
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
              lang={aTypo.lang}
              dir={aTypo.dir}
              style={{
                ...textStyle('detail', tile.dir),
                ...aTypo.style,
                flex: 1,
                minWidth: 0,
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
        paddingRight: dir === 'ltr' ? SHADOW_GUTTER : 0,
        paddingLeft: dir === 'rtl' ? SHADOW_GUTTER : 0,
        direction: dir,
      }}
    >
      {tiles.map((tile) => (
        <CardTileView key={tile.n} tile={tile} mode={mode} labels={labels} width={width} />
      ))}
    </div>
  )
}

export function VectorMapPage({
  size,
  body,
  tone,
  dir,
  pageNo,
  total,
  pageData,
  coreLabel,
  extraLabel,
}: {
  size: { w: number; h: number }
  body: { x: number; y: number; w: number; h: number }
  tone: PaperTone
  dir: 'ltr' | 'rtl'
  pageNo: number
  total: number
  pageData: VectorMapPageData
  coreLabel: string
  extraLabel: string
}) {
  const cardShadow = dir === 'rtl' ? `-4px 4px 0 ${COLORS.ink}` : SHADOW.chapter
  const footerH = 22
  return (
    <PageShell w={size.w} h={size.h} tone={tone} dir={dir}>
      <div
        style={{
          boxSizing: 'border-box',
          margin: 0,
          position: 'absolute',
          left: body.x,
          top: body.y,
          width: body.w - SHADOW_GUTTER,
          height: body.h - SHADOW_GUTTER - footerH,
          background: COLORS.white,
          border: BORDER,
          borderRadius: RADIUS.big,
          boxShadow: cardShadow,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          overflow: 'hidden',
        }}
      >
        {/* Map Title Bar & Legend */}
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            paddingBottom: 6,
            borderBottom: BORDER,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <div
              style={{
                background: COLORS.cyanGlow,
                border: BORDER,
                borderRadius: RADIUS.pill,
                padding: '2px 10px',
                ...textStyle('monoSmall', dir),
                flexShrink: 0,
              }}
            >
              MyNota
            </div>
            <span
              style={{
                ...textStyle('blockTitle', dir),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <RichMathText text={pageData.caption} />
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...textStyle('monoSmall', dir) }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: COLORS.ink,
                }}
              />
              {coreLabel}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...textStyle('monoSmall', dir) }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  border: `1.5px dashed ${COLORS.ink}`,
                  background: COLORS.white,
                }}
              />
              {extraLabel}
            </span>
          </div>
        </div>

        {/* Full-bleed Horizontal Vector SVG Diagram */}
        <div
          style={{
            boxSizing: 'border-box',
            margin: 0,
            flex: 1,
            minHeight: 0,
            width: '100%',
            height: '100%',
          }}
        >
          <VectorMapSvg model={pageData.model} width="100%" height="100%" />
        </div>
      </div>

      {/* Map Page Footer with Build Stamp & Page Number */}
      <div
        data-pdf-footer=""
        style={{
          boxSizing: 'border-box',
          margin: 0,
          position: 'absolute',
          left: body.x,
          width: body.w,
          bottom: Math.max(8, size.h - (body.y + body.h) - 2),
          height: 18,
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 2,
        }}
      >
        <span style={{ ...textStyle('footer', 'ltr'), direction: 'ltr', fontSize: 9, color: COLORS.charcoal }}>
          {EXPORT_BUILD_STAMP}
        </span>
        <span style={{ ...textStyle('footer', 'ltr'), direction: 'ltr', color: COLORS.ink }}>
          {pageNo} / {total}
        </span>
      </div>
    </PageShell>
  )
}
