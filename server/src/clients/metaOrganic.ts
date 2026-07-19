/**
 * Meta organic social insights client - Instagram Business Account via the
 * Graph API's IG Insights endpoint (NOT the Ads Insights API used in
 * meta.ts, which only covers paid campaigns).
 *
 * Replaces the Iconosquare integration for Instagram - organic reach/
 * engagement is available for free through Meta's own API.
 *
 * Facebook Page-level insights (page_impressions etc.) are NOT included
 * here: Meta requires a Page-scoped access token for that endpoint (our
 * System User token returns "This method must be called with a Page
 * Access Token"), and most of the old page_* metrics were deprecated in
 * 2024–2025 waves anyway. Revisit if Page-level organic data becomes a
 * priority - it needs a token-exchange step, not just a permission grant.
 *
 * IG metric names below are current as of the Nov 2025 deprecation wave -
 * Meta previously used `impressions`, which is now retired in favour of
 * `views`. If this starts erroring with "must be one of the following
 * values", the API error message itself lists the current valid set.
 *
 * Requires a token with: instagram_basic, instagram_manage_insights - plus
 * the Instagram account added as an asset to the System User in Business
 * Settings.
 *
 * Docs: https://developers.facebook.com/docs/instagram-api/guides/insights
 */
import { AppError } from '../middleware/errorHandler.js'

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

export interface MetaOrganicMetricsRaw {
  instagramReach: number
  instagramViews: number
  instagramEngagements: number
  instagramInteractions: number
  followerCount: number
}

function token(): string {
  const t = process.env.META_ACCESS_TOKEN
  if (!t) throw new AppError(503, 'Meta not configured', 'Set META_ACCESS_TOKEN in your .env.')
  return t
}

function igAccountId(): string {
  const id = process.env.META_IG_ACCOUNT_ID
  if (!id) throw new AppError(503, 'Instagram not configured', 'Set META_IG_ACCOUNT_ID in your .env.')
  return id
}

async function graphFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`)
  url.searchParams.set('access_token', token())
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString())
  const body = (await res.json()) as { error?: { message: string; code: number } } & T

  if (!res.ok || body.error) {
    throw new AppError(res.status, `Meta organic API error on ${path}`, body.error?.message ?? `HTTP ${res.status}`)
  }

  return body
}

interface TotalValueInsight {
  name: string
  total_value: { value: number }
}

/**
 * Fetch Instagram Business Account organic insights for a date range.
 *
 * Uses metric_type=total_value, which returns ONE aggregated number per
 * metric for the whole range - not a daily series - despite period=day
 * being required as a parameter. This matches the account-level totals
 * shape the rest of the app expects (see fetchMetaAccountMetrics in meta.ts).
 */
async function fetchInstagramMetrics(startDate: string, endDate: string): Promise<{
  reach: number
  views: number
  accountsEngaged: number
  totalInteractions: number
}> {
  const response = await graphFetch<{ data: TotalValueInsight[] }>(`/${igAccountId()}/insights`, {
    metric: 'reach,views,accounts_engaged,total_interactions',
    period: 'day',
    since: startDate,
    until: endDate,
    metric_type: 'total_value',
  })

  const value = (metricName: string) => response.data.find((m) => m.name === metricName)?.total_value.value ?? 0

  return {
    reach: value('reach'),
    views: value('views'),
    accountsEngaged: value('accounts_engaged'),
    totalInteractions: value('total_interactions'),
  }
}

/**
 * Fetch current Instagram follower count (point-in-time, not summed over a range).
 */
async function fetchFollowerCount(): Promise<number> {
  const response = await graphFetch<{ followers_count?: number }>(`/${igAccountId()}`, {
    fields: 'followers_count',
  })
  return response.followers_count ?? 0
}

/**
 * Public entry point - Instagram organic metrics for a date range. Mirrors
 * the scorecard's "organic social impressions, engagements" scope that was
 * previously going to come from Iconosquare.
 */
export async function fetchMetaOrganicMetrics(startDate: string, endDate: string): Promise<MetaOrganicMetricsRaw> {
  const [instagram, followerCount] = await Promise.all([
    fetchInstagramMetrics(startDate, endDate),
    fetchFollowerCount(),
  ])

  return {
    instagramReach: instagram.reach,
    instagramViews: instagram.views,
    instagramEngagements: instagram.accountsEngaged,
    instagramInteractions: instagram.totalInteractions,
    followerCount,
  }
}
