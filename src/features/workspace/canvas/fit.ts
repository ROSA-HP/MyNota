import type { FitViewOptions } from '@xyflow/react'

/** Fit options that keep the map clear of the bottom toolbar and the build banner. */
export const FIT: FitViewOptions = {
  padding: { top: '36px', left: '36px', right: '36px', bottom: '170px' },
  maxZoom: 1.1,
  minZoom: 0.2,
}
