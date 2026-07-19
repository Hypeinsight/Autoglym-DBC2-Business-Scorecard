/**
 * Google Ads API client.
 *
 * Uses the google-ads-api npm package (unofficial but well-maintained).
 * Requires OAuth2 refresh token + developer token.
 *
 * Docs: https://opteo.com/dev/google-ads-api | https://ads.google.com/aw/apicenter
 */
import { GoogleAdsApi } from 'google-ads-api'
import { AppError } from '../middleware/errorHandler.js'

export interface GoogleAdsMetricsRaw {
  spend: number          // AUD
  impressions: number
  clicks: number
  conversions: number
  ctr: number            // 0–1
  cpc: number            // AUD
  cpm: number            // AUD per 1000 impressions
  cpa: number            // AUD per conversion
}

let _api: GoogleAdsApi | null = null

function getApi(): GoogleAdsApi {
  if (_api) return _api

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN

  if (!clientId || !clientSecret || !developerToken) {
    throw new AppError(
      503,
      'Google Ads not configured',
      'Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_DEVELOPER_TOKEN in your .env.',
    )
  }

  _api = new GoogleAdsApi({ client_id: clientId, client_secret: clientSecret, developer_token: developerToken })
  return _api
}

/**
 * Fetch aggregate campaign performance metrics for a date range.
 *
 * @param startDate - 'YYYY-MM-DD'
 * @param endDate   - 'YYYY-MM-DD'
 */
export async function fetchGoogleAdsMetrics(
  startDate: string,
  endDate: string,
): Promise<GoogleAdsMetricsRaw> {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

  if (!customerId || !refreshToken) {
    throw new AppError(
      503,
      'Google Ads not configured',
      'Set GOOGLE_ADS_CUSTOMER_ID and GOOGLE_ADS_REFRESH_TOKEN in your .env.',
    )
  }

  const api = getApi()
  const customer = api.Customer({
    customer_id: customerId,
    login_customer_id: loginCustomerId,
    refresh_token: refreshToken,
  })

  // No campaign.status filter - historical reporting needs spend from ALL
  // campaigns that ran in the period, including ones since paused or removed.
  // Filtering to ENABLED-only silently drops any campaign that isn't live
  // *today*, which understates spend for any month except the current one.
  const rows = await customer.query(`
    SELECT
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm
    FROM campaign
    WHERE
      segments.date BETWEEN '${startDate}' AND '${endDate}'
  `)

  // Aggregate across all campaigns that had activity in this range
  let spend = 0
  let impressions = 0
  let clicks = 0
  let conversions = 0
  let ctrSum = 0
  let cpcSum = 0
  let cpmSum = 0

  for (const row of rows) {
    const m = row.metrics!
    spend += (m.cost_micros ?? 0) / 1_000_000
    impressions += m.impressions ?? 0
    clicks += m.clicks ?? 0
    conversions += m.conversions ?? 0
    ctrSum += m.ctr ?? 0
    cpcSum += (m.average_cpc ?? 0) / 1_000_000
    cpmSum += (m.average_cpm ?? 0) / 1_000_000
  }

  const count = rows.length || 1
  return {
    spend,
    impressions,
    clicks,
    conversions,
    ctr: ctrSum / count,
    cpc: cpcSum / count,
    cpm: cpmSum / count,
    cpa: conversions > 0 ? spend / conversions : 0,
  }
}

/**
 * Fetch per-day metrics across a date range in a single API call - used by the
 * backfill script so history doesn't require one round-trip per day.
 *
 * @returns map of 'YYYY-MM-DD' → that day's aggregated metrics across all campaigns
 */
export async function fetchGoogleAdsMetricsByDay(
  startDate: string,
  endDate: string,
): Promise<Record<string, GoogleAdsMetricsRaw>> {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

  if (!customerId || !refreshToken) {
    throw new AppError(
      503,
      'Google Ads not configured',
      'Set GOOGLE_ADS_CUSTOMER_ID and GOOGLE_ADS_REFRESH_TOKEN in your .env.',
    )
  }

  const api = getApi()
  const customer = api.Customer({
    customer_id: customerId,
    login_customer_id: loginCustomerId,
    refresh_token: refreshToken,
  })

  // No campaign.status filter - see note in fetchGoogleAdsMetrics above.
  const rows = await customer.query(`
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm
    FROM campaign
    WHERE
      segments.date BETWEEN '${startDate}' AND '${endDate}'
  `)

  interface DayAgg { spend: number; impressions: number; clicks: number; conversions: number; ctrSum: number; cpcSum: number; cpmSum: number; rowCount: number }
  const byDay = new Map<string, DayAgg>()

  for (const row of rows) {
    const date = row.segments!.date!
    const m = row.metrics!
    const agg = byDay.get(date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, ctrSum: 0, cpcSum: 0, cpmSum: 0, rowCount: 0 }
    agg.spend += (m.cost_micros ?? 0) / 1_000_000
    agg.impressions += m.impressions ?? 0
    agg.clicks += m.clicks ?? 0
    agg.conversions += m.conversions ?? 0
    agg.ctrSum += m.ctr ?? 0
    agg.cpcSum += (m.average_cpc ?? 0) / 1_000_000
    agg.cpmSum += (m.average_cpm ?? 0) / 1_000_000
    agg.rowCount += 1
    byDay.set(date, agg)
  }

  const result: Record<string, GoogleAdsMetricsRaw> = {}
  for (const [date, agg] of byDay) {
    const count = agg.rowCount || 1
    result[date] = {
      spend: agg.spend,
      impressions: agg.impressions,
      clicks: agg.clicks,
      conversions: agg.conversions,
      ctr: agg.ctrSum / count,
      cpc: agg.cpcSum / count,
      cpm: agg.cpmSum / count,
      cpa: agg.conversions > 0 ? agg.spend / agg.conversions : 0,
    }
  }
  return result
}
