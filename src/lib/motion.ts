/** True when the student asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/** A camera or animation duration that becomes instant under reduced motion. */
export function motionMs(ms: number): number {
  return prefersReducedMotion() ? 0 : ms
}
