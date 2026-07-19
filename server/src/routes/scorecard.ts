/**
 * GET /api/scorecard?month=2026-05
 *
 * Orchestrates GA4 + Google Ads + Meta + Klaviyo across 3M / 6M / 12M windows
 * and the preceding prior periods, then maps to the scorecard shape.
 *
 * Each (source, window) pair is resolved independently in this priority order:
 *   1. Database - if the daily_metrics table has rows for that window, read
 *      from there (instant, no API call, matches the daily ingestion job).
 *   2. Live API - if the DB has no coverage for that window (e.g. it predates
 *      the backfill, or the scheduler hasn't caught up yet) but credentials
 *      are configured, fetch live.
 *   3. Sample data - if neither the DB nor a live credential is available.
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { getRollingDateRanges, getPriorPeriodRange, type DateRange } from '../mappers/periods.js'
import { buildScorecardResponse, type PeriodData } from '../mappers/scorecardMapper.js'
import { fetchGA4Metrics, type GA4MetricsRaw } from '../clients/ga4.js'
import { fetchGoogleAdsMetrics, type GoogleAdsMetricsRaw } from '../clients/googleAds.js'
import { fetchMetaAccountMetrics, type MetaAccountMetricsRaw } from '../clients/meta.js'
import { fetchKlaviyoMetrics, type KlaviyoMetricsRaw } from '../clients/klaviyo.js'
import { hasIngestedDataForRange, getManualMetric, getManualMetricSeries, type MetricSource } from '../db/index.js'
import { readGA4FromDb, readGoogleAdsFromDb, readMetaFromDb, readKlaviyoFromDb, lastNCalendarMonths } from '../db/reader.js'
import { AppError } from '../middleware/errorHandler.js'
import { SAMPLE_PERIOD_DATA } from '../data/sampleData.js'

export const scorecardRouter = Router()

const QuerySchema = z.object({
  /** Reporting month in 'YYYY-MM' format (defaults to current month). */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be 'YYYY-MM'")
    .optional(),
})

interface ResolvedSource<T> {
  values: T[]
  /** True where the value came from the DB or a live API call; false where it fell back to sample data. */
  hasData: boolean[]
}

/**
 * Resolves one source across a set of date windows. For each window independently:
 * DB (if covered) → live API (if configured) → sample fallback.
 *
 * `hasData` reports which windows are genuinely-ingested vs. sample fallback
 * so sparklines can render "no data" as empty instead of implying a measured
 * zero - EXCEPT when `treatSampleAsRealData` is set, which marks the sample
 * fallback itself as "has data" too. That's for demo/sharing purposes: a
 * credential that was never configured (e.g. GA4 in a demo environment)
 * should show a complete, readable sample trend rather than blank bars -
 * blank bars are only meaningful when a REAL source has gaps in its history.
 */
async function resolveSource<T>(
  label: string,
  dbSource: MetricSource,
  readFromDb: (range: DateRange) => T,
  isLiveConfigured: boolean,
  fetchLive: (start: string, end: string) => Promise<T>,
  windows: DateRange[],
  sampleValues: T[],
  treatSampleAsRealData = false,
): Promise<ResolvedSource<T>> {
  const resolved = await Promise.all(
    windows.map(async (w, i): Promise<{ value: T; hasData: boolean }> => {
      if (hasIngestedDataForRange(dbSource, w.startDate, w.endDate)) {
        return { value: readFromDb(w), hasData: true }
      }
      if (isLiveConfigured) {
        try {
          return { value: await fetchLive(w.startDate, w.endDate), hasData: true }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          console.warn(`[scorecard] ${label} live fetch failed for ${w.startDate}–${w.endDate}, using sample data - ${reason}`)
          return { value: sampleValues[i], hasData: treatSampleAsRealData }
        }
      }
      return { value: sampleValues[i], hasData: treatSampleAsRealData }
    }),
  )
  return { values: resolved.map((r) => r.value), hasData: resolved.map((r) => r.hasData) }
}

scorecardRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = QuerySchema.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError(400, 'Invalid query parameters', parsed.error.message)
    }

    const now = new Date()
    const reportingMonth =
      parsed.data.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const ranges = getRollingDateRanges(reportingMonth)
    // Prior periods are YEAR-ON-YEAR (same window, 12 months earlier) - not
    // sequential quarter-on-quarter - per the project brief.
    const priorR3m = getPriorPeriodRange(ranges.r3m)
    const priorR6m = getPriorPeriodRange(ranges.r6m)
    const priorR12m = getPriorPeriodRange(ranges.r12m)
    const windows = [ranges.r3m, priorR3m, ranges.r6m, priorR6m, ranges.r12m, priorR12m]

    // 12 distinct, non-overlapping calendar months for sparklines - enough
    // to cover the 12M period view; the frontend slices the trailing 3, 6,
    // or 12 of these per the Period View selector. Separate from the 6
    // rolling/prior windows above, which overlap each other and would
    // otherwise distort a month-by-month trend line.
    const monthlyWindows = lastNCalendarMonths(reportingMonth, 12)

    const sample = { ...SAMPLE_PERIOD_DATA, reportingMonth }

    const [
      ga4Rolling, adsRolling, metaRolling, edmRolling,
      ga4Monthly, adsMonthly, metaMonthly, edmMonthly,
    ] = await Promise.all([
      resolveSource('GA4', 'ga4', readGA4FromDb, isGA4Configured(), fetchGA4Metrics, windows, [
        sample.r3m.current, sample.r3m.prior, sample.r6m.current, sample.r6m.prior, sample.r12m.current, sample.r12m.prior,
      ] as GA4MetricsRaw[]),
      resolveSource('Google Ads', 'google_ads', readGoogleAdsFromDb, isGoogleAdsConfigured(), fetchGoogleAdsMetrics, windows, [
        sample.r3m.ads.current, sample.r3m.ads.prior, sample.r6m.ads.current, sample.r6m.ads.prior, sample.r12m.ads.current, sample.r12m.ads.prior,
      ] as GoogleAdsMetricsRaw[]),
      resolveSource('Meta', 'meta', readMetaFromDb, isMetaConfigured(), fetchMetaAccountMetrics, windows, [
        sample.r3m.meta.current, sample.r3m.meta.prior, sample.r6m.meta.current, sample.r6m.meta.prior, sample.r12m.meta.current, sample.r12m.meta.prior,
      ] as MetaAccountMetricsRaw[]),
      resolveSource('Klaviyo', 'klaviyo', readKlaviyoFromDb, isKlaviyoConfigured(), fetchKlaviyoMetrics, windows, [
        sample.r3m.edm.current, sample.r3m.edm.prior, sample.r6m.edm.current, sample.r6m.edm.prior, sample.r12m.edm.current, sample.r12m.edm.prior,
      ] as KlaviyoMetricsRaw[]),
      resolveSource('GA4 (monthly)', 'ga4', readGA4FromDb, isGA4Configured(), fetchGA4Metrics, monthlyWindows, sample.monthlyGA4, true),
      resolveSource('Google Ads (monthly)', 'google_ads', readGoogleAdsFromDb, isGoogleAdsConfigured(), fetchGoogleAdsMetrics, monthlyWindows, sample.monthlyAds, true),
      resolveSource('Meta (monthly)', 'meta', readMetaFromDb, isMetaConfigured(), fetchMetaAccountMetrics, monthlyWindows, sample.monthlyMeta, true),
      resolveSource('Klaviyo (monthly)', 'klaviyo', readKlaviyoFromDb, isKlaviyoConfigured(), fetchKlaviyoMetrics, monthlyWindows, sample.monthlyEdm, true),
    ])

    const [ga4R3m, ga4R3mPrior, ga4R6m, ga4R6mPrior, ga4R12m, ga4R12mPrior] = ga4Rolling.values
    const [adsR3m, adsR3mPrior, adsR6m, adsR6mPrior, adsR12m, adsR12mPrior] = adsRolling.values
    const [metaR3m, metaR3mPrior, metaR6m, metaR6mPrior, metaR12m, metaR12mPrior] = metaRolling.values
    const [edmR3m, edmR3mPrior, edmR6m, edmR6mPrior, edmR12m, edmR12mPrior] = edmRolling.values

    // Manually-entered figures. The headline value is a monthly figure keyed
    // to the reporting month; the 3M/6M/12M boxes are INDEPENDENT typed
    // overrides (not sums of the monthly figure) so each period can be
    // edited directly on the card.
    const monthlyPressOfficeImpressions = getManualMetricSeries(
      'press_office_impressions',
      monthlyWindows.map((w) => w.startDate.slice(0, 7)),
    )

    // 'YYYY-MM-DD' -> 'Oct 2025', one per monthlyWindows entry - shared by every
    // card's sparkline tooltip. A fixed month-name table instead of
    // toLocaleString('en-AU', { month: 'short' }): Node's en-AU ICU data
    // doesn't abbreviate June ("June" instead of "Jun"), which read as an
    // inconsistent one-off against every other month.
    const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const sparklineMonths = monthlyWindows.map((w) => {
      const [year, month] = w.startDate.split('-').map(Number)
      return `${SHORT_MONTHS[month - 1]} ${year}`
    })

    // Whether EVERY rolling window for a source came from the DB or a live
    // API call (true) vs. at least one window fell back to sample data
    // (false) - the rolling resolutions (not the monthly ones, which force
    // treatSampleAsRealData for sparkline display) are the honest signal
    // here, since they don't paper over a sample fallback.
    const allSourcesLive =
      ga4Rolling.hasData.every(Boolean) &&
      adsRolling.hasData.every(Boolean) &&
      metaRolling.hasData.every(Boolean) &&
      edmRolling.hasData.every(Boolean)
    const anySourceLive =
      ga4Rolling.hasData.some(Boolean) ||
      adsRolling.hasData.some(Boolean) ||
      metaRolling.hasData.some(Boolean) ||
      edmRolling.hasData.some(Boolean)
    const dataSourceStatus: 'live' | 'mixed' | 'sample' = allSourcesLive ? 'live' : anySourceLive ? 'mixed' : 'sample'

    const periodData: PeriodData = {
      reportingMonth,
      sparklineMonths,
      dataSourceStatus,
      r3m:  { current: ga4R3m,  prior: ga4R3mPrior,  ads: { current: adsR3m,  prior: adsR3mPrior  }, meta: { current: metaR3m,  prior: metaR3mPrior  }, edm: { current: edmR3m,  prior: edmR3mPrior  } },
      r6m:  { current: ga4R6m,  prior: ga4R6mPrior,  ads: { current: adsR6m,  prior: adsR6mPrior  }, meta: { current: metaR6m,  prior: metaR6mPrior  }, edm: { current: edmR6m,  prior: edmR6mPrior  } },
      r12m: { current: ga4R12m, prior: ga4R12mPrior, ads: { current: adsR12m, prior: adsR12mPrior }, meta: { current: metaR12m, prior: metaR12mPrior }, edm: { current: edmR12m, prior: edmR12mPrior } },
      monthlyGA4: ga4Monthly.values,
      monthlyAds: adsMonthly.values,
      monthlyMeta: metaMonthly.values,
      monthlyEdm: edmMonthly.values,
      monthlyHasData: {
        ga4: ga4Monthly.hasData,
        ads: adsMonthly.hasData,
        meta: metaMonthly.hasData,
        edm: edmMonthly.hasData,
      },
      manual: {
        pressOfficeImpressions: {
          r3m: getManualMetric(reportingMonth, 'press_office_impressions_3m'),
          r6m: getManualMetric(reportingMonth, 'press_office_impressions_6m'),
          r12m: getManualMetric(reportingMonth, 'press_office_impressions_12m'),
        },
        monthlyPressOfficeImpressions,
      },
    }

    return res.json(buildScorecardResponse(periodData))
  } catch (err) {
    return next(err)
  }
})

function isGA4Configured(): boolean {
  return !!(process.env.GA4_KEY_FILE && process.env.GA4_PROPERTY_ID)
}

function isGoogleAdsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  )
}

function isMetaConfigured(): boolean {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID)
}

function isKlaviyoConfigured(): boolean {
  return !!process.env.KLAVIYO_API_KEY
}
