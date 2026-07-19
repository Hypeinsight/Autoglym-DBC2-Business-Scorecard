import { useId, useState } from 'react'

interface Props {
  /** Plain-English explanation of what the metric measures. */
  what: string
  /** The systems the figure is derived from (e.g. "Google Ads + Meta"). */
  source?: string
  /** Accessible label for the trigger - defaults to a generic phrase. */
  label?: string
}

/**
 * A small "ⓘ" affordance that reveals a definition on hover OR keyboard focus.
 * Kept inside the card's own bounds (opens down-left, right-aligned to the
 * icon) so the card's `overflow-hidden` never clips it, and marked
 * `print:hidden` so it never appears on the exported A3 board pack.
 */
export function InfoTooltip({ what, source, label = 'What this metric means' }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <span className="relative inline-flex print:hidden">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Tap-to-toggle on touch, and keep the click off any card-level handler.
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-line text-[0.6rem] font-bold leading-none text-muted/70 transition-colors hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        i
      </button>

      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-lg border border-line bg-white p-3 text-left shadow-card-hover"
        >
          <span className="block text-[0.72rem] font-medium leading-snug text-ink/85">{what}</span>
          {source && (
            <span className="mt-2 block border-t border-line pt-1.5 text-[0.6rem] font-bold uppercase tracking-[0.06em] text-muted/70">
              Source: {source}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
