import { useEffect, useId, useRef, useState } from 'react'
import type { TrendDirection, SparklinePoint } from '@/types'

interface SparklineProps {
  /** Full 12-point series (oldest → newest), each with the raw value for tooltips. Sliced down to the trailing `monthsToShow` before rendering. */
  points: SparklinePoint[]
  trend: TrendDirection
  /** Full 12 month labels (oldest → newest) matching `points` - sliced alongside `points`. */
  months?: string[]
  /** Taller chart for hero cards - same data, more room to read the curve. */
  tall?: boolean
  /** How many trailing months to show - 3/6/12 per the Period View selector. Defaults to showing the full series. */
  monthsToShow?: number
}

/** Recomputes each point's height by normalizing to the visible slice's OWN
 *  min-to-max range (not a 0-to-max scale), so the line fills the vertical
 *  space and the real shape of the trend is visible.
 *
 *  A 0-baseline scale makes almost every metric look flat: values like
 *  impressions or sessions sit far above zero and only wobble within a narrow
 *  band near the top (e.g. 1.18M-1.37M maps to heights 86-100), so a line that
 *  is genuinely climbing +16% renders as a near-flat streak. Anchoring the
 *  lowest visible point near the bottom and the highest near the top reveals
 *  whether the series is actually rising or falling. Padded to [BAND_MIN,
 *  BAND_MAX] so extremes don't hug the edges; a genuinely flat series (zero
 *  span) sits on a centered midline. Recomputed per visible slice so the shape
 *  changes with the 3M/6M/12M selector. */
const BAND_MIN = 10
const BAND_MAX = 92
function rescaleToSlice(slice: SparklinePoint[]): SparklinePoint[] {
  const known = slice.filter((p) => p.raw !== null).map((p) => p.raw as number)
  if (known.length === 0) return slice
  const min = Math.min(...known)
  const span = Math.max(...known) - min
  return slice.map((p) => {
    if (p.raw === null) return p
    const height = span === 0 ? 50 : Math.round(BAND_MIN + ((p.raw - min) / span) * (BAND_MAX - BAND_MIN))
    return { ...p, height }
  })
}

// Matches up/down/neutral in tailwind.config.ts exactly - SVG stroke/fill
// need real color values, not Tailwind classes, so these are kept in sync
// by hand rather than resolved from a CSS variable.
const lineColor: Record<TrendDirection, string> = {
  up: '#1a7a4c',
  down: '#c2410c',
  neutral: '#a16207',
}

const VIEW_W = 200
const VIEW_H = 44
const PAD_Y = 5

/** Catmull-Rom → cubic Bézier conversion, so the line curves smoothly through
 *  every point instead of the sharp zig-zag a plain polyline would give. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  const d = [`M ${pts[0].x},${pts[0].y}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d.push(`C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`)
  }
  return d.join(' ')
}

function toRuns(points: SparklinePoint[]): { i: number; x: number; y: number }[][] {
  const runs: { i: number; x: number; y: number }[][] = []
  let current: { i: number; x: number; y: number }[] = []
  points.forEach((p, i) => {
    if (p.height === null) {
      if (current.length) runs.push(current)
      current = []
      return
    }
    const x = (i / (points.length - 1)) * VIEW_W
    const y = PAD_Y + (1 - p.height / 100) * (VIEW_H - PAD_Y * 2)
    current.push({ i, x, y })
  })
  if (current.length) runs.push(current)
  return runs
}

/** A single <path>, drawn left-to-right via stroke-dasharray/dashoffset -
 *  the standard SVG "line draw-in" technique. Re-triggers whenever `replayKey`
 *  changes (new data, a tab switch, or a period-view change), not on every
 *  re-render. Uses the path's real rendered length (getTotalLength) rather
 *  than an estimate, so the dash never over/under-shoots and leaves a
 *  visible snap at the end of the draw-in. */
