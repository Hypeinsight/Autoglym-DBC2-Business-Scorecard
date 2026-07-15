/**
 * Number formatting helpers for metric card values and deltas.
 * All functions return display strings matching the wireframe format.
 */
import type { TrendDirection, SparklinePoint } from '../types/api.js'

export function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return n.toLocaleString('en-AU', { maximumFractionDigits: 0 })
  return String(Math.round(n))
}

export function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`
}

export function fmtPercent(rate: number, decimals = 1): string {
  return `${(rate * 100).toFixed(decimals)}%`
}

export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Compute a % delta string and its direction. */
export function pctDelta(current: number, prior: number): { delta: string; direction: TrendDirection } {
  if (prior === 0) return { delta: '—', direction: 'neutral' }
  const pct = ((current - prior) / Math.abs(prior)) * 100
  const sign = pct >= 0 ? '+' : ''
  return {
    delta: `${sign}${pct.toFixed(1)}%`,
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
  }
}

/** Compute an absolute currency delta string and direction (lower cost = up). */
export function currencyDelta(
  current: number,
  prior: number,
  lowerIsBetter = false,
): { delta: string; direction: TrendDirection } {
  const diff = current - prior
  const sign = diff >= 0 ? '+' : '−'
  const direction: TrendDirection =
    diff === 0 ? 'neutral' : lowerIsBetter ? (diff < 0 ? 'up' : 'down') : (diff > 0 ? 'up' : 'down')
  return { delta: `${sign}$${Math.abs(diff).toFixed(2)}`, direction }
}

/** Compute a pp (percentage point) delta string. */
export function ppDelta(
  currentRate: number,
  priorRate: number,
  lowerIsBetter = false,
): { delta: string; direction: TrendDirection } {
  const diff = (currentRate - priorRate) * 100
  const sign = diff >= 0 ? '+' : ''
  const direction: TrendDirection =
    diff === 0 ? 'neutral' : lowerIsBetter ? (diff < 0 ? 'up' : 'down') : (diff > 0 ? 'up' : 'down')
  return { delta: `${sign}${diff.toFixed(1)}pp`, direction }
}

/**
 * Build a sparkline with one point per input value (typically 12 months —
 * the frontend slices the trailing 3/6/12 of these per the Period View
 * selector, so this always returns the FULL series, not a fixed 9-bar
 * sample). Each point carries the raw value, a pre-formatted display string
 * (via `format`, defaulting to fmtNumber), and a `height` normalized
 * against the FULL series' own max — a fallback for any consumer that
 * doesn't do its own per-slice normalization. The frontend Sparkline
 * component recomputes height itself from `raw`, scoped to whichever
 * 3/6/12-month slice is actually visible, so a short window doesn't render
 * artificially flat just because it's quiet relative to the full year.
 *
 * `height`/`raw` are null for a month with no ingested data at all — kept
 * distinct from a genuine zero so the frontend renders that month's bar as
 * empty space instead of implying "measured and confirmed zero."
 */
export function toSparkline(values: number[], hasData?: boolean[], format: (n: number) => string = fmtNumber): SparklinePoint[] {
  if (values.length === 0) return []

  const known = values.filter((_, i) => hasData?.[i] !== false)
  const max = known.length > 0 ? Math.max(...known) : 0

  return values.map((v, i) => {
    if (hasData && hasData[i] === false) {
      return { height: null, raw: null, displayValue: '—' }
    }
    const height = max === 0 ? 4 : Math.max(4, Math.round((v / max) * 100))
    return { height, raw: v, displayValue: format(v) }
  })
}
