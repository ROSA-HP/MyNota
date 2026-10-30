/** A line of text on a page, in reading order, with its font size (PDF points or OCR pixels). */
export interface Line {
  text: string
  /** Font size: PDF points for text PDFs, line height in pixels for OCR. */
  size: number
  /** Distance from the top of the page, same unit as size. */
  top: number
  /** Left edge and width, for spotting short last lines. */
  left: number
  width: number
}

export interface PageText {
  /** 1-based page number in the file. */
  page: number
  lines: Line[]
  /** True when the page had no text layer and was read with OCR. */
  ocr: boolean
  /** Page height in the same unit as the lines (to tell top/bottom margins). */
  height: number
}

/** A paragraph of the book with the page it starts on. */
export interface PageParagraph {
  text: string
  page: number
}

/** A chapter suggestion the student reviews before any AI call. */
export interface ChapterDraft {
  key: string
  title: string
  firstPage: number
  lastPage: number
  /** front matter, back matter (index, references…) and other non-content parts start unchecked. */
  kind: 'chapter' | 'front' | 'back'
  build: boolean
}

export interface OutlineEntry {
  title: string
  page: number
}

export type ChapterSource = 'outline' | 'headings' | 'none'
