/**
 * Klaviyo REST API v2024-10-15 client.
 *
 * Uses the Klaviyo REST API directly (no SDK dependency needed).
 * Requires a private API key with read access to campaigns, metrics, and lists.
 *
 * Docs: https://developers.klaviyo.com/en/reference/api-overview
 */
import { AppError } from '../middleware/errorHandler.js'

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api'
const API_VERSION = '2024-10-15'

export interface KlaviyoMetricsRaw {
  /** Total email sends across all campaigns in period */
  totalSends: number
  /** Unique opens */
  totalOpens: number
  /** Open rate (0–1) */
  openRate: number
  /** Total clicks */
  totalClicks: number
  /** Click-through rate (0–1) */
  ctr: number
  /** Unsubscribe count */
  totalUnsubscribes: number
  /** Unsubscribe rate (0–1) */
  unsubscribeRate: number
  /** Subscriber list size (current) */
  listSize: number
  /** Net list growth in the period */
  listGrowth: number
}

interface KlaviyoCampaign {
  id: string
  send_time: string
  name: string
}

interface KlaviyoCampaignStats {
  recipients: number
  opens: number
  clicks: number
  unsubscribes: number
}

function headers() {
  const key = process.env.KLAVIYO_API_KEY
  if (!key) throw new AppError(503, 'Klaviyo not configured', 'Set KLAVIYO_API_KEY in your .env.')
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision: API_VERSION,
    Accept: 'application/json',
  }
}

async function kFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${KLAVIYO_API_BASE}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), { headers: headers() })

  if (!res.ok) {
    const text = await res.text()
    throw new AppError(res.status, `Klaviyo API error on ${path}`, text)
  }

  return res.json() as Promise<T>
}

