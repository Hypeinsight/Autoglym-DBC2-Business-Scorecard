/**
 * Reconstructs each source's *MetricsRaw shape from the daily_metrics table
 * for a given date window - sums additive metrics (spend, impressions,
 * clicks), averages rate metrics (CTR, bounce rate, frequency), and takes
 * the latest point-in-time value for snapshot metrics (list size).
 *
 * Mirrors the shapes returned by the live API clients so the scorecard
 * mapper doesn't need to know whether data came from the DB or an API call.
 */
import type { GA4MetricsRaw } from '../clients/ga4.js'
import type { GoogleAdsMetricsRaw } from '../clients/googleAds.js'
import type { MetaAccountMetricsRaw } from '../clients/meta.js'
import type { KlaviyoMetricsRaw } from '../clients/klaviyo.js'
import { sumMetric, avgMetric, latestMetric, hasIngestedDataForRange } from './index.js'

type Range = { startDate: string; endDate: string }

export function readGA4FromDb(range: Range): GA4MetricsRaw {
  const { startDate: s, endDate: e } = range
  const sessions = sumMetric('ga4', 'sessions', s, e)
  const engagedSessions = sumMetric('ga4', 'engagedSessions', s, e)
  return {
    sessions,
    engagedSessions,
    bounceRate: avgMetric('ga4', 'bounceRate', s, e),
    averageSessionDuration: avgMetric('ga4', 'averageSessionDuration', s, e),
    screenPageViews: sumMetric('ga4', 'screenPageViews', s, e),
    retailerButtonClicks: sumMetric('ga4', 'retailerButtonClicks', s, e),
    engagementRate: sessions > 0 ? engagedSessions / sessions : 0,
  }
}

export function readGoogleAdsFromDb(range: Range): GoogleAdsMetricsRaw {
  const { startDate: s, endDate: e } = range
  const spend = sumMetric('google_ads', 'spend', s, e)
  const conversions = sumMetric('google_ads', 'conversions', s, e)
  return {
    spend,
    impressions: sumMetric('google_ads', 'impressions', s, e),
    clicks: sumMetric('google_ads', 'clicks', s, e),
    conversions,
    ctr: avgMetric('google_ads', 'ctr', s, e),
    cpc: avgMetric('google_ads', 'cpc', s, e),
    cpm: avgMetric('google_ads', 'cpm', s, e),
    cpa: conversions > 0 ? spend / conversions : 0,
  }
}

export function readMetaFromDb(range: Range): MetaAccountMetricsRaw {
  const { startDate: s, endDate: e } = range
  const spend = sumMetric('meta', 'spend', s, e)
  const conversions = sumMetric('meta', 'conversions', s, e)
  return {
    spend,
    impressions: sumMetric('meta', 'impressions', s, e),
    reach: sumMetric('meta', 'reach', s, e),
    frequency: avgMetric('meta', 'frequency', s, e),
    cpm: avgMetric('meta', 'cpm', s, e),
    cpc: avgMetric('meta', 'cpc', s, e),
    ctr: avgMetric('meta', 'ctr', s, e),
    cpa: conversions > 0 ? spend / conversions : 0,
    linkClicks: sumMetric('meta', 'linkClicks', s, e),
    conversions,
  }
}

export function readKlaviyoFromDb(range: Range): KlaviyoMetricsRaw {
  const { startDate: s, endDate: e } = range
  const totalSends = sumMetric('klaviyo', 'totalSends', s, e)
  const totalOpens = sumMetric('klaviyo', 'totalOpens', s, e)
  const totalClicks = sumMetric('klaviyo', 'totalClicks', s, e)
  const totalUnsubscribes = sumMetric('klaviyo', 'totalUnsubscribes', s, e)
  return {
    totalSends,
    totalOpens,
    openRate: totalSends > 0 ? totalOpens / totalSends : 0,
    totalClicks,
    ctr: totalOpens > 0 ? totalClicks / totalOpens : 0,
    totalUnsubscribes,
    unsubscribeRate: totalSends > 0 ? totalUnsubscribes / totalSends : 0,
    listSize: latestMetric('klaviyo', 'listSize', e),
    listGrowth: sumMetric('klaviyo', 'listGrowth', s, e),
  }
}

/**
 * Returns the last `count` full calendar months (oldest first) ending at
 * `reportingMonth` ('YYYY-MM') INCLUSIVE. Used to build true monthly
 * sparklines - 9 distinct, non-overlapping months - instead of sampling
 * the 4 overlapping 3M/6M/12M rolling-window totals.
 *
 * Pure integer month arithmetic - NOT `Date`/`toISOString()` - since
 * `new Date(y, m, d)` constructs in local time while `toISOString()`
 * converts to UTC, silently shifting the date (sometimes by a whole month
 * near a month boundary) in timezones behind UTC.
 */
export function lastNCalendarMonths(reportingMonth: string, count: number): Range[] {
  const [year, month] = reportingMonth.split('-').map(Number)
  const reportingTotalMonths = year * 12 + (month - 1) // 0-indexed total months

  return Array.from({ length: count }, (_, i) => {
    const offset = count - 1 - i // oldest first, offset 0 = reportingMonth itself
    const totalMonths = reportingTotalMonths - offset
    const y = Math.floor(totalMonths / 12)
    const m = (totalMonths % 12) + 1 // 1-indexed
    return { startDate: fmt(y, m, 1), endDate: fmt(y, m, daysInMonth(y, m)) }
  })
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function fmt(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export { hasIngestedDataForRange }
