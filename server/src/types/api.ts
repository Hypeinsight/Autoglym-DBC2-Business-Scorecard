/**
 * Shared API response types — used by both the server mappers
 * and the frontend fetch client in /src/lib/apiClient.ts.
 *
 * These are the canonical shapes the Express routes return.
 * Keep in sync with the frontend Metric/PeriodCell types in /src/types/index.ts.
 */

export type TrendDirection = 'up' | 'down' | 'neutral'

/** A single rolling-period comparison cell (3M / 6M / 12M). */
export interface PeriodCell {
  label: string
  value: string
  delta: string
  deltaDirection: TrendDirection
  /** If set, this cell's value is typed in directly — the frontend renders it as an editable box saving to this key. */
  manualMetricKey?: string
}

/** One sparkline bar — normalized height for rendering, plus the raw value and
 *  a display-formatted string so the frontend can show a real tooltip
 *  ("Mar 2026: 2.2M impr.") instead of just a bare, unlabeled shape. */
export interface SparklinePoint {
  /** Bar height 0–100, relative to this metric's own 9-month max. null = no data (rendered empty, not zero). */
  height: number | null
  /** Raw underlying value for this month — null when there's no data. */
  raw: number | null
  /** Pre-formatted display value matching the card's own unit/format (e.g. "2.2M", "$8.42", "1.9%"). */
  displayValue: string
}

/** The normalised metric shape every API mapper outputs. */
export interface ScorecardMetric {
  id: string
  name: string
  primary: string
  unit?: string
  trend: TrendDirection
  trendLabel: string
  /** The "vs X" comparison phrase alone (e.g. "vs prior period", "vs May 2026") — reused when the period selector swaps in a different period's delta. */
  trendVsLabel: string
  /** 9-point sparkline (oldest → newest) — see SparklinePoint for what each bar carries. */
  sparkline: SparklinePoint[]
  periods: PeriodCell[]
  /** Source of the data (for footer attribution). */
  source: string
  /** ISO timestamp of the last successful data pull. */
  lastUpdated: string
  /** Pending = awaiting reliable data extraction (rendered muted on the frontend). */
  pending?: boolean
  /** True if `periods` are NOT a simple 3M/6M/12M progression (e.g. custom labels like "List Size") — headline stays pinned to `primary`/`trend` regardless of the period selector. */
  customPeriods?: boolean
  /**
   * For cards that show 3 DIFFERENT sub-metrics (not a 3M/6M/12M progression
   * of the same metric) — one full 3-cell `periods` row per period view
   * ([3M row, 6M row, 12M row]), each row containing that period's own
   * sub-metric breakdown (e.g. Opens/Open Rate/CTR). When present, the
   * period selector swaps the ENTIRE `periods` array to periodsByView[index]
   * instead of picking a single cell.
   */
  periodsByView?: [PeriodCell[], PeriodCell[], PeriodCell[]]
  /** Which cell within each periodsByView row is the headline (matches `unit`/`primary`'s meaning) — defaults to 0 if periodsByView is set but this isn't. */
  headlineIndex?: number
  /** True if this card's value is typed in directly (no API source) — the frontend renders an editable input instead of static text. */
  manualInput?: boolean
  /** The key to POST to /api/manual-metrics when manualInput is true. */
  manualMetricKey?: string
}

/** The full response body from GET /api/scorecard */
export interface ScorecardResponse {
  reportingPeriodEnd: string   // 'YYYY-MM' of the most recent month
  sections: {
    id: string
    label: string
    metrics: ScorecardMetric[]
  }[]
  generatedAt: string          // ISO timestamp
  /** 9 month labels (e.g. "Oct 2025"), oldest → newest — shared by every card's sparkline since they all cover the same 9-month window. */
  sparklineMonths: string[]
  /** 'live' = every source is real DB/API data; 'sample' = every source fell back; 'mixed' = some of each (e.g. GA4 sample, everything else live). */
  dataSourceStatus: 'live' | 'mixed' | 'sample'
}

/** GET /api/health */
export interface HealthResponse {
  status: 'ok'
  version: string
  uptime: number
}

/** Standard error envelope */
export interface ApiError {
  error: string
  detail?: string
  code?: number
}
