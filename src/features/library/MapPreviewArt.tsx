import { useTranslation } from 'react-i18next'

/**
 * Decorative mini mind map (landing + empty states). Drawn with SVG so it follows the
 * theme variables and mirrors in RTL. Labels are translated.
 */
export function MapPreviewArt({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === 'rtl'
  const nodes = [
    { x: 30, y: 30, w: 150, label: t('landing.preview.a'), fill: 'var(--ch-coral)' },
    { x: 30, y: 200, w: 150, label: t('landing.preview.b'), fill: 'var(--ch-sky)' },
    { x: 340, y: 30, w: 170, label: t('landing.preview.c'), fill: 'var(--ch-mint)' },
    { x: 340, y: 200, w: 170, label: t('landing.preview.d'), fill: 'var(--ch-lavender)' },
  ]
  const root = { x: 175, y: 112, w: 190, label: t('landing.preview.root') }

  return (
    <svg
      viewBox="0 0 540 290"
      className={className}
      role="img"
      aria-label={t('landing.preview.root')}
      style={rtl ? { transform: 'scaleX(-1)' } : undefined}
    >
      <defs>
        <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="var(--dot)" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="540" height="290" fill="url(#dots)" />
      {/* chapter region tint */}
      <rect x="12" y="12" width="186" height="266" rx="18" fill="var(--ch-yellow)" opacity="0.45" />

      {nodes.map((n) => {
        const fromX = root.x + root.w / 2
        const fromY = root.y + 32
        const toX = n.x + n.w / 2
        const toY = n.y + 25
        return (
          <path
            key={n.label}
            d={`M${fromX} ${fromY} C ${fromX} ${(fromY + toY) / 2}, ${toX} ${(fromY + toY) / 2}, ${toX} ${toY}`}
            stroke="var(--line)"
            strokeWidth="2"
            fill="none"
          />
        )
      })}
      <path
        d="M180 225 Q 260 270 340 225"
        stroke="var(--line)"
        strokeWidth="2"
        strokeDasharray="6 6"
        fill="none"
      />

      {nodes.map((n) => (
        <g key={n.label} transform={rtl ? `translate(${2 * n.x + n.w} 0) scale(-1 1)` : undefined}>
          <rect x={n.x + 3} y={n.y + 3} width={n.w} height="50" rx="10" fill="var(--shadow)" />
          <rect
            x={n.x}
            y={n.y}
            width={n.w}
            height="50"
            rx="10"
            fill="var(--surface)"
            stroke="var(--line)"
            strokeWidth="2"
          />
          <rect
            x={n.x}
            y={n.y}
            width="10"
            height="50"
            rx="5"
            fill={n.fill}
            stroke="var(--line)"
            strokeWidth="2"
          />
          <text
            x={n.x + n.w / 2 + 5}
            y={n.y + 31}
            textAnchor="middle"
            fontSize="16"
            fontWeight="600"
            fill="var(--ink)"
            direction={rtl ? 'rtl' : 'ltr'}
          >
            {n.label}
          </text>
        </g>
      ))}

      <g transform={rtl ? `translate(${2 * root.x + root.w} 0) scale(-1 1)` : undefined}>
        <rect
          x={root.x + 5}
          y={root.y + 5}
          width={root.w}
          height="64"
          rx="12"
          fill="var(--shadow)"
        />
        <rect
          x={root.x}
          y={root.y}
          width={root.w}
          height="64"
          rx="12"
          fill="var(--brand)"
          stroke="var(--line)"
          strokeWidth="2"
        />
        <text
          x={root.x + root.w / 2}
          y={root.y + 39}
          textAnchor="middle"
          fontSize="19"
          fontWeight="700"
          fill="var(--brand-ink)"
          direction={rtl ? 'rtl' : 'ltr'}
        >
          {root.label}
        </text>
      </g>
    </svg>
  )
}