function AnimatedPath({ d, color, strokeWidth, replayKey, opacity = 1, glow = false }: {
  d: string
  color: string
  strokeWidth: number
  replayKey: string
  /** Sub-1 for a soft glow underlay drawn beneath the crisp line. */
  opacity?: number
  /** Blur this stroke (the glow layer) so it reads as light bleed, not a second line. */
  glow?: boolean
}) {
  const pathRef = useRef<SVGPathElement>(null)
  const [length, setLength] = useState(0)
  const [animate, setAnimate] = useState(false)
  // Tracks the replayKey this path was last measured/drawn for. When
  // replayKey changes mid-render (new data), we reset `animate` to false
  // SYNCHRONOUSLY during render - not in an effect after paint - so the
  // very first frame after a data change already shows the hidden/undrawn
  // state. Resetting only in an effect let the browser paint one frame at
  // the OLD dashoffset with the NEW (different-length) path, which reads as
  // "no animation, just an instant redraw" since nothing visibly animated.
  const drawnForKey = useRef<string | null>(null)
  if (drawnForKey.current !== replayKey && animate) {
    setAnimate(false)
  }

  useEffect(() => {
    const measured = pathRef.current?.getTotalLength() ?? 0
    setLength(measured)
    drawnForKey.current = replayKey
    // Two rAFs: one to let the "undrawn" state (dashoffset = length) commit
    // to the DOM, one more before flipping to the animated end state - a
    // single rAF sometimes fires before the browser has painted the reset,
    // which skips straight to the finished line with no visible draw-in.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setAnimate(true))
      return () => cancelAnimationFrame(raf2)
    })
    return () => cancelAnimationFrame(raf1)
  }, [d, replayKey])

  return (
    <path
      ref={pathRef}
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeOpacity={opacity}
      strokeDasharray={length || undefined}
      style={{
        strokeDashoffset: animate ? 0 : length,
        transition: length ? 'stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
        filter: glow ? 'blur(1.5px)' : undefined,
      }}
    />
  )
}

/** A glowing "comet" of light that runs continuously along the trend line -
 *  a bright core with a blurred halo, both riding the SAME dash pattern so they
 *  travel together. The dash gap equals the measured path length, so exactly
 *  one comet is on the line at a time and the loop is seamless (the CSS
 *  `spark-flow` keyframe advances stroke-dashoffset by one full dash+gap
 *  period). This is the main "alive" signal; gated off for reduced-motion and
 *  print in index.css. Re-measures whenever the path/data changes. */
function TravelingComet({ d, color, replayKey }: { d: string; color: string; replayKey: string }) {
  const ref = useRef<SVGPathElement>(null)
  const [len, setLen] = useState(0)
  useEffect(() => {
    setLen(ref.current?.getTotalLength() ?? 0)
  }, [d, replayKey])

  const dash = 15
  const period = len + dash
  const flowStyle = {
    strokeDasharray: `${dash} ${len}`,
    ['--flow-period' as string]: `${period}px`,
    opacity: len ? undefined : 0,
  } as React.CSSProperties

  return (
    <>
      {/* measuring path (invisible) drives getTotalLength for both visible comets */}
      <path ref={ref} d={d} fill="none" stroke="none" />
      <path
        d={d}
        className="spark-flow"
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        style={{ ...flowStyle, filter: 'blur(2px)', opacity: len ? 0.55 : 0 }}
      />
      <path
        d={d}
        className="spark-flow"
        fill="none"
        stroke="#ffffff"
        strokeWidth={1.75}
        strokeLinecap="round"
        style={flowStyle}
      />
    </>
  )
}

/** Smooth gradient-filled line sparkline - replaces the old flat-bar chart.
 *  A curved line with a soft area fill underneath reads as materially more
 *  premium than discrete bars at the same small size, while keeping the same
 *  per-month hover tooltips ("Mar 2026: 2.2M impr."). Gaps in the data (no
 *  ingested month) break the line rather than interpolating through them, so
 *  missing history isn't visually implied as a real trend. Shows the
 *  trailing `monthsToShow` months (3/6/12 per the Period View selector),
 *  re-normalized to that slice's own max - so the chart genuinely changes
 *  shape with the dropdown instead of redrawing the same 9-month window.
 *  The line draws in left-to-right whenever the visible data changes. */
