/**
 * One-off backfill script — pulls historical data for each configured API
 * and populates the daily_metrics table, so rolling 3M/6M/12M windows have
 * real history immediately instead of waiting ~12 months for the daily
 * scheduler to accumulate it naturally.
 *
 * Usage: tsx src/db/backfill.ts [--days=365] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
 * Defaults to the last 365 days ending yesterday.
 *
 * Each source is fetched with ONE API call covering the whole range
 * (day-segmented server-side), not one call per day — keeps this well
 * within rate limits regardless of how many days are being backfilled.
 */
import 'dotenv/config'
import { fetchGA4MetricsByDay, type GA4MetricsRaw } from '../clients/ga4.js'
import { fetchGoogleAdsMetricsByDay, type GoogleAdsMetricsRaw } from '../clients/googleAds.js'
import { fetchMetaAccountMetricsByDay, type MetaAccountMetricsRaw } from '../clients/meta.js'
import { fetchKlaviyoMetricsByDay, type KlaviyoMetricsRaw } from '../clients/klaviyo.js'
import { upsertDailyMetric, latestIngestedDate, type MetricSource } from './index.js'

function parseArgs(): { from: string; to: string } {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v]
    }),
  )

  const to = args.to ?? yesterday()
  const days = args.days ? Number(args.days) : 365
  const from = args.from ?? shiftDays(to, -(days - 1))

  return { from, to }
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function shiftDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function writeMetrics(date: string, source: MetricSource, values: Record<string, number>): void {
  for (const [key, value] of Object.entries(values)) {
    upsertDailyMetric(date, source, key, value)
  }
}

async function backfillGA4(from: string, to: string): Promise<number> {
  if (!process.env.GA4_KEY_FILE || !process.env.GA4_PROPERTY_ID) {
    console.log('[backfill] GA4 not configured, skipping')
    return 0
  }
  const byDay: Record<string, GA4MetricsRaw> = await fetchGA4MetricsByDay(from, to)
  for (const [date, m] of Object.entries(byDay)) {
    writeMetrics(date, 'ga4', {
      sessions: m.sessions,
      engagedSessions: m.engagedSessions,
      bounceRate: m.bounceRate,
      averageSessionDuration: m.averageSessionDuration,
      screenPageViews: m.screenPageViews,
      retailerButtonClicks: m.retailerButtonClicks,
      engagementRate: m.engagementRate,
    })
  }
  console.log(`[backfill] GA4 — ${Object.keys(byDay).length} days written`)
  return Object.keys(byDay).length
}

async function backfillGoogleAds(from: string, to: string): Promise<number> {
  const configured =
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  if (!configured) {
    console.log('[backfill] Google Ads not configured, skipping')
    return 0
  }
  const byDay: Record<string, GoogleAdsMetricsRaw> = await fetchGoogleAdsMetricsByDay(from, to)
  for (const [date, m] of Object.entries(byDay)) {
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
  }
  console.log(`[backfill] Google Ads — ${Object.keys(byDay).length} days written`)
  return Object.keys(byDay).length
}

async function backfillMeta(from: string, to: string): Promise<number> {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
    console.log('[backfill] Meta not configured, skipping')
    return 0
  }
  const byDay: Record<string, MetaAccountMetricsRaw> = await fetchMetaAccountMetricsByDay(from, to)
  for (const [date, m] of Object.entries(byDay)) {
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
  }
  console.log(`[backfill] Meta — ${Object.keys(byDay).length} days written`)
  return Object.keys(byDay).length
}

async function backfillKlaviyo(from: string, to: string): Promise<number> {
  if (!process.env.KLAVIYO_API_KEY || !process.env.KLAVIYO_LIST_ID) {
    console.log('[backfill] Klaviyo not configured, skipping')
    return 0
  }
  const byDay: Record<string, KlaviyoMetricsRaw> = await fetchKlaviyoMetricsByDay(from, to)
  for (const [date, m] of Object.entries(byDay)) {
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
  }
  console.log(`[backfill] Klaviyo — ${Object.keys(byDay).length} days written (only days with sends)`)
  return Object.keys(byDay).length
}

async function main(): Promise<void> {
  const { from, to } = parseArgs()
  console.log(`[backfill] Backfilling ${from} → ${to} — one API call per source, not per day`)

  const sources: Array<[string, () => Promise<number>]> = [
    ['GA4', () => backfillGA4(from, to)],
    ['Google Ads', () => backfillGoogleAds(from, to)],
    ['Meta', () => backfillMeta(from, to)],
    ['Klaviyo', () => backfillKlaviyo(from, to)],
  ]

  for (const [label, job] of sources) {
    try {
      await job()
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.error(`[backfill] ${label} failed — ${reason}`)
    }
  }

  console.log(`[backfill] Complete. Latest ingested date in DB: ${latestIngestedDate()}`)
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err)
  process.exit(1)
})
