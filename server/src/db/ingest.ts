/**
 * Daily ingestion job — pulls yesterday's numbers from each configured API
 * and writes them into the daily_metrics table.
 *
 * Runs once per day (see src/db/scheduler.ts). Each source is independent —
 * if one API fails or isn't configured, the others still ingest normally.
 */
import { fetchGA4Metrics, type GA4MetricsRaw } from '../clients/ga4.js'
import { fetchGoogleAdsMetrics, type GoogleAdsMetricsRaw } from '../clients/googleAds.js'
import { fetchMetaAccountMetrics, type MetaAccountMetricsRaw } from '../clients/meta.js'
import { fetchKlaviyoMetrics, type KlaviyoMetricsRaw } from '../clients/klaviyo.js'
import { upsertDailyMetric, type MetricSource } from './index.js'

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function writeMetrics(date: string, source: MetricSource, values: Record<string, number>): void {
  for (const [key, value] of Object.entries(values)) {
    upsertDailyMetric(date, source, key, value)
  }
}

async function ingestGA4(date: string): Promise<void> {
  if (!process.env.GA4_KEY_FILE || !process.env.GA4_PROPERTY_ID) {
    console.log('[ingest] GA4 not configured, skipping')
    return
  }
  const m: GA4MetricsRaw = await fetchGA4Metrics(date, date)
  writeMetrics(date, 'ga4', {
    sessions: m.sessions,
    engagedSessions: m.engagedSessions,
    bounceRate: m.bounceRate,
    averageSessionDuration: m.averageSessionDuration,
    screenPageViews: m.screenPageViews,
    retailerButtonClicks: m.retailerButtonClicks,
    engagementRate: m.engagementRate,
  })
  console.log(`[ingest] GA4 OK for ${date}`)
}

async function ingestGoogleAds(date: string): Promise<void> {
  const configured =
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  if (!configured) {
    console.log('[ingest] Google Ads not configured, skipping')
    return
  }
  const m: GoogleAdsMetricsRaw = await fetchGoogleAdsMetrics(date, date)
  writeMetrics(date, 'google_ads', {
    spend: m.spend,
    impressions: m.impressions,
    clicks: m.clicks,
    conversions: m.conversions,
    ctr: m.ctr,
    cpc: m.cpc,
    cpm: m.cpm,
    cpa: m.cpa,
  })
  console.log(`[ingest] Google Ads OK for ${date}`)
}

async function ingestMeta(date: string): Promise<void> {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
    console.log('[ingest] Meta not configured, skipping')
    return
  }
  const m: MetaAccountMetricsRaw = await fetchMetaAccountMetrics(date, date)
  writeMetrics(date, 'meta', {
    spend: m.spend,
    impressions: m.impressions,
    reach: m.reach,
    frequency: m.frequency,
    cpm: m.cpm,
    cpc: m.cpc,
    ctr: m.ctr,
    cpa: m.cpa,
    linkClicks: m.linkClicks,
    conversions: m.conversions,
  })
  console.log(`[ingest] Meta OK for ${date}`)
}

async function ingestKlaviyo(date: string): Promise<void> {
  if (!process.env.KLAVIYO_API_KEY || !process.env.KLAVIYO_LIST_ID) {
    console.log('[ingest] Klaviyo not configured, skipping')
    return
  }
  const m: KlaviyoMetricsRaw = await fetchKlaviyoMetrics(date, date)
  writeMetrics(date, 'klaviyo', {
    totalSends: m.totalSends,
    totalOpens: m.totalOpens,
    openRate: m.openRate,
    totalClicks: m.totalClicks,
    ctr: m.ctr,
    totalUnsubscribes: m.totalUnsubscribes,
    unsubscribeRate: m.unsubscribeRate,
    listSize: m.listSize,
    listGrowth: m.listGrowth,
  })
  console.log(`[ingest] Klaviyo OK for ${date}`)
}

/**
 * Ingest all sources for a given date (defaults to yesterday).
 * Each source is isolated — a failure in one does not block the others.
 */
export async function runDailyIngestion(date: string = yesterday()): Promise<void> {
  console.log(`[ingest] Starting daily ingestion for ${date}`)

  const jobs: Array<[string, () => Promise<void>]> = [
    ['GA4', () => ingestGA4(date)],
    ['Google Ads', () => ingestGoogleAds(date)],
    ['Meta', () => ingestMeta(date)],
    ['Klaviyo', () => ingestKlaviyo(date)],
  ]

  for (const [label, job] of jobs) {
    try {
      await job()
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.error(`[ingest] ${label} failed for ${date} — ${reason}`)
    }
  }

  console.log(`[ingest] Daily ingestion complete for ${date}`)
}