export function Sparkline({ points, trend, months, tall, monthsToShow }: SparklineProps) {
  const gradientId = useId()
  const color = lineColor[trend]

  const sliceCount = monthsToShow ?? points.length
  const slicedPoints = rescaleToSlice(points.slice(-sliceCount))
  const slicedMonths = months?.slice(-sliceCount)

  const runs = toRuns(slicedPoints)
  const lastPoint = runs.at(-1)?.at(-1)

  // Re-key the draw-in animation on the visible slice's actual values - a
  // re-render with the same numbers (e.g. an unrelated state update)
  // shouldn't replay the line from scratch, but a genuinely different slice
  // (new data OR a different monthsToShow) should.
  const replayKey = slicedPoints.map((p) => p.raw ?? 'x').join(',')

  return (
    <div className={`group/spark relative mt-2.5 ${tall ? 'h-16' : 'h-11'}`}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          {/* Richer, deeper area fill than the old single-stop wash - a bright
              top band fading through a mid-stop so the curve reads as volume,
              not a faint tint. Brightens further on card hover (see the
              group-hover opacity on the <g> below). */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.42" />
            <stop offset="55%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={VIEW_H - 0.5} x2={VIEW_W} y2={VIEW_H - 0.5} stroke="currentColor" className="text-line" strokeWidth="1" />

        {runs.map((run, ri) => {
          if (run.length < 2) {
            return <circle key={ri} cx={run[0].x} cy={run[0].y} r="2" fill={color} />
          }
          const linePath = smoothPath(run)
          const areaPath = `${linePath} L ${run.at(-1)!.x},${VIEW_H} L ${run[0].x},${VIEW_H} Z`
          return (
            <g key={ri} className="opacity-90 transition-opacity duration-300 group-hover:opacity-100">
              <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
              {/* Soft blurred glow beneath the crisp line - light bleed that
                  makes the trend line feel lit rather than drawn on. It also
                  "breathes" (spark-breathe) so the whole line gently brightens
                  and dims at rest. Draws in with the crisp line (same replayKey). */}
              <g className="spark-breathe">
                <AnimatedPath d={linePath} color={color} strokeWidth={5} opacity={0.28} glow replayKey={replayKey} />
              </g>
              <AnimatedPath d={linePath} color={color} strokeWidth={2.25} replayKey={replayKey} />
              {/* Comet of light continuously running along the trend. */}
              <TravelingComet d={linePath} color={color} replayKey={replayKey} />
            </g>
          )
        })}
        {lastPoint && (
          <>
            {/* Live "heartbeat" ping on the most recent point - signals the
                figure is current/live. Two staggered expanding rings (see the
                spark-pulse / spark-pulse-delay keyframes) read as an energetic
                double-beat. Disabled for reduced-motion and hidden in print. */}
            <circle className="spark-pulse" cx={lastPoint.x} cy={lastPoint.y} r="3" fill={color} />
            <circle className="spark-pulse spark-pulse-delay" cx={lastPoint.x} cy={lastPoint.y} r="3" fill={color} />
            {/* Bright breathing core dot. */}
            <circle className="spark-core" cx={lastPoint.x} cy={lastPoint.y} r="3.2" fill={color} stroke="white" strokeWidth="1.5" />
          </>
        )}
      </svg>

      {/* Invisible per-month hover targets - preserves the "Mar 2026: 2.2M impr." tooltip from the old bar chart. */}
      <div className="absolute inset-0 flex">
        {slicedPoints.map((p, i) => (
          <div key={i} className="flex-1 cursor-default" title={slicedMonths?.[i] ? `${slicedMonths[i]}: ${p.height === null ? 'no data' : p.displayValue}` : p.displayValue} />
        ))}
      </div>
    </div>
  )
}
