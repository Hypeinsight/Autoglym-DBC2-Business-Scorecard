/**
 * Sample data used when API credentials are not yet configured.
 * Values mirror the Phase 1 wireframe exactly so the frontend
 * looks identical whether running live or on sample data.
 */
import type { PeriodData } from '../mappers/scorecardMapper.js'

const GA4_CURRENT = {
  sessions: 84210,
  engagedSessions: 54063,
  bounceRate: 0.528,
  averageSessionDuration: 108,
  screenPageViews: 210525,
  retailerButtonClicks: 9840,
  engagementRate: 0.642,
}

const GA4_PRIOR = {
  sessions: 74929,
  engagedSessions: 46457,
  bounceRate: 0.486,
  averageSessionDuration: 120,
  screenPageViews: 187322,
  retailerButtonClicks: 9093,
  engagementRate: 0.621,
}

const ADS_CURRENT = {
  spend: 8080,
  impressions: 960000,
  clicks: 48320,
  conversions: 9840,
  ctr: 0.026,
  cpc: 0.38,
  cpm: 8.42,
  cpa: 1.87,
}

const ADS_PRIOR = {
  spend: 7460,
  impressions: 813000,
  clicks: 43374,
  conversions: 9093,
  ctr: 0.023,
  cpc: 0.44,
  cpm: 8.04,
  cpa: 2.11,
}

const EDM_CURRENT = {
  totalSends: 12480,
  totalOpens: 4792,
  openRate: 0.384,
  totalClicks: 3840,
  ctr: 0.042,
  totalUnsubscribes: 22,
  unsubscribeRate: 0.0018,
  listSize: 12480,
  listGrowth: 724,
}

const EDM_PRIOR = {
  totalSends: 11742,
  totalOpens: 4167,
  openRate: 0.356,
  totalClicks: 3510,
  ctr: 0.036,
  totalUnsubscribes: 26,
  unsubscribeRate: 0.0022,
  listSize: 11756,
  listGrowth: 610,
}

const META_CURRENT = {
  spend: 4620,
  impressions: 412000,
  reach: 198000,
  frequency: 2.08,
  cpm: 11.21,
  cpc: 0.82,
  ctr: 0.0148,
  cpa: 2.14,
  linkClicks: 5634,
  conversions: 2160,
}

const META_PRIOR = {
  spend: 4190,
  impressions: 368000,
  reach: 176000,
  frequency: 2.09,
  cpm: 11.39,
  cpc: 0.91,
  ctr: 0.0131,
  cpa: 2.53,
  linkClicks: 4604,
  conversions: 1656,
}

// Fixed per-month wobble factors (not random — sample data must render
// identically on every request/page load, so Math.random() is off the
// table). Deliberately NOT monotonic: a straight linear ramp from prior to
// current draws as a dead-flat line on the sparkline, which reads as
// obviously fake/placeholder. These add a believable up-and-down shape on
// top of the underlying trend, while month 0 and the last month stay
// exactly anchored to the real prior/current values. 12 entries to match
// the 12-month sample window (3/6/12-month period views all slice from it).
const WOBBLE = [0, 0.05, -0.03, 0.07, -0.02, 0.09, -0.04, 0.06, -0.02, 0.08, 0.03, 0]

// Builds a 12-point monthly series that moves from `prior` to `current`
// with a realistic wobble instead of a straight ramp — see WOBBLE above.
function monthlySeries<T extends Record<string, number>>(prior: T, current: T): T[] {
  const keys = Object.keys(prior) as (keyof T)[]
  return Array.from({ length: 12 }, (_, i) => {
    const t = i / 11 // 0 at oldest month, 1 at the reporting month
    const point = {} as T
    for (const key of keys) {
      const span = current[key] - prior[key]
      const linear = prior[key] + span * t
      // Wobble scales with the metric's own range, so a small-range metric
      // (e.g. a 0-1 rate) doesn't get an absurdly large swing relative to
      // its size, while a large-range metric (e.g. sessions) still shows a
      // visually meaningful bump — and endpoints get zero wobble so
      // month 0 / the last month stay exactly on the real values.
      const wobble = (Math.abs(span) || Math.abs(prior[key]) * 0.1) * WOBBLE[i]
      point[key] = (linear + wobble) as T[keyof T]
    }
    return point
  })
}

export const SAMPLE_PERIOD_DATA: Omit<PeriodData, 'reportingMonth' | 'sparklineMonths' | 'dataSourceStatus'> = {
  r3m:  { current: GA4_CURRENT, prior: GA4_PRIOR, ads: { current: ADS_CURRENT, prior: ADS_PRIOR }, meta: { current: META_CURRENT, prior: META_PRIOR }, edm: { current: EDM_CURRENT, prior: EDM_PRIOR } },
  r6m:  { current: { ...GA4_CURRENT, sessions: 162840 }, prior: { ...GA4_PRIOR, sessions: 150560 }, ads: { current: { ...ADS_CURRENT, impressions: 1840000, clicks: 92100, cpm: 8.11, cpc: 0.42, cpa: 2.04 }, prior: { ...ADS_PRIOR, impressions: 1614000 } }, meta: { current: { ...META_CURRENT, impressions: 796000, reach: 384000, spend: 8940 }, prior: { ...META_PRIOR, impressions: 708000, reach: 342000, spend: 8120 } }, edm: { current: { ...EDM_CURRENT, totalClicks: 7640 }, prior: { ...EDM_PRIOR, totalClicks: 6980 } } },
  r12m: { current: { ...GA4_CURRENT, sessions: 318500 }, prior: { ...GA4_PRIOR, sessions: 302440 }, ads: { current: { ...ADS_CURRENT, impressions: 3600000, clicks: 174800, cpm: 7.80, cpc: 0.46, cpa: 2.26 }, prior: { ...ADS_PRIOR, impressions: 3317000 } }, meta: { current: { ...META_CURRENT, impressions: 1542000, reach: 748000, spend: 17280 }, prior: { ...META_PRIOR, impressions: 1374000, reach: 666000, spend: 15640 } }, edm: { current: { ...EDM_CURRENT, totalClicks: 15280, openRate: 0.348 }, prior: { ...EDM_PRIOR, totalClicks: 13940, openRate: 0.314 } } },
  monthlyGA4:  monthlySeries(GA4_PRIOR, GA4_CURRENT),
  monthlyAds:  monthlySeries(ADS_PRIOR, ADS_CURRENT),
  monthlyMeta: monthlySeries(META_PRIOR, META_CURRENT),
  monthlyEdm:  monthlySeries(EDM_PRIOR, EDM_CURRENT),
  // Sample data renders as if it were real so a demo doesn't show empty
  // sparklines — every month is marked "has data" (true), unlike a genuine
  // live-API fallback where gaps should stay visibly empty.
  monthlyHasData: {
    ga4: Array(12).fill(true),
    ads: Array(12).fill(true),
    meta: Array(12).fill(true),
    edm: Array(12).fill(true),
  },
  // Manual figures are always computed fresh from the real manual_metrics
  // table in the route (not sampled) — this placeholder only exists to
  // satisfy the PeriodData shape for the parts of `sample` still referenced
  // per-source (e.g. sample.r3m.current) elsewhere in scorecard.ts.
  manual: {
    pressOfficeImpressions: { r3m: null, r6m: null, r12m: null },
    monthlyPressOfficeImpressions: Array(12).fill(null),
  },
}
