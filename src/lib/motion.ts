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

/** Ease-out (quartic): starts at once, settles gently, so camera moves feel responsive and fluid. */
export const easeOut = (t: number): number => 1 - (1 - t) ** 4

/**
 * Options for a map camera move (fitView, setCenter, zoomTo ...): a little longer than a UI
 * transition, eased out, and instant under reduced motion.
 */
export function camera(ms: number): { duration: number; ease: (t: number) => number } {
  return { duration: motionMs(Math.round(ms * 1.3)), ease: easeOut }
}
