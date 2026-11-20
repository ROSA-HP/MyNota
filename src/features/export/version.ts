/** Visible export build stamp displayed in the Export dialog and every exported PDF page footer. */
export const EXPORT_VERSION = 'MyNota export v2'

export const EXPORT_BUILD_TIME: string =
  (import.meta.env.VITE_EXPORT_BUILD_TIME as string | undefined) || 'dev'

export const EXPORT_BUILD_STAMP = `${EXPORT_VERSION} - ${EXPORT_BUILD_TIME}`
