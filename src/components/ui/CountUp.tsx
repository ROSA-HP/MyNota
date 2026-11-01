import { useEffect, useRef, useState } from 'react'
import { motionMs } from '@/lib/motion'

/**
 * A number that counts up to its value (and on to new values) instead of jumping. Screen readers
 * get the final value only; reduced motion shows it at once.
 */
export function CountUp({ value, ms = 700 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    const start = from.current
    const duration = motionMs(ms)
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = duration ? Math.min(1, (now - t0) / duration) : 1
      const v = Math.round(start + (value - start) * (1 - (1 - p) ** 3))
      from.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])

  return (
    <>
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{value}</span>
    </>
  )
}