async function kPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${KLAVIYO_API_BASE}${path}`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new AppError(res.status, `Klaviyo API error on ${path}`, text)
  }

  return res.json() as Promise<T>
}

/**
 * List all campaigns sent within a date range.
 * @param startDate - ISO date string 'YYYY-MM-DD'
 * @param endDate   - ISO date string 'YYYY-MM-DD'
 */
async function getCampaignsInRange(startDate: string, endDate: string): Promise<KlaviyoCampaign[]> {
  const data = await kFetch<{ data: Array<{ id: string; attributes: { send_time: string; name: string } }> }>(
    '/campaigns',
    {
      'filter': `equals(messages.channel,'email'),greater-or-equal(send_time,${startDate}T00:00:00Z),less-or-equal(send_time,${endDate}T23:59:59Z)`,
      'fields[campaign]': 'name,send_time',
    },
  )

  return data.data.map((d) => ({ id: d.id, send_time: d.attributes.send_time, name: d.attributes.name }))
}

/**
 * Fetch aggregate stats for a single campaign via the campaign-values-reports endpoint.
 * Docs: https://developers.klaviyo.com/en/reference/query_campaign_values
 */
async function getCampaignStats(campaignId: string): Promise<KlaviyoCampaignStats> {
  const data = await kPost<{
    data: {
      attributes: {
        results: Array<{
          statistics: { recipients: number; opens_unique: number; clicks_unique: number; unsubscribes: number }
        }>
      }
    }
  }>('/campaign-values-reports', {
    data: {
      type: 'campaign-values-report',
      attributes: {
        timeframe: { key: 'all_time' },
        statistics: ['recipients', 'opens_unique', 'clicks_unique', 'unsubscribes'],
        filter: `equals(campaign_id,"${campaignId}")`,
      },
    },
  })

  const result = data.data.attributes.results[0]
  if (!result) return { recipients: 0, opens: 0, clicks: 0, unsubscribes: 0 }

  return {
    recipients: result.statistics.recipients,
    opens: result.statistics.opens_unique,
    clicks: result.statistics.clicks_unique,
    unsubscribes: result.statistics.unsubscribes,
  }
}

/**
 * Fetch current subscriber count and growth for a list.
 */
async function getListStats(listId: string): Promise<{ size: number }> {
  const data = await kFetch<{ data: { attributes: { profile_count: number } } }>(`/lists/${listId}`, {
    'fields[list]': 'profile_count',
  })
  return { size: data.data.attributes.profile_count }
}

/**
 * Primary export - fetch aggregate Klaviyo EDM metrics for a date range.
 *
 * Klaviyo's reporting API works at the campaign level, so we:
 * 1. List all campaigns sent in the range.
 * 2. Sum statistics across all of them.
 * 3. Fetch current list size.
 */
export async function fetchKlaviyoMetrics(
  startDate: string,
  endDate: string,
): Promise<KlaviyoMetricsRaw> {
  const listId = process.env.KLAVIYO_LIST_ID
  if (!listId) throw new AppError(503, 'Klaviyo not configured', 'Set KLAVIYO_LIST_ID in your .env.')

  const campaigns = await getCampaignsInRange(startDate, endDate)

  let totalSends = 0
  let totalOpens = 0
  let totalClicks = 0
  let totalUnsubscribes = 0

  for (const campaign of campaigns) {
    try {
      const stats = await getCampaignStats(campaign.id)
      totalSends += stats.recipients
      totalOpens += stats.opens
      totalClicks += stats.clicks
      totalUnsubscribes += stats.unsubscribes
    } catch {
      // Skip campaigns with missing stats rather than failing the whole response
      console.warn(`[klaviyo] Could not fetch stats for campaign ${campaign.id} - skipping`)
    }
  }

  const { size: listSize } = await getListStats(listId)

  return {
    totalSends,
    totalOpens,
    openRate: totalSends > 0 ? totalOpens / totalSends : 0,
    totalClicks,
    ctr: totalOpens > 0 ? totalClicks / totalOpens : 0,
    totalUnsubscribes,
    unsubscribeRate: totalSends > 0 ? totalUnsubscribes / totalSends : 0,
    listSize,
    listGrowth: 0, // Phase 2 enhancement: compare list size snapshots over time
  }
}

/**
 * Fetch per-day Klaviyo metrics across a date range - used by the backfill
 * script. Unlike GA4/Ads/Meta (continuous daily spend/traffic), Klaviyo
 * activity is naturally sparse - campaigns send on discrete days - so this
 * lists all campaigns in the range once, then buckets each campaign's stats
 * under its actual send date rather than issuing one API call per day.
 *
 * Days with no campaign sends are simply absent from the returned map;
 * days with sends get that day's send-level stats (list size is attached
 * to every day equally since it's a point-in-time snapshot, not additive).
 *
 * @returns map of 'YYYY-MM-DD' → that day's metrics
 */
export async function fetchKlaviyoMetricsByDay(
  startDate: string,
  endDate: string,
): Promise<Record<string, KlaviyoMetricsRaw>> {
  const listId = process.env.KLAVIYO_LIST_ID
  if (!listId) throw new AppError(503, 'Klaviyo not configured', 'Set KLAVIYO_LIST_ID in your .env.')

  const campaigns = await getCampaignsInRange(startDate, endDate)
  const { size: listSize } = await getListStats(listId)

  const byDay: Record<string, { totalSends: number; totalOpens: number; totalClicks: number; totalUnsubscribes: number }> = {}

  for (const campaign of campaigns) {
    const date = campaign.send_time.slice(0, 10)
    try {
      const stats = await getCampaignStats(campaign.id)
      const day = byDay[date] ?? { totalSends: 0, totalOpens: 0, totalClicks: 0, totalUnsubscribes: 0 }
      day.totalSends += stats.recipients
      day.totalOpens += stats.opens
      day.totalClicks += stats.clicks
      day.totalUnsubscribes += stats.unsubscribes
      byDay[date] = day
    } catch {
      console.warn(`[klaviyo] Could not fetch stats for campaign ${campaign.id} - skipping`)
    }
  }

  const result: Record<string, KlaviyoMetricsRaw> = {}
  for (const [date, day] of Object.entries(byDay)) {
    result[date] = {
      totalSends: day.totalSends,
      totalOpens: day.totalOpens,
      openRate: day.totalSends > 0 ? day.totalOpens / day.totalSends : 0,
      totalClicks: day.totalClicks,
      ctr: day.totalOpens > 0 ? day.totalClicks / day.totalOpens : 0,
      totalUnsubscribes: day.totalUnsubscribes,
      unsubscribeRate: day.totalSends > 0 ? day.totalUnsubscribes / day.totalSends : 0,
      listSize,
      listGrowth: 0,
    }
  }
  return result
}
