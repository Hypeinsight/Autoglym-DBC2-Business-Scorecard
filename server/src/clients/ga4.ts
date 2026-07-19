/**
 * GA4 Data API client.
 *
 * Uses @googleapis/analyticsdata with a service account key file.
 * Service account must have "Viewer" role on the GA4 property.
 *
 * Docs: https://developers.google.com/analytics/devguides/reporting/data/v1
 */
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { AppError } from '../middleware/errorHandler.js'

/** Metrics we pull from GA4 for the scorecard. */
export interface GA4MetricsRaw {
  sessions: number
  engagedSessions: number
  bounceRate: number            // 0–1
  averageSessionDuration: number // seconds
  screenPageViews: number
  /** Outbound clicks to retailer buttons (requires GTM event import). */
  retailerButtonClicks: number
  /** Derived: engagedSessions / sessions */
  engagementRate: number
}

let _client: BetaAnalyticsDataClient | null = null

function getClient(): BetaAnalyticsDataClient {
  if (_client) return _client

  const keyFile = process.env.GA4_KEY_FILE
  if (!keyFile) {
    throw new AppError(
      503,
      'GA4 not configured',
      'Set GA4_KEY_FILE in your .env to point to the service account JSON.',
    )
  }

  _client = new BetaAnalyticsDataClient({ keyFilename: keyFile })
  return _client
}

/**
 * Fetch aggregate GA4 metrics for a date range.
 *
 * @param startDate - 'YYYY-MM-DD' or GA4 relative ('NdaysAgo', 'yesterday', 'today')
 * @param endDate   - same format
 */
export async function fetchGA4Metrics(
  startDate: string,
  endDate: string,
): Promise<GA4MetricsRaw> {
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!propertyId) {
    throw new AppError(503, 'GA4 not configured', 'Set GA4_PROPERTY_ID in your .env.')
  }

  const client = getClient()

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'screenPageViews' },
      { name: 'eventCount' }, // filtered below for retailer button events
    ],
    // Only count retailer button click events for the conversion metric
    dimensionFilter: undefined,
  })

  const row = response.rows?.[0]?.metricValues
  if (!row) {
    throw new AppError(502, 'GA4 returned no data', `Date range: ${startDate} – ${endDate}`)
  }

  const sessions = Number(row[0].value ?? 0)
  const engagedSessions = Number(row[1].value ?? 0)
  const bounceRate = Number(row[2].value ?? 0)
  const averageSessionDuration = Number(row[3].value ?? 0)
  const screenPageViews = Number(row[4].value ?? 0)

  // Retailer button clicks come from a separate event-scoped query
  const retailerButtonClicks = await fetchRetailerButtonClicks(client, propertyId, startDate, endDate)

  return {
    sessions,
    engagedSessions,
    bounceRate,
    averageSessionDuration,
    screenPageViews,
    retailerButtonClicks,
    engagementRate: sessions > 0 ? engagedSessions / sessions : 0,
  }
}

/**
 * Separate GA4 query for the retailer button click event.
 * GTM fires 'retailer_button_click' with dimension 'retailer_name'.
 */
async function fetchRetailerButtonClicks(
  client: BetaAnalyticsDataClient,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        stringFilter: { value: 'retailer_button_click', matchType: 'EXACT' },
      },
    },
  })

  const total = (response.rows ?? []).reduce(
    (sum: number, row) => sum + Number(row.metricValues?.[0]?.value ?? 0),
    0,
  )
  return total
}

/**
 * Fetch per-day GA4 metrics across a date range in a single API call - used
 * by the backfill script so history doesn't require one round-trip per day.
 *
 * @returns map of 'YYYY-MM-DD' → that day's metrics
 */
export async function fetchGA4MetricsByDay(
  startDate: string,
  endDate: string,
): Promise<Record<string, GA4MetricsRaw>> {
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!propertyId) {
    throw new AppError(503, 'GA4 not configured', 'Set GA4_PROPERTY_ID in your .env.')
  }

  const client = getClient()

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'screenPageViews' },
    ],
  })

  const [retailerResponse] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }, { name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        stringFilter: { value: 'retailer_button_click', matchType: 'EXACT' },
      },
    },
  })

  const retailerClicksByDate = new Map<string, number>()
  for (const row of retailerResponse.rows ?? []) {
    const date = formatGA4Date(row.dimensionValues?.[0]?.value ?? '')
    const count = Number(row.metricValues?.[0]?.value ?? 0)
    retailerClicksByDate.set(date, (retailerClicksByDate.get(date) ?? 0) + count)
  }

  const result: Record<string, GA4MetricsRaw> = {}
  for (const row of response.rows ?? []) {
    const date = formatGA4Date(row.dimensionValues?.[0]?.value ?? '')
    const values = row.metricValues ?? []
    const sessions = Number(values[0]?.value ?? 0)
    const engagedSessions = Number(values[1]?.value ?? 0)
    const bounceRate = Number(values[2]?.value ?? 0)
    const averageSessionDuration = Number(values[3]?.value ?? 0)
    const screenPageViews = Number(values[4]?.value ?? 0)

    result[date] = {
      sessions,
      engagedSessions,
      bounceRate,
      averageSessionDuration,
      screenPageViews,
      retailerButtonClicks: retailerClicksByDate.get(date) ?? 0,
      engagementRate: sessions > 0 ? engagedSessions / sessions : 0,
    }
  }
  return result
}

/** GA4's 'date' dimension returns 'YYYYMMDD' - normalize to 'YYYY-MM-DD'. */
function formatGA4Date(raw: string): string {
  if (raw.length !== 8) return raw
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

/**
 * Fetch retailer click breakdown by retailer name dimension.
 * Returns a map of retailer name → click count.
 */
export async function fetchRetailerBreakdown(
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!propertyId) throw new AppError(503, 'GA4 not configured', 'Set GA4_PROPERTY_ID.')

  const client = getClient()

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'customEvent:retailer_name' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        stringFilter: { value: 'retailer_button_click', matchType: 'EXACT' },
      },
    },
  })

  const result: Record<string, number> = {}
  for (const row of response.rows ?? []) {
    const name = row.dimensionValues?.[0]?.value ?? 'Unknown'
    const count = Number(row.metricValues?.[0]?.value ?? 0)
    result[name] = count
  }
  return result
}
