/** Shared domain types for the Autoglym DBC2 Business Scorecard. */

export type TrendDirection = 'up' | 'down' | 'neutral'

export type PeriodKey = 'r3m' | 'r6m' | 'r12m'

/** A single rolling-period cell (3M / 6M / 12M) shown on a metric card. */
export interface PeriodCell {
  label: string
  value: string
  delta: string
  deltaDirection: TrendDirection
  /** If set, this cell's value is typed in directly — rendered as an editable box saving to this key. */
  manualMetricKey?: string
}

/** One sparkline bar — normalized height for rendering, plus the raw value and
 *  pre-formatted display string so a hover tooltip can show real data
 *  ("Mar 2026: 2.2M impr.") instead of just an unlabeled shape. */
export interface SparklinePoint {
  height: number | null
  raw: number | null
  displayValue: string
}

/** A scorecard metric card: headline value, trend, sparkline, period row. */
export interface Metric {
  id: string
  name: string
  primary: string
  unit?: string
  trend: TrendDirection
  trendLabel: string
  /** The "vs X" comparison phrase alone (e.g. "vs prior period", "vs May 2026") — reused when the period selector swaps in a different period's delta. */
  trendVsLabel: string
  /** 12-point sparkline (oldest → newest) — MetricCard slices this to the trailing 3/6/12 months per the Period View selector. */
  sparkline: SparklinePoint[]
  periods: PeriodCell[]
  /** Pending = awaiting reliable data extraction (rendered muted). */
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
  /** True if this card's value is typed in directly (no API source) — renders an editable input instead of static text. */
  manualInput?: boolean
  /** The key to POST to /api/manual-metrics when manualInput is true. */
  manualMetricKey?: string
}

export type SectionColor = 'red' | 'blue' | 'green' | 'orange' | 'ink'

export interface ScorecardSection {
  id: string
  label: string
  color: SectionColor
  /** Metrics laid out in rows of four. */
  metrics: Metric[]
}

/** Commentary item: Highlight / Lowlight / Optimisation Opportunity. */
export interface CommentaryItem {
  /** Stable key this item saves under (e.g. "media-highlight") — used as the manual-edit save key, independent of display order. */
  id: string
  kind: 'highlight' | 'lowlight' | 'opportunity'
  text: string
}

export interface CommentaryBlock {
  id: string
  title: string
  items: CommentaryItem[]
}

export interface CampaignBullet {
  /** Stable key this bullet saves under (e.g. "core-products-bullet-0"). */
  id: string
  text: string
}

export interface Campaign {
  id: string
  name: string
  /** How many months before the selected "As At" month this campaign started — the display label ("Mar 2026 – ongoing") is computed from this, so it always tracks the current month instead of going stale. */
  startedMonthsAgo: number
  bullets: CampaignBullet[]
}

export interface RetailerClicks {
  name: string
  clicks: number
  sharePct: number
  /** Tailwind/hex bar color. */
  color: string
  /** Path to the retailer's logo under /public (e.g. "/logos/repco.png"). Falls back to the text name if the file 404s. */
  logo: string
}

export type PeriodView = 'Rolling 3 Months' | 'Rolling 6 Months' | 'Rolling 12 Months'
export type TabId = 'scorecard' | 'commentary' | 'dashboard'
