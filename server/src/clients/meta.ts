/**
 * Meta Marketing API client (Facebook / Instagram Ads).
 *
 * Uses the Graph API directly — no official Node SDK needed.
 * Auth: long-lived System User token (never expires) or long-lived page token (60 days).
 *
 * Required permissions on the token: ads_read, read_insights
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/insights
 */
import { AppError } from '../middleware/errorHandler.js'

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MetaAccountMetricsRaw {
  spend: number          // AUD
  impressions: number
  reach: number
  frequency: number      // impressions / reach
  cpm: number            // AUD per 1000 impressions
  cpc: number            // AUD per link click (CPLC)
  ctr: number            // link click-through rate (0–1)
  cpa: number            // AUD per conversion (retailer click)
  linkClicks: number
  conversions: number    // outbound clicks tracked as conversion events
}

export interface MetaCampaignMetricsRaw extends MetaAccountMetricsRaw {
  campaignId: string
  campaignName: string
  status: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function token(): string {
  const t = process.env.META_ACCESS_TOKEN
  if (!t) throw new AppError(503, 'Meta not configured', 'Set META_ACCESS_TOKEN in your .env.')
  return t
}

function adAccountId(): string {
  const id = process.env.META_AD_ACCOUNT_ID
  if (!id) throw new AppError(503, 'Meta not configured', 'Set META_AD_ACCOUNT_ID in your .env.')
  // Ensure act_ prefix
  return id.startsWith('act_') ? id : `act_${id}`
}

async function graphFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`)
  url.searchParams.set('access_token', token())
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString())
  const body = await res.json() as { error?: { message: string; code: number }; data?: unknown } & T

  if (!res.ok || body.error) {
    throw new AppError(
      res.status,
      `Meta API error on ${path}`,
      body.error?.message ?? `HTTP ${res.status}`,
    )
  }

  return body
}

// ── Core insight fields ───────────────────────────────────────────────────────

const INSIGHT_FIELDS = [
  'spend',
  'impressions',
  'reach',
  'frequency',
  'cpm',
  'cpc',       // cost per link click (CPLC)
  'ctr',       // link CTR
  'actions',   // contains conversions / outbound_click
  'cost_per_action_type',
].join(',')

interface RawInsightRow {
  spend: string
  impressions: string
  reach: string
  frequency: string
  cpm: string
  cpc: string
  ctr: string
  actions?: Array<{ action_type: string; value: string }>
  cost_per_action_type?: Array<{ action_type: string; value: string }>
}

function parseInsightRow(row: RawInsightRow): Omit<MetaAccountMetricsRaw, 'spend'> & { spend: number } {
  const spend = parseFloat(row.spend ?? '0')
  const impressions = parseInt(row.impressions ?? '0', 10)
  const reach = parseInt(row.reach ?? '0', 10)
  const frequency = parseFloat(row.frequency ?? '0')
  const cpm = parseFloat(row.cpm ?? '0')
  const cpc = parseFloat(row.cpc ?? '0')
  // Meta ctr is already a percentage string — convert to 0–1
  const ctr = parseFloat(row.ctr ?? '0') / 100

  // Link clicks — outbound clicks to the website (retailer buttons, landing pages, etc.)
  const actions = row.actions ?? []
  const linkClicks = parseInt(
    actions.find(a => a.action_type === 'link_click')?.value ?? '0',
    10,
  )

  // Conversion action, in priority order — first one present in the response wins.
  // Must stay in sync with the cost_per_action_type lookup below so CPA is computed
  // against the SAME action, not a different one (e.g. conversions from fb_pixel_custom
  // priced using link_click cost, which understates CPA by orders of magnitude).
  const CONVERSION_ACTION_PRIORITY = ['outbound_click', 'offsite_conversion.fb_pixel_custom', 'link_click']
  const conversionAction = CONVERSION_ACTION_PRIORITY.find(
    (type) => actions.some((a) => a.action_type === type),
  )
  const conversions = parseInt(
    actions.find(a => a.action_type === conversionAction)?.value ?? '0',
    10,
  )

  // Prefer Meta's own cost_per_action_type figure; if that action isn't present there
  // (Meta doesn't always report CPA for every action type), derive it from spend/conversions.
  const cpaCandidates = row.cost_per_action_type ?? []
  const reportedCpa = parseFloat(
    cpaCandidates.find(a => a.action_type === conversionAction)?.value ?? '0',
  )
  const cpa = reportedCpa > 0 ? reportedCpa : (conversions > 0 ? spend / conversions : 0)

  return { spend, impressions, reach, frequency, cpm, cpc, ctr, linkClicks, conversions, cpa }
}

// ── Public functions ──────────────────────────────────────────────────────────

/**
 * Fetch aggregate account-level Meta Ads metrics for a date range.
 *
 * @param startDate - 'YYYY-MM-DD'
 * @param endDate   - 'YYYY-MM-DD'
 */
export async function fetchMetaAccountMetrics(
  startDate: string,
  endDate: string,
): Promise<MetaAccountMetricsRaw> {
  const accountId = adAccountId()

  const response = await graphFetch<{ data: RawInsightRow[] }>(
    `/${accountId}/insights`,
    {
      fields: INSIGHT_FIELDS,
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      level: 'account',
      limit: '1',
    },
  )

  const row = response.data?.[0]
  if (!row) {
    // No spend in this period — return zeroed metrics rather than throwing
    return {
      spend: 0, impressions: 0, reach: 0, frequency: 0,
      cpm: 0, cpc: 0, ctr: 0, cpa: 0, linkClicks: 0, conversions: 0,
    }
  }

  return parseInsightRow(row)
}

/**
 * Fetch per-day account metrics across a date range in a single API call —
 * used by the backfill script so history doesn't require one round-trip per day.
 * Uses Meta's time_increment=1 to get one insights row per day.
 *
 * @returns map of 'YYYY-MM-DD' → that day's account-level metrics
 */
export async function fetchMetaAccountMetricsByDay(
  startDate: string,
  endDate: string,
): Promise<Record<string, MetaAccountMetricsRaw>> {
  const accountId = adAccountId()

  const response = await graphFetch<{ data: Array<RawInsightRow & { date_start: string }> }>(
    `/${accountId}/insights`,
    {
      fields: INSIGHT_FIELDS,
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      time_increment: '1',
      level: 'account',
      limit: '500',
    },
  )

  const result: Record<string, MetaAccountMetricsRaw> = {}
  for (const row of response.data ?? []) {
    result[row.date_start] = parseInsightRow(row)
  }
  return result
}

/**
 * Fetch per-campaign breakdown for the Channel Dashboard tab.
 *
 * @param startDate - 'YYYY-MM-DD'
 * @param endDate   - 'YYYY-MM-DD'
 */
export async function fetchMetaCampaignMetrics(
  startDate: string,
  endDate: string,
): Promise<MetaCampaignMetricsRaw[]> {
  const accountId = adAccountId()

  const response = await graphFetch<{
    data: Array<RawInsightRow & { campaign_id: string; campaign_name: string; campaign: { status: string } }>
  }>(
    `/${accountId}/insights`,
    {
      fields: `${INSIGHT_FIELDS},campaign_id,campaign_name`,
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      level: 'campaign',
      limit: '50',
    },
  )

  return (response.data ?? []).map(row => ({
    ...parseInsightRow(row),
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    status: row.campaign?.status ?? 'UNKNOWN',
  }))
}

/**
 * Fetch monthly account metrics for sparkline data (last N months).
 * Returns one MetaAccountMetricsRaw per month, oldest first.
 */
export async function fetchMetaMonthlyMetrics(
  months: Array<{ startDate: string; endDate: string }>,
): Promise<MetaAccountMetricsRaw[]> {
  return Promise.all(
    months.map(({ startDate, endDate }) => fetchMetaAccountMetrics(startDate, endDate)),
  )
}
