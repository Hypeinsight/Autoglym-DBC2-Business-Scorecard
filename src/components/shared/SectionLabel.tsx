import type { SectionColor } from '@/types'

// A small accent dot rather than a solid-color badge — reads as one
// considered system across sections instead of stock Tailwind hues
// (the old blue/green/orange badges didn't relate to the brand palette).
const dotColor: Record<SectionColor, string> = {
  red: 'bg-brand',
  blue: 'bg-ink',
  green: 'bg-up',
  orange: 'bg-neutral',
  ink: 'bg-ink',
}

export function SectionLabel({ color, children }: { color: SectionColor; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor[color]}`} />
      <span className="font-display text-[0.72rem] font-bold uppercase tracking-[0.11em] text-ink/70">
        {children}
      </span>
    </div>
  )
}
