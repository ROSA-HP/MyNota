import type { CSSProperties } from 'react'

/** Paper confetti for the end of a study session (decorative; hidden with reduced motion). */
const COLORS = ['yellow', 'coral', 'sky', 'mint', 'lavender', 'pink', 'orange', 'lime']

export function Confetti({ pieces = 28 }: { pieces?: number }) {
  return (
    <span aria-hidden className="mynota-confetti pointer-events-none absolute inset-x-0 top-0">
      {Array.from({ length: pieces }, (_, i) => {
        // Spread evenly with a fixed scatter, so every render looks the same (no Math.random).
        const style = {
          insetInlineStart: `${(i * 37) % 100}%`,
          background: `var(--ch-${COLORS[i % COLORS.length]}-strong)`,
          animationDelay: `${(i % 7) * 70}ms`,
          width: i % 3 === 0 ? 6 : 9,
          height: i % 3 === 0 ? 12 : 7,
          '--drift': `${((i * 53) % 60) - 30}px`,
          '--turn': `${((i * 97) % 540) - 270}deg`,
        } as CSSProperties
        return <span key={i} style={style} />
      })}
    </span>
  )
}
