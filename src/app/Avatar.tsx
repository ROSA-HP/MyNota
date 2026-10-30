import { cn } from '@/lib/cn'

const COLORS = [
  'bg-ch-yellow',
  'bg-ch-coral',
  'bg-ch-sky',
  'bg-ch-mint',
  'bg-ch-lavender',
  'bg-ch-pink',
  'bg-ch-orange',
  'bg-ch-lime',
]

function colorFor(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length] ?? 'bg-ch-yellow'
}

export function Avatar({
  name,
  username,
  url,
  size = 36,
}: {
  name: string
  username: string
  url?: string | null
  size?: number
}) {
  const initial = (name.trim() || username).charAt(0).toUpperCase()
  return url ? (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-full border-2 border-line object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border-2 border-line font-bold text-ink',
        colorFor(username),
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  )
}
