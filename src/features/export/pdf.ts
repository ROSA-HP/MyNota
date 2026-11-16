import type { OutlineItem } from './outline'
import { buildStudyPdf } from './studypdf'
import type { Paper, StudyLabels, StudyPdfInput } from './studypdf/types'

export type { Paper } from './studypdf/types'
export { buildStudyPdf } from './studypdf'

export interface PdfInput {
  title: string
  paper: Paper
  /** Map pictures, one page each (the whole map, or one per chapter of a book). */
  pictures: Array<{ dataUrl: string; width: number; height: number; caption: string }>
  outline: OutlineItem[]
  dir: 'ltr' | 'rtl'
  labels: { outline: string; cards: string; footer: string }
}

function toStudyLabels(labels: PdfInput['labels'], dir: 'ltr' | 'rtl'): StudyLabels {
  const isAr = dir === 'rtl'
  return {
    madeWith: labels.footer || 'MyNota',
    contents: labels.outline || (isAr ? 'المحتويات' : 'Contents'),
    chapter: isAr ? 'الفصل' : 'Chapter',
    chapterShort: (n: number) => (isAr ? `فصل ${n}` : `Ch. ${n}`),
    continued: isAr ? 'تابع' : 'Continued',
    addedByAi: isAr ? 'أضيف بالذكاء' : 'AI Added',
    flashcards: labels.cards || (isAr ? 'البطاقات' : 'Flashcards'),
    answers: isAr ? 'الإجابات' : 'Answers',
    q: 'Q',
    a: 'A',
    page: (n: number) => (isAr ? `صفحة ${n}` : `Page ${n}`),
    more: (count: number) => (isAr ? `+${count} أخرى` : `+${count} more`),
    importance: {
      core: isAr ? 'أساسي' : 'Core',
      extra: isAr ? 'إضافي' : 'Extra',
    },
    kind: {
      book: isAr ? 'كتاب' : 'Book',
      notes: isAr ? 'ملاحظات' : 'Notes',
      blank: isAr ? 'فارغ' : 'Blank',
    },
    sticker: {
      notes: isAr ? 'ملاحظات دراسية' : 'Study Notes',
      summary: isAr ? 'ملخص مركز' : 'Executive Summary',
      cards: isAr ? 'بطاقات استرجاع' : 'Flashcards',
      maps: isAr ? 'خرائط ذهنية' : 'Mind Maps',
    },
    stats: {
      chapters: isAr ? 'فصول' : 'Chapters',
      sections: isAr ? 'أقسام' : 'Sections',
      blocks: isAr ? 'كتل' : 'Blocks',
      formulas: isAr ? 'معادلات' : 'Formulas',
      cards: isAr ? 'بطاقات' : 'Cards',
    },
    types: {
      definition: isAr ? 'تعريف' : 'Definition',
      concept: isAr ? 'مفهوم' : 'Concept',
      process_step: isAr ? 'خطوة عملية' : 'Process step',
      event: isAr ? 'حدث' : 'Event',
      person: isAr ? 'شخصية' : 'Person',
      formula: isAr ? 'معادلة' : 'Formula',
      example: isAr ? 'مثال' : 'Example',
      comparison: isAr ? 'مقارنة' : 'Comparison',
      key_fact: isAr ? 'حقيقة أساسية' : 'Key fact',
      warning: isAr ? 'تحذير' : 'Warning',
      vocabulary: isAr ? 'مفردات' : 'Vocabulary',
    },
    empty: isAr ? 'لا توجد عناصر للتصدير' : 'No items to export',
  }
}

/**
 * Builds the Perfusense study PDF by delegating to buildStudyPdf with standard options.
 */
export async function buildPdf(input: PdfInput): Promise<Blob> {
  const studyInput: StudyPdfInput = {
    title: input.title,
    kind: 'book',
    dateLabel: new Date().toLocaleDateString(input.dir === 'rtl' ? 'ar' : 'en'),
    preset: 'notes',
    paper: input.paper,
    tone: 'mint',
    dir: input.dir,
    items: input.outline,
    pictures: input.pictures,
    include: {
      links: true,
      cards: true,
      sources: true,
      aiTags: true,
    },
    answersAtEnd: false,
    labels: toStudyLabels(input.labels, input.dir),
  }

  return buildStudyPdf(studyInput)
}
