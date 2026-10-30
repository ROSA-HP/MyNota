import type { en } from './en'

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

/**
 * Same keys as English with any string values. Each level may also add plural forms
 * (e.g. Arabic needs `_zero`, `_two`, `_few`, `_many` that English does not use).
 */
type Shape<T> = {
  [K in keyof T]: T[K] extends string ? string : Shape<T[K]>
} & { [key: `${string}_${PluralSuffix}`]: string | undefined }

export type Messages = Shape<typeof en>
