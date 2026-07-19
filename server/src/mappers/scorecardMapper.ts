/**
 * Transforms raw API data (GA4 + Google Ads + Klaviyo) into the
 * ScorecardResponse shape the frontend expects.
 *
 * Each section/metric mirrors the Phase 1 wireframe layout exactly.
 * Prior-period deltas drive the up/down/neutral trend indicators.
 */
import type { ScorecardMetric, ScorecardResponse, PeriodCell, SparklinePoint } from '../types/api.js'
import type { GA4MetricsRaw } from '../clients/ga4.js'
import type { GoogleAdsMetricsRaw } from '../clients/googleAds.js'
import type { KlaviyoMetricsRaw } from '../clients/klaviyo.js'
import type { MetaAccountMetricsRaw } from '../clients/meta.js'
import {
  fmtNumber, fmtCurrency, fmtPercent, fmtDuration,
  pctDelta, currencyDelta, ppDelta, toSparkline,
} from './formatters.js'

interface PeriodSlice {
  current: GA4MetricsRaw
  prior: GA4MetricsRaw
  ads: { current: GoogleAdsMetricsRaw; prior: GoogleAdsMetricsRaw }
  meta: { current: MetaAccountMetricsRaw; prior: MetaAccountMetricsRaw }
  edm: { current: KlaviyoMetricsRaw; prior: KlaviyoMetricsRaw }
}

export interface PeriodData {
  r3m: PeriodSlice
  r6m: PeriodSlice
  r12m: PeriodSlice
  monthlyGA4: GA4MetricsRaw[]            // last 9 months, oldest first (for sparklines)
  monthlyAds: GoogleAdsMetricsRaw[]      // last 9 months, oldest first
  monthlyMeta: MetaAccountMetricsRaw[]   // last 9 months, oldest first
  monthlyEdm: KlaviyoMetricsRaw[]        // last 9 months, oldest first
  /** Per-source, per-month: true if that month is real (DB/live) data, false if it's a sample fallback. */
  monthlyHasData: { ga4: boolean[]; ads: boolean[]; meta: boolean[]; edm: boolean[] }
  reportingMonth: string                 // 'YYYY-MM'
  /** 9 month labels (e.g. "Oct 2025"), oldest → newest - same window as every monthly* array above, computed once by the route. */
  sparklineMonths: string[]
  /** 'live' = every source is real DB/API data; 'sample' = every source fell back; 'mixed' = some of each (e.g. GA4 sample, everything else live). */
  dataSourceStatus: 'live' | 'mixed' | 'sample'
  /** Manually-entered figures - read from the manual_metrics table by the route, formatted here. */
  manual: {
    /** 3M/6M/12M sums for Press Office Impressions, or null if nothing entered for a period. */
    pressOfficeImpressions: { r3m: number | null; r6m: number | null; r12m: number | null }
    /** Last 9 months, oldest first - null where nothing was entered that month. */
    monthlyPressOfficeImpressions: Array<number | null>
  }
}

/** AND two per-month hasData arrays together - a blended sparkline (e.g. Ads + Meta) is only "real" for a month where BOTH sources have real data. */
function combineHasData(a: boolean[], b: boolean[]): boolean[] {
  return a.map((v, i) => v && (b[i] ?? false))
}

const NOW = new Date().toISOString()

export function buildScorecardResponse(data: PeriodData): ScorecardResponse {
  return {
    reportingPeriodEnd: data.reportingMonth,
    generatedAt: NOW,
    sparklineMonths: data.sparklineMonths,
    dataSourceStatus: data.dataSourceStatus,
    sections: [
      {
        id: 'media',
        label: 'Media Volume & Performance',
        metrics: buildMediaMetrics(data),
      },
      {
        id: 'engagement',
        label: 'Engagement & Lead Success',
        metrics: buildEngagementMetrics(data),
      },
      // Channel-level detail - NOT shown on the BSC scorecard face, only the
      // Channel Dashboard tab. Per brief: per-channel drill-down lives here.
      {
        id: 'channel-meta',
        label: `Meta Ads · ${formatMonthLabel(data.reportingMonth)}`,
        metrics: buildMetaChannelMetrics(data),
      },
      {
        id: 'channel-google-ads',
        label: `Google Ads · ${formatMonthLabel(data.reportingMonth)}`,
        metrics: buildGoogleAdsChannelMetrics(data),
      },
      {
        id: 'channel-ga4',
        label: `GA4 Website · ${formatMonthLabel(data.reportingMonth)}`,
        metrics: buildGA4ChannelMetrics(data),
      },
      {
        id: 'channel-klaviyo',
        label: `Klaviyo EDM · ${formatMonthLabel(data.reportingMonth)}`,
        metrics: buildKlaviyoChannelMetrics(data),
      },
      {
        id: 'channel-organic-social',
        label: `Organic Social · ${formatMonthLabel(data.reportingMonth)}`,
        metrics: buildOrganicSocialChannelMetrics(data),
      },
    ],
  }
}

/** 'YYYY-MM' → 'May 2026' */
function formatMonthLabel(reportingMonth: string): string {
  const [year, month] = reportingMonth.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' })
}

// ── Section 1: Media Volume & Performance ───────────────────────────────────

function buildMediaMetrics(data: PeriodData): ScorecardMetric[] {
  const {
    r3m, r6m, r12m, monthlyAds, monthlyMeta, monthlyHasData,
  } = data
  const adsMetaHasData = combineHasData(monthlyHasData.ads, monthlyHasData.meta)
  const adsMetaGa4HasData = combineHasData(adsMetaHasData, monthlyHasData.ga4)

  // ── Blended totals: Google Ads + Meta ───────────────────────────────────────
  // Total impressions (paid) - Google Ads + Meta combined
  const imp3  = r3m.ads.current.impressions  + r3m.meta.current.impressions
  const imp3p = r3m.ads.prior.impressions    + r3m.meta.prior.impressions
  const imp6  = r6m.ads.current.impressions  + r6m.meta.current.impressions
  const imp12 = r12m.ads.current.impressions + r12m.meta.current.impressions
  const impDelta = pctDelta(imp3, imp3p)

  // Total link clicks (all paid) - Google Ads clicks + Meta link clicks
  const clk3  = r3m.ads.current.clicks  + r3m.meta.current.linkClicks
  const clk3p = r3m.ads.prior.clicks    + r3m.meta.prior.linkClicks
  const clk6  = r6m.ads.current.clicks  + r6m.meta.current.linkClicks
  const clk12 = r12m.ads.current.clicks + r12m.meta.current.linkClicks
  const clkDelta = pctDelta(clk3, clk3p)

  // Weighted average CPM (spend-weighted blend of Google Ads + Meta)
  const spend3Ads = r3m.ads.current.spend; const spend3Meta = r3m.meta.current.spend
  const totalSpend3 = spend3Ads + spend3Meta || 1
  const cpm3  = (r3m.ads.current.cpm  * spend3Ads + r3m.meta.current.cpm  * spend3Meta) / totalSpend3
  const cpm3p = ((r3m.ads.prior.cpm   * r3m.ads.prior.spend)   + (r3m.meta.prior.cpm   * r3m.meta.prior.spend))   / ((r3m.ads.prior.spend + r3m.meta.prior.spend) || 1)
  const cpm6  = ((r6m.ads.current.cpm * r6m.ads.current.spend) + (r6m.meta.current.cpm * r6m.meta.current.spend)) / ((r6m.ads.current.spend + r6m.meta.current.spend) || 1)
  const cpm12 = ((r12m.ads.current.cpm * r12m.ads.current.spend) + (r12m.meta.current.cpm * r12m.meta.current.spend)) / ((r12m.ads.current.spend + r12m.meta.current.spend) || 1)
  const cpmDelta = currencyDelta(cpm3, cpm3p, true)

  // Weighted average CPC (blended)
  const cpc3  = clk3  > 0 ? totalSpend3 / clk3  : 0
  const cpc3p = (r3m.ads.prior.spend + r3m.meta.prior.spend) / (clk3p || 1)
  const cpc6  = (r6m.ads.current.spend + r6m.meta.current.spend) / ((r6m.ads.current.clicks + r6m.meta.current.linkClicks) || 1)
  const cpc12 = (r12m.ads.current.spend + r12m.meta.current.spend) / ((r12m.ads.current.clicks + r12m.meta.current.linkClicks) || 1)
  const cpcDelta = currencyDelta(cpc3, cpc3p, true)

  // Weighted average CTR (blended - impression-weighted)
  const ctr3  = imp3  > 0 ? clk3  / imp3  : 0
  const ctr3p = imp3p > 0 ? clk3p / imp3p : 0
  const ctr6  = imp6  > 0 ? (r6m.ads.current.clicks + r6m.meta.current.linkClicks)   / imp6  : 0
  const ctr12 = imp12 > 0 ? (r12m.ads.current.clicks + r12m.meta.current.linkClicks) / imp12 : 0
  const ctrDelta = ppDelta(ctr3, ctr3p, false)

  // Conversions (retailer clicks via paid - from GA4 GTM events)
  const conv3  = r3m.current.retailerButtonClicks
  const conv3p = r3m.prior.retailerButtonClicks
  const conv6  = r6m.current.retailerButtonClicks
  const conv12 = r12m.current.retailerButtonClicks
  const convDelta = pctDelta(conv3, conv3p)

  // Blended CPA (total paid spend / retailer button clicks)
  const cpa3  = conv3  > 0 ? totalSpend3 / conv3  : 0
  const cpa3p = conv3p > 0 ? (r3m.ads.prior.spend + r3m.meta.prior.spend) / conv3p : 0
  const cpa6  = conv6  > 0 ? (r6m.ads.current.spend + r6m.meta.current.spend) / conv6  : 0
  const cpa12 = conv12 > 0 ? (r12m.ads.current.spend + r12m.meta.current.spend) / conv12 : 0
  const cpaDelta = currencyDelta(cpa3, cpa3p, true)

  const impressionsSpark = toSparkline(
    monthlyAds.map((m, i) => m.impressions + (monthlyMeta[i]?.impressions ?? 0)), adsMetaHasData,
    fmtNumber,
  )
  const clicksSpark = toSparkline(
    monthlyAds.map((m, i) => m.clicks + (monthlyMeta[i]?.linkClicks ?? 0)), adsMetaHasData,
    fmtNumber,
  )
  const cpmSpark = toSparkline(
    monthlyMeta.map(m => m.cpm), monthlyHasData.meta,
    fmtCurrency,
  )
  const cpcSpark = toSparkline(
    monthlyAds.map(m => m.cpc), monthlyHasData.ads,
    fmtCurrency,
  )
  const ctrSpark = toSparkline(
    monthlyAds.map(m => m.ctr * 100), monthlyHasData.ads,
    (n) => fmtPercent(n / 100),
  )
  const conversionsSpark = toSparkline(
    data.monthlyGA4.map(m => m.retailerButtonClicks), monthlyHasData.ga4,
    fmtNumber,
  )
  const cpaSpark = toSparkline(
    monthlyAds.map((m, i) => {
      const metaSpend = monthlyMeta[i]?.spend ?? 0
      const totalConv = data.monthlyGA4[i]?.retailerButtonClicks ?? 1
      return totalConv > 0 ? (m.spend + metaSpend) / totalConv : 0
    }), adsMetaGa4HasData,
    fmtCurrency,
  )

  return [
    metric('impressions', 'Total Impressions (Paid + Organic)', fmtNumber(imp3), 'impr.', impDelta.direction, `${impDelta.delta} vs prior year`,
      impressionsSpark, [
        periodCell('3M', fmtNumber(imp3), pctDelta(imp3, imp3p)),
        periodCell('6M', fmtNumber(imp6), pctDelta(imp6, r6m.ads.prior.impressions + r6m.meta.prior.impressions)),
        periodCell('12M', fmtNumber(imp12), pctDelta(imp12, r12m.ads.prior.impressions + r12m.meta.prior.impressions)),
      ], 'Google Ads + Meta', undefined),

    metric('clicks', 'Total Link Clicks (All Paid)', fmtNumber(clk3), 'clicks', clkDelta.direction, `${clkDelta.delta} vs prior year`,
      clicksSpark, [
        periodCell('3M', fmtNumber(clk3), pctDelta(clk3, clk3p)),
        periodCell('6M', fmtNumber(clk6), pctDelta(clk6, r6m.ads.prior.clicks + r6m.meta.prior.linkClicks)),
        periodCell('12M', fmtNumber(clk12), pctDelta(clk12, r12m.ads.prior.clicks + r12m.meta.prior.linkClicks)),
      ], 'Google Ads + Meta', undefined),

    metric('cpm', 'CPM (Weighted Avg.)', fmtCurrency(cpm3), 'AUD', cpmDelta.direction, `${cpmDelta.delta} vs prior year`,
      cpmSpark, [
        periodCell('3M', fmtCurrency(cpm3), currencyDelta(cpm3, cpm3p, true)),
        periodCell('6M', fmtCurrency(cpm6), currencyDelta(cpm6, cpm3p, true)),
        periodCell('12M', fmtCurrency(cpm12), currencyDelta(cpm12, cpm3p, true)),
      ], 'Google Ads', undefined),

    metric('cpc', 'CPLC / CPC (Weighted Avg.)', fmtCurrency(cpc3), 'AUD', cpcDelta.direction, `${cpcDelta.delta} vs prior year`,
      cpcSpark, [
        periodCell('3M', fmtCurrency(cpc3), currencyDelta(cpc3, cpc3p, true)),
        periodCell('6M', fmtCurrency(cpc6), currencyDelta(cpc6, r6m.ads.prior.cpc, true)),
        periodCell('12M', fmtCurrency(cpc12), currencyDelta(cpc12, r12m.ads.prior.cpc, true)),
      ], 'Google Ads', undefined),

    metric('ctr', 'LCTR / CTR (Weighted Avg.)', fmtPercent(ctr3), '%', ctrDelta.direction, `${ctrDelta.delta} vs prior year`,
      ctrSpark, [
        periodCell('3M', fmtPercent(ctr3), ppDelta(ctr3, ctr3p)),
        periodCell('6M', fmtPercent(ctr6), ppDelta(ctr6, r6m.ads.prior.ctr)),
        periodCell('12M', fmtPercent(ctr12), ppDelta(ctr12, r12m.ads.prior.ctr)),
      ], 'Google Ads', undefined),

    metric('conversions', 'Total Conversions (Retailer Clicks via Paid)', fmtNumber(conv3), 'conv.', convDelta.direction, `${convDelta.delta} vs prior year`,
      conversionsSpark, [
        periodCell('3M', fmtNumber(conv3), pctDelta(conv3, conv3p)),
        periodCell('6M', fmtNumber(conv6), pctDelta(conv6, r6m.prior.retailerButtonClicks)),
        periodCell('12M', fmtNumber(conv12), pctDelta(conv12, r12m.prior.retailerButtonClicks)),
      ], 'GA4 + GTM', undefined),

    metric('cpa', 'CPA (Cost Per Conversion)', fmtCurrency(cpa3), 'AUD', cpaDelta.direction, `${cpaDelta.delta} vs prior year`,
      cpaSpark, [
        periodCell('3M', fmtCurrency(cpa3), currencyDelta(cpa3, cpa3p, true)),
        periodCell('6M', fmtCurrency(cpa6), currencyDelta(cpa6, cpa3p, true)),
        periodCell('12M', fmtCurrency(cpa12), currencyDelta(cpa12, cpa3p, true)),
      ], 'Google Ads + Meta + GA4', undefined),

    {
      id: 'press',
      name: 'Press Office Impressions (Manual)',
      primary: data.manual.monthlyPressOfficeImpressions.at(-1) != null ? fmtNumber(data.manual.monthlyPressOfficeImpressions.at(-1)!) : '-',
      unit: 'placements',
      trend: 'neutral',
      trendLabel: '',
      trendVsLabel: '',
      sparkline: toSparkline(data.manual.monthlyPressOfficeImpressions.map((v) => v ?? 0), data.manual.monthlyPressOfficeImpressions.map((v) => v !== null), fmtNumber),
      periods: [
        { label: '3M', value: data.manual.pressOfficeImpressions.r3m !== null ? fmtNumber(data.manual.pressOfficeImpressions.r3m) : '-', delta: '-', deltaDirection: 'neutral', manualMetricKey: 'press_office_impressions_3m' },
        { label: '6M', value: data.manual.pressOfficeImpressions.r6m !== null ? fmtNumber(data.manual.pressOfficeImpressions.r6m) : '-', delta: '-', deltaDirection: 'neutral', manualMetricKey: 'press_office_impressions_6m' },
        { label: '12M', value: data.manual.pressOfficeImpressions.r12m !== null ? fmtNumber(data.manual.pressOfficeImpressions.r12m) : '-', delta: '-', deltaDirection: 'neutral', manualMetricKey: 'press_office_impressions_12m' },
      ],
      source: 'Manual input',
      lastUpdated: NOW,
      customPeriods: true,
      manualInput: true,
      manualMetricKey: 'press_office_impressions',
    },
  ]
}

// ── Channel Dashboard: Meta Ads detail (not on BSC face) ────────────────────

function buildMetaChannelMetrics(data: PeriodData): ScorecardMetric[] {
  const { r3m, r6m, r12m, monthlyMeta, monthlyHasData, reportingMonth } = data

  // The reporting month is the last COMPLETED month (see lastNCalendarMonths /
  // getRollingDateRanges - the 3M window's end date is the reporting month).
  // "Previous month" for the vs-prior-month label is the one before that.
  const priorYearLabel = 'prior year'

  const spend3  = r3m.meta.current.spend;  const spend3p = r3m.meta.prior.spend
  const spend6  = r6m.meta.current.spend;  const spend12 = r12m.meta.current.spend

  const reach3  = r3m.meta.current.reach;  const reach3p = r3m.meta.prior.reach
  const reach6  = r6m.meta.current.reach;  const reach12 = r12m.meta.current.reach

  const freq3   = r3m.meta.current.frequency
  const freq3p  = r3m.meta.prior.frequency
  const freqDelta = freq3 - freq3p

  const cpa3  = r3m.meta.current.cpa;  const cpa3p = r3m.meta.prior.cpa
  const cpa6  = r6m.meta.current.cpa;  const cpa12 = r12m.meta.current.cpa

  const spendSpark = toSparkline(monthlyMeta.map(m => m.spend), monthlyHasData.meta, fmtCurrency)
  const reachSpark = toSparkline(monthlyMeta.map(m => m.reach), monthlyHasData.meta, fmtNumber)
  const freqSpark = toSparkline(monthlyMeta.map(m => m.frequency), monthlyHasData.meta, (n) => n.toFixed(1))
  const cpaSpark = toSparkline(monthlyMeta.map(m => m.cpa), monthlyHasData.meta, fmtCurrency)

  return [
    metric('meta-spend', 'Meta Spend', fmtCurrency(spend3), 'AUD', pctDelta(spend3, spend3p).direction, `${pctDelta(spend3, spend3p).delta} vs ${priorYearLabel}`,
      spendSpark, [
        periodCell('3M', fmtCurrency(spend3), pctDelta(spend3, spend3p)),
        periodCell('6M', fmtCurrency(spend6), pctDelta(spend6, r6m.meta.prior.spend)),
        periodCell('12M', fmtCurrency(spend12), pctDelta(spend12, r12m.meta.prior.spend)),
      ], 'Meta Ads', undefined),

    metric('meta-reach', 'Meta Reach', fmtNumber(reach3), 'people', pctDelta(reach3, reach3p).direction, `${pctDelta(reach3, reach3p).delta} vs ${priorYearLabel}`,
      reachSpark, [
        periodCell('3M', fmtNumber(reach3), pctDelta(reach3, reach3p)),
        periodCell('6M', fmtNumber(reach6), pctDelta(reach6, r6m.meta.prior.reach)),
        periodCell('12M', fmtNumber(reach12), pctDelta(reach12, r12m.meta.prior.reach)),
      ], 'Meta Ads', undefined),

    metric('meta-freq', 'Meta Frequency', freq3.toFixed(1), 'avg', freqDelta > 0 ? 'down' : freqDelta < 0 ? 'up' : 'neutral', `${freqDelta >= 0 ? '+' : ''}${freqDelta.toFixed(1)} vs ${priorYearLabel}`,
      freqSpark, [
        periodCell('3M', freq3.toFixed(1), { delta: freq3 > 3 ? 'High' : freq3 > 2.5 ? 'Watch' : 'Healthy', direction: freq3 > 3 ? 'down' : freq3 > 2.5 ? 'neutral' : 'up' }),
        periodCell('6M', r6m.meta.current.frequency.toFixed(1), { delta: '-', direction: 'neutral' }),
        periodCell('12M', r12m.meta.current.frequency.toFixed(1), { delta: '-', direction: 'neutral' }),
      ], 'Meta Ads', undefined),

    metric('meta-cpa', 'Meta CPA', fmtCurrency(cpa3), 'AUD', currencyDelta(cpa3, cpa3p, true).direction, `${currencyDelta(cpa3, cpa3p, true).delta} vs ${priorYearLabel}`,
      cpaSpark, [
        periodCell('3M', fmtCurrency(cpa3), currencyDelta(cpa3, cpa3p, true)),
        periodCell('6M', fmtCurrency(cpa6), currencyDelta(cpa6, r6m.meta.prior.cpa, true)),
        periodCell('12M', fmtCurrency(cpa12), currencyDelta(cpa12, r12m.meta.prior.cpa, true)),
      ], 'Meta Ads', undefined),
  ]
}

// ── Channel Dashboard: Google Ads detail (not on BSC face) ──────────────────

function buildGoogleAdsChannelMetrics(data: PeriodData): ScorecardMetric[] {
  const { r3m, r6m, r12m, monthlyAds, monthlyHasData, reportingMonth } = data
  const priorYearLabel = 'prior year'

  const spend3  = r3m.ads.current.spend;  const spend3p = r3m.ads.prior.spend
  const spend6  = r6m.ads.current.spend;  const spend12 = r12m.ads.current.spend

  const imp3  = r3m.ads.current.impressions;  const imp3p = r3m.ads.prior.impressions
  const imp6  = r6m.ads.current.impressions;  const imp12 = r12m.ads.current.impressions

  const clk3  = r3m.ads.current.clicks;  const clk3p = r3m.ads.prior.clicks
  const clk6  = r6m.ads.current.clicks;  const clk12 = r12m.ads.current.clicks

  const cpc3  = r3m.ads.current.cpc;  const cpc3p = r3m.ads.prior.cpc
  const cpc6  = r6m.ads.current.cpc;  const cpc12 = r12m.ads.current.cpc

  const spendSpark = toSparkline(monthlyAds.map(m => m.spend), monthlyHasData.ads, fmtCurrency)
  const impSpark = toSparkline(monthlyAds.map(m => m.impressions), monthlyHasData.ads, fmtNumber)
  const clkSpark = toSparkline(monthlyAds.map(m => m.clicks), monthlyHasData.ads, fmtNumber)
  const cpcSpark = toSparkline(monthlyAds.map(m => m.cpc), monthlyHasData.ads, fmtCurrency)

  return [
    metric('gads-spend', 'Google Ads Spend', fmtCurrency(spend3), 'AUD', pctDelta(spend3, spend3p).direction, `${pctDelta(spend3, spend3p).delta} vs ${priorYearLabel}`,
      spendSpark, [
        periodCell('3M', fmtCurrency(spend3), pctDelta(spend3, spend3p)),
        periodCell('6M', fmtCurrency(spend6), pctDelta(spend6, r6m.ads.prior.spend)),
        periodCell('12M', fmtCurrency(spend12), pctDelta(spend12, r12m.ads.prior.spend)),
      ], 'Google Ads', undefined),

    metric('gads-impressions', 'Google Ads Impressions', fmtNumber(imp3), 'impr.', pctDelta(imp3, imp3p).direction, `${pctDelta(imp3, imp3p).delta} vs ${priorYearLabel}`,
      impSpark, [
        periodCell('3M', fmtNumber(imp3), pctDelta(imp3, imp3p)),
        periodCell('6M', fmtNumber(imp6), pctDelta(imp6, r6m.ads.prior.impressions)),
        periodCell('12M', fmtNumber(imp12), pctDelta(imp12, r12m.ads.prior.impressions)),
      ], 'Google Ads', undefined),

    metric('gads-clicks', 'Google Ads Clicks', fmtNumber(clk3), 'clicks', pctDelta(clk3, clk3p).direction, `${pctDelta(clk3, clk3p).delta} vs ${priorYearLabel}`,
      clkSpark, [
        periodCell('3M', fmtNumber(clk3), pctDelta(clk3, clk3p)),
        periodCell('6M', fmtNumber(clk6), pctDelta(clk6, r6m.ads.prior.clicks)),
        periodCell('12M', fmtNumber(clk12), pctDelta(clk12, r12m.ads.prior.clicks)),
      ], 'Google Ads', undefined),

    metric('gads-cpc', 'Google Ads CPC', fmtCurrency(cpc3), 'AUD', currencyDelta(cpc3, cpc3p, true).direction, `${currencyDelta(cpc3, cpc3p, true).delta} vs ${priorYearLabel}`,
      cpcSpark, [
        periodCell('3M', fmtCurrency(cpc3), currencyDelta(cpc3, cpc3p, true)),
        periodCell('6M', fmtCurrency(cpc6), currencyDelta(cpc6, r6m.ads.prior.cpc, true)),
        periodCell('12M', fmtCurrency(cpc12), currencyDelta(cpc12, r12m.ads.prior.cpc, true)),
      ], 'Google Ads', undefined),
  ]
}

// ── Channel Dashboard: GA4 Website detail (not on BSC face) ─────────────────

function buildGA4ChannelMetrics(data: PeriodData): ScorecardMetric[] {
  const { r3m, r6m, r12m, monthlyGA4, monthlyHasData, reportingMonth } = data
  const priorYearLabel = 'prior year'

  const sessions3  = r3m.current.sessions;  const sessions3p = r3m.prior.sessions
  const sessions6  = r6m.current.sessions;  const sessions12 = r12m.current.sessions

  const pv3  = r3m.current.screenPageViews;  const pv3p = r3m.prior.screenPageViews
  const pv6  = r6m.current.screenPageViews;  const pv12 = r12m.current.screenPageViews

  const dur3 = r3m.current.averageSessionDuration; const dur3p = r3m.prior.averageSessionDuration
  const dur6 = r6m.current.averageSessionDuration; const dur12 = r12m.current.averageSessionDuration

  const br3  = r3m.current.bounceRate;  const br3p = r3m.prior.bounceRate
  const br6  = r6m.current.bounceRate;  const br12 = r12m.current.bounceRate

  const sessionsSpark = toSparkline(monthlyGA4.map(m => m.sessions), monthlyHasData.ga4, fmtNumber)
  const pvSpark = toSparkline(monthlyGA4.map(m => m.screenPageViews), monthlyHasData.ga4, fmtNumber)
  const durSpark = toSparkline(monthlyGA4.map(m => m.averageSessionDuration), monthlyHasData.ga4, fmtDuration)
  const brSpark = toSparkline(monthlyGA4.map(m => m.bounceRate * 100), monthlyHasData.ga4, (n) => fmtPercent(n / 100))

  return [
    metric('ga4-sessions', 'GA4 Sessions', fmtNumber(sessions3), 'sessions', pctDelta(sessions3, sessions3p).direction, `${pctDelta(sessions3, sessions3p).delta} vs ${priorYearLabel}`,
      sessionsSpark, [
        periodCell('3M', fmtNumber(sessions3), pctDelta(sessions3, sessions3p)),
        periodCell('6M', fmtNumber(sessions6), pctDelta(sessions6, r6m.prior.sessions)),
        periodCell('12M', fmtNumber(sessions12), pctDelta(sessions12, r12m.prior.sessions)),
      ], 'GA4', undefined),

    metric('ga4-pageviews', 'GA4 Page Views', fmtNumber(pv3), 'views', pctDelta(pv3, pv3p).direction, `${pctDelta(pv3, pv3p).delta} vs ${priorYearLabel}`,
      pvSpark, [
        periodCell('3M', fmtNumber(pv3), pctDelta(pv3, pv3p)),
        periodCell('6M', fmtNumber(pv6), pctDelta(pv6, r6m.prior.screenPageViews)),
        periodCell('12M', fmtNumber(pv12), pctDelta(pv12, r12m.prior.screenPageViews)),
      ], 'GA4', undefined),

    metric('ga4-duration', 'GA4 Avg. Session Duration', fmtDuration(dur3), 'min', ppDelta(dur3, dur3p).direction, `${ppDelta(dur3, dur3p).delta} vs ${priorYearLabel}`,
      durSpark, [
        periodCell('3M', fmtDuration(dur3), ppDelta(dur3, dur3p)),
        periodCell('6M', fmtDuration(dur6), ppDelta(dur6, r6m.prior.averageSessionDuration)),
        periodCell('12M', fmtDuration(dur12), ppDelta(dur12, r12m.prior.averageSessionDuration)),
      ], 'GA4', undefined),

    metric('ga4-bounce', 'GA4 Bounce Rate', fmtPercent(br3), '%', ppDelta(br3, br3p, true).direction, `${ppDelta(br3, br3p, true).delta} vs ${priorYearLabel}`,
      brSpark, [
        periodCell('3M', fmtPercent(br3), ppDelta(br3, br3p, true)),
        periodCell('6M', fmtPercent(br6), ppDelta(br6, r6m.prior.bounceRate, true)),
        periodCell('12M', fmtPercent(br12), ppDelta(br12, r12m.prior.bounceRate, true)),
      ], 'GA4', undefined),
  ]
}

// ── Channel Dashboard: Klaviyo EDM detail (not on BSC face) ─────────────────

function buildKlaviyoChannelMetrics(data: PeriodData): ScorecardMetric[] {
  const { r3m, r6m, r12m, monthlyEdm, monthlyHasData, reportingMonth } = data
  const priorYearLabel = 'prior year'

  const open3  = r3m.edm.current.openRate;  const open3p = r3m.edm.prior.openRate
  const open6  = r6m.edm.current.openRate;  const open12 = r12m.edm.current.openRate

  const ctr3  = r3m.edm.current.ctr;  const ctr3p = r3m.edm.prior.ctr
  const ctr6  = r6m.edm.current.ctr;  const ctr12 = r12m.edm.current.ctr

  const sends3  = r3m.edm.current.totalSends;  const sends3p = r3m.edm.prior.totalSends
  const sends6  = r6m.edm.current.totalSends;  const sends12 = r12m.edm.current.totalSends

  const listSize = r3m.edm.current.listSize

  const openSpark = toSparkline(monthlyEdm.map(m => m.openRate * 100), monthlyHasData.edm, (n) => fmtPercent(n / 100))
  const ctrSpark = toSparkline(monthlyEdm.map(m => m.ctr * 100), monthlyHasData.edm, (n) => fmtPercent(n / 100))
  const sendsSpark = toSparkline(monthlyEdm.map(m => m.totalSends), monthlyHasData.edm, fmtNumber)
  const listSizeSpark = toSparkline(monthlyEdm.map(m => m.listSize), monthlyHasData.edm, fmtNumber)

  return [
    metric('klaviyo-open', 'Klaviyo Open Rate', fmtPercent(open3), '%', ppDelta(open3, open3p).direction, `${ppDelta(open3, open3p).delta} vs ${priorYearLabel}`,
      openSpark, [
        periodCell('3M', fmtPercent(open3), ppDelta(open3, open3p)),
        periodCell('6M', fmtPercent(open6), ppDelta(open6, r6m.edm.prior.openRate)),
        periodCell('12M', fmtPercent(open12), ppDelta(open12, r12m.edm.prior.openRate)),
      ], 'Klaviyo', undefined),

    metric('klaviyo-ctr', 'Klaviyo CTR', fmtPercent(ctr3), '%', ppDelta(ctr3, ctr3p).direction, `${ppDelta(ctr3, ctr3p).delta} vs ${priorYearLabel}`,
      ctrSpark, [
        periodCell('3M', fmtPercent(ctr3), ppDelta(ctr3, ctr3p)),
        periodCell('6M', fmtPercent(ctr6), ppDelta(ctr6, r6m.edm.prior.ctr)),
        periodCell('12M', fmtPercent(ctr12), ppDelta(ctr12, r12m.edm.prior.ctr)),
      ], 'Klaviyo', undefined),

    metric('klaviyo-sends', 'Klaviyo Total Sends', fmtNumber(sends3), 'sends', pctDelta(sends3, sends3p).direction, `${pctDelta(sends3, sends3p).delta} vs ${priorYearLabel}`,
      sendsSpark, [
        periodCell('3M', fmtNumber(sends3), pctDelta(sends3, sends3p)),
        periodCell('6M', fmtNumber(sends6), pctDelta(sends6, r6m.edm.prior.totalSends)),
        periodCell('12M', fmtNumber(sends12), pctDelta(sends12, r12m.edm.prior.totalSends)),
      ], 'Klaviyo', undefined),

    {
      id: 'klaviyo-list-size',
      name: 'Klaviyo List Size',
      primary: fmtNumber(listSize),
      unit: 'subscribers',
      trend: 'neutral',
      trendLabel: 'Current list size (point-in-time)',
      trendVsLabel: 'Current list size (point-in-time)',
      sparkline: listSizeSpark,
      periods: [
        periodCell('3M', fmtNumber(r3m.edm.current.listSize), { delta: '-', direction: 'neutral' }),
        periodCell('6M', fmtNumber(r6m.edm.current.listSize), { delta: '-', direction: 'neutral' }),
        periodCell('12M', fmtNumber(r12m.edm.current.listSize), { delta: '-', direction: 'neutral' }),
      ],
      source: 'Klaviyo',
      lastUpdated: NOW,
    },
  ]
}

// ── Channel Dashboard: Organic Social detail (not on BSC face) ──────────────
//
// Sample data only - Iconosquare/Meta organic insights isn't wired in yet
// (see metaOrganic.ts, which has a working Instagram client not yet
// connected to this route). Numbers here are illustrative but internally
// consistent with the "Social Engagements (Organic)" BSC-face card and its
// own 3M/6M/12M progression, not independently made up.

// Same wobble shape used in sampleData.ts's monthlySeries - a straight ramp
// draws as a flat line, so these fixed (not random) multipliers give each
// series a believable up-and-down curve while the last month still lands
// exactly on the real headline value. 12 entries to match the 12-month
// sample window (3/6/12-month period views all slice from it).
const SOCIAL_WOBBLE = [1, 1.015, 0.985, 1.03, 0.99, 1.02, 1.005, 0.99, 1.015, 0.985, 1.005, 1]

function wobbleSeries(start: number, end: number): number[] {
  return SOCIAL_WOBBLE.map((w, i) => {
    const t = i / (SOCIAL_WOBBLE.length - 1)
    return (start + (end - start) * t) * w
  }).map((v, i, arr) => (i === arr.length - 1 ? end : v)) // anchor the last point exactly
}

function buildOrganicSocialChannelMetrics(_data: PeriodData): ScorecardMetric[] {
  const engagements3 = 9840
  const reach3 = 62400
  const followers = 18240
  const followerGrowth3 = 640

  return [
    metric('social-engagements', 'Total Engagements', fmtNumber(engagements3), 'eng.', 'up', '+11.4% vs prior year',
      wobbleSeries(7200, 9840).map((v) => ({
        height: Math.max(4, Math.round((v / 9840) * 100)), raw: v, displayValue: fmtNumber(v),
      })), [
        periodCell('3M', fmtNumber(9840), { delta: '+11.4%', direction: 'up' }),
        periodCell('6M', fmtNumber(18760), { delta: '+9.8%', direction: 'up' }),
        periodCell('12M', fmtNumber(34920), { delta: '+14.2%', direction: 'up' }),
      ], 'Sample data'),

    metric('social-reach', 'Organic Reach', fmtNumber(reach3), 'people', 'up', '+8.7% vs prior year',
      wobbleSeries(46800, 62400).map((v) => ({
        height: Math.max(4, Math.round((v / 62400) * 100)), raw: v, displayValue: fmtNumber(v),
      })), [
        periodCell('3M', fmtNumber(62400), { delta: '+8.7%', direction: 'up' }),
        periodCell('6M', fmtNumber(118800), { delta: '+6.9%', direction: 'up' }),
        periodCell('12M', fmtNumber(224400), { delta: '+12.1%', direction: 'up' }),
      ], 'Sample data'),

    metric('social-engagement-rate', 'Engagement Rate', fmtPercent(engagements3 / reach3), '%', 'up', '+0.6pp vs prior year',
      wobbleSeries(0.154, 0.158).map((v) => ({
        height: Math.max(4, Math.round((v / 0.158) * 100)), raw: v * 100, displayValue: fmtPercent(v),
      })), [
        periodCell('3M', fmtPercent(engagements3 / reach3), { delta: '+0.6pp', direction: 'up' }),
        periodCell('6M', fmtPercent(0.158), { delta: '+0.4pp', direction: 'up' }),
        periodCell('12M', fmtPercent(0.156), { delta: '+0.9pp', direction: 'up' }),
      ], 'Sample data'),

    metric('social-followers', 'Follower Growth', `+${fmtNumber(followerGrowth3)}`, 'followers', 'up', `${fmtNumber(followers)} total followers`,
      wobbleSeries(17100, 18240).map((v) => ({
        height: Math.max(4, Math.round((v / 18240) * 100)), raw: v, displayValue: fmtNumber(v),
      })), [
        periodCell('3M', `+${fmtNumber(640)}`, { delta: '3M net', direction: 'up' }),
        periodCell('6M', `+${fmtNumber(1180)}`, { delta: '6M net', direction: 'up' }),
        periodCell('12M', `+${fmtNumber(2340)}`, { delta: '12M net', direction: 'up' }),
      ], 'Sample data'),
  ]
}

// ── Section 2: Engagement & Lead Success ────────────────────────────────────

function buildEngagementMetrics(data: PeriodData): ScorecardMetric[] {
  const { r3m, r6m, r12m, monthlyGA4, monthlyEdm, monthlyHasData } = data

  const vis3 = r3m.current.sessions;     const vis3p = r3m.prior.sessions
  const vis6 = r6m.current.sessions;     const vis12 = r12m.current.sessions

  const br3 = r3m.current.bounceRate;    const br3p = r3m.prior.bounceRate
  const br6 = r6m.current.bounceRate;    const br12 = r12m.current.bounceRate

  const dur3 = r3m.current.averageSessionDuration; const dur3p = r3m.prior.averageSessionDuration
  const dur6 = r6m.current.averageSessionDuration; const dur12 = r12m.current.averageSessionDuration

  const er3 = r3m.current.engagementRate; const er3p = r3m.prior.engagementRate
  const er6 = r6m.current.engagementRate; const er12 = r12m.current.engagementRate

  const open3 = r3m.edm.current.openRate;  const open3p = r3m.edm.prior.openRate
  const open12 = r12m.edm.current.openRate
  const ctr3edm = r3m.edm.current.ctr

  const clkEdm3 = r3m.edm.current.totalClicks; const clkEdm3p = r3m.edm.prior.totalClicks
  const listSize = r3m.edm.current.listSize
  const listGrowth = r3m.edm.current.listGrowth

  const visitsSpark = toSparkline(monthlyGA4.map(m => m.sessions), monthlyHasData.ga4, fmtNumber)
  const bounceSpark = toSparkline(monthlyGA4.map(m => m.bounceRate * 100), monthlyHasData.ga4, (n) => fmtPercent(n / 100))
  const retentionSpark = toSparkline(monthlyGA4.map(m => m.averageSessionDuration), monthlyHasData.ga4, fmtDuration)
  const pageconvSpark = toSparkline(
    monthlyGA4.map(m => (m.retailerButtonClicks / Math.max(m.sessions, 1)) * 100), monthlyHasData.ga4,
    (n) => fmtPercent(n / 100),
  )
  const engrateSpark = toSparkline(monthlyGA4.map(m => m.engagementRate * 100), monthlyHasData.ga4, (n) => fmtPercent(n / 100))
  const edmOpenSpark = toSparkline(monthlyEdm.map(m => m.openRate * 100), monthlyHasData.edm, (n) => fmtPercent(n / 100))
  const edmClicksSpark = toSparkline(monthlyEdm.map(m => m.totalClicks), monthlyHasData.edm, fmtNumber)

  return [
    metric('visits', 'Website Topline Visits', fmtNumber(vis3), 'sessions', pctDelta(vis3, vis3p).direction, `${pctDelta(vis3, vis3p).delta} vs prior year`,
      visitsSpark, [
        periodCell('3M', fmtNumber(vis3), pctDelta(vis3, vis3p)),
        periodCell('6M', fmtNumber(vis6), pctDelta(vis6, r6m.prior.sessions)),
        periodCell('12M', fmtNumber(vis12), pctDelta(vis12, r12m.prior.sessions)),
      ], 'GA4', undefined),

    metric('bounce', 'Website Bounce Rate', fmtPercent(br3), '%', ppDelta(br3, br3p, true).direction, `${ppDelta(br3, br3p, true).delta} vs prior year`,
      bounceSpark, [
        periodCell('3M', fmtPercent(br3), ppDelta(br3, br3p, true)),
        periodCell('6M', fmtPercent(br6), ppDelta(br6, r6m.prior.bounceRate, true)),
        periodCell('12M', fmtPercent(br12), ppDelta(br12, r12m.prior.bounceRate, true)),
      ], 'GA4', undefined),

    metric('retention', 'Website Retention Time (Avg. Session)', fmtDuration(dur3), 'min', ppDelta(dur3, dur3p).direction, `${ppDelta(dur3, dur3p).delta} vs prior year`,
      retentionSpark, [
        periodCell('3M', fmtDuration(dur3), ppDelta(dur3, dur3p)),
        periodCell('6M', fmtDuration(dur6), ppDelta(dur6, r6m.prior.averageSessionDuration)),
        periodCell('12M', fmtDuration(dur12), ppDelta(dur12, r12m.prior.averageSessionDuration)),
      ], 'GA4', undefined),

    // Page conversion rate: retailer button clicks / sessions (GA4)
    {
      id: 'pageconv',
      name: 'Page Conversion Rate',
      primary: fmtPercent(r3m.current.retailerButtonClicks / Math.max(r3m.current.sessions, 1)),
      unit: '%',
      trend: pctDelta(r3m.current.retailerButtonClicks / Math.max(r3m.current.sessions, 1), r3m.prior.retailerButtonClicks / Math.max(r3m.prior.sessions, 1)).direction,
      trendLabel: `${pctDelta(r3m.current.retailerButtonClicks / Math.max(r3m.current.sessions, 1), r3m.prior.retailerButtonClicks / Math.max(r3m.prior.sessions, 1)).delta} vs prior year`,
      trendVsLabel: 'vs prior year',
      sparkline: pageconvSpark,
      periods: [
        periodCell('3M', fmtPercent(r3m.current.retailerButtonClicks / Math.max(r3m.current.sessions, 1)), pctDelta(r3m.current.retailerButtonClicks / Math.max(r3m.current.sessions, 1), r3m.prior.retailerButtonClicks / Math.max(r3m.prior.sessions, 1))),
        periodCell('6M', fmtPercent(r6m.current.retailerButtonClicks / Math.max(r6m.current.sessions, 1)), pctDelta(r6m.current.retailerButtonClicks / Math.max(r6m.current.sessions, 1), r6m.prior.retailerButtonClicks / Math.max(r6m.prior.sessions, 1))),
        periodCell('12M', fmtPercent(r12m.current.retailerButtonClicks / Math.max(r12m.current.sessions, 1)), pctDelta(r12m.current.retailerButtonClicks / Math.max(r12m.current.sessions, 1), r12m.prior.retailerButtonClicks / Math.max(r12m.prior.sessions, 1))),
      ],
      source: 'GA4',
      lastUpdated: NOW,
    },

    metric('engrate', 'Engagement Rate (Web)', fmtPercent(er3), '%', ppDelta(er3, er3p).direction, `${ppDelta(er3, er3p).delta} vs prior year`,
      engrateSpark, [
        periodCell('3M', fmtPercent(er3), ppDelta(er3, er3p)),
        periodCell('6M', fmtPercent(er6), ppDelta(er6, r6m.prior.engagementRate)),
        periodCell('12M', fmtPercent(er12), ppDelta(er12, r12m.prior.engagementRate)),
      ], 'GA4', undefined),

    // Social engagements - illustrative sample only until Iconosquare/Meta
    // organic insights is wired in (see metaOrganic.ts). Kept as a plain
    // constant sample, not derived from monthlyHasData, since it's not a
    // real fallback for a live source the way the other cards' samples are.
    {
      id: 'social',
      name: 'Social Engagements (Organic)',
      primary: fmtNumber(9840),
      unit: 'eng.',
      trend: 'up',
      trendLabel: '+11.4% vs prior year',
      trendVsLabel: 'vs prior year',
      sparkline: wobbleSeries(7200, 9840).map((v) => ({
        height: Math.max(4, Math.round((v / 9840) * 100)),
        raw: v,
        displayValue: fmtNumber(v),
      })),
      periods: [
        { label: '3M', value: fmtNumber(9840), delta: '+11.4%', deltaDirection: 'up' },
        { label: '6M', value: fmtNumber(18760), delta: '+9.8%', deltaDirection: 'up' },
        { label: '12M', value: fmtNumber(34920), delta: '+14.2%', deltaDirection: 'up' },
      ],
      source: 'Sample data',
      lastUpdated: NOW,
      customPeriods: true,
    },

    {
      id: 'edm-open',
      name: 'EDM Open Rate & CTR',
      primary: fmtPercent(open3),
      unit: '%',
      trend: ppDelta(open3, open3p).direction,
      trendLabel: `${ppDelta(open3, open3p).delta} open rate vs prior year`,
      trendVsLabel: 'open rate vs prior year',
      sparkline: edmOpenSpark,
      periods: [
        { label: '3M Open', value: fmtPercent(open3), delta: ppDelta(open3, open3p).delta, deltaDirection: ppDelta(open3, open3p).direction },
        { label: '3M CTR', value: fmtPercent(ctr3edm), delta: ppDelta(ctr3edm, r3m.edm.prior.ctr).delta, deltaDirection: ppDelta(ctr3edm, r3m.edm.prior.ctr).direction },
        { label: '12M Open', value: fmtPercent(open12), delta: ppDelta(open12, r12m.edm.prior.openRate).delta, deltaDirection: ppDelta(open12, r12m.edm.prior.openRate).direction },
      ],
      periodsByView: [
        [
          { label: '3M Opens', value: fmtNumber(r3m.edm.current.totalOpens), delta: pctDelta(r3m.edm.current.totalOpens, r3m.edm.prior.totalOpens).delta, deltaDirection: pctDelta(r3m.edm.current.totalOpens, r3m.edm.prior.totalOpens).direction },
          { label: '3M Open Rate', value: fmtPercent(r3m.edm.current.openRate), delta: ppDelta(r3m.edm.current.openRate, r3m.edm.prior.openRate).delta, deltaDirection: ppDelta(r3m.edm.current.openRate, r3m.edm.prior.openRate).direction },
          { label: '3M CTR', value: fmtPercent(r3m.edm.current.ctr), delta: ppDelta(r3m.edm.current.ctr, r3m.edm.prior.ctr).delta, deltaDirection: ppDelta(r3m.edm.current.ctr, r3m.edm.prior.ctr).direction },
        ],
        [
          { label: '6M Opens', value: fmtNumber(r6m.edm.current.totalOpens), delta: pctDelta(r6m.edm.current.totalOpens, r6m.edm.prior.totalOpens).delta, deltaDirection: pctDelta(r6m.edm.current.totalOpens, r6m.edm.prior.totalOpens).direction },
          { label: '6M Open Rate', value: fmtPercent(r6m.edm.current.openRate), delta: ppDelta(r6m.edm.current.openRate, r6m.edm.prior.openRate).delta, deltaDirection: ppDelta(r6m.edm.current.openRate, r6m.edm.prior.openRate).direction },
          { label: '6M CTR', value: fmtPercent(r6m.edm.current.ctr), delta: ppDelta(r6m.edm.current.ctr, r6m.edm.prior.ctr).delta, deltaDirection: ppDelta(r6m.edm.current.ctr, r6m.edm.prior.ctr).direction },
        ],
        [
          { label: '12M Opens', value: fmtNumber(r12m.edm.current.totalOpens), delta: pctDelta(r12m.edm.current.totalOpens, r12m.edm.prior.totalOpens).delta, deltaDirection: pctDelta(r12m.edm.current.totalOpens, r12m.edm.prior.totalOpens).direction },
          { label: '12M Open Rate', value: fmtPercent(r12m.edm.current.openRate), delta: ppDelta(r12m.edm.current.openRate, r12m.edm.prior.openRate).delta, deltaDirection: ppDelta(r12m.edm.current.openRate, r12m.edm.prior.openRate).direction },
          { label: '12M CTR', value: fmtPercent(r12m.edm.current.ctr), delta: ppDelta(r12m.edm.current.ctr, r12m.edm.prior.ctr).delta, deltaDirection: ppDelta(r12m.edm.current.ctr, r12m.edm.prior.ctr).direction },
        ],
      ],
      headlineIndex: 1,
      source: 'Klaviyo',
      lastUpdated: NOW,
    },

    {
      id: 'edm-clicks',
      name: 'EDM Total Clicks & List Growth Rate',
      primary: fmtNumber(clkEdm3),
      unit: 'clicks',
      trend: pctDelta(clkEdm3, clkEdm3p).direction,
      trendLabel: `${pctDelta(clkEdm3, clkEdm3p).delta} total clicks vs prior year`,
      trendVsLabel: 'total clicks vs prior year',
      sparkline: edmClicksSpark,
      periods: [
        { label: '3M Clicks', value: fmtNumber(clkEdm3), delta: pctDelta(clkEdm3, clkEdm3p).delta, deltaDirection: pctDelta(clkEdm3, clkEdm3p).direction },
        { label: 'List Size', value: fmtNumber(listSize), delta: pctDelta(listSize, listSize - listGrowth).delta, deltaDirection: pctDelta(listSize, listSize - listGrowth).direction },
        { label: 'Growth', value: `+${fmtNumber(listGrowth)}`, delta: '3M net', deltaDirection: 'up' },
      ],
      periodsByView: [
        [
          { label: '3M Clicks', value: fmtNumber(r3m.edm.current.totalClicks), delta: pctDelta(r3m.edm.current.totalClicks, r3m.edm.prior.totalClicks).delta, deltaDirection: pctDelta(r3m.edm.current.totalClicks, r3m.edm.prior.totalClicks).direction },
          { label: '3M List Size', value: fmtNumber(r3m.edm.current.listSize), delta: pctDelta(r3m.edm.current.listSize, r3m.edm.current.listSize - r3m.edm.current.listGrowth).delta, deltaDirection: pctDelta(r3m.edm.current.listSize, r3m.edm.current.listSize - r3m.edm.current.listGrowth).direction },
          { label: '3M Growth', value: `+${fmtNumber(r3m.edm.current.listGrowth)}`, delta: '3M net', deltaDirection: 'up' },
        ],
        [
          { label: '6M Clicks', value: fmtNumber(r6m.edm.current.totalClicks), delta: pctDelta(r6m.edm.current.totalClicks, r6m.edm.prior.totalClicks).delta, deltaDirection: pctDelta(r6m.edm.current.totalClicks, r6m.edm.prior.totalClicks).direction },
          { label: '6M List Size', value: fmtNumber(r6m.edm.current.listSize), delta: pctDelta(r6m.edm.current.listSize, r6m.edm.current.listSize - r6m.edm.current.listGrowth).delta, deltaDirection: pctDelta(r6m.edm.current.listSize, r6m.edm.current.listSize - r6m.edm.current.listGrowth).direction },
          { label: '6M Growth', value: `+${fmtNumber(r6m.edm.current.listGrowth)}`, delta: '6M net', deltaDirection: 'up' },
        ],
        [
          { label: '12M Clicks', value: fmtNumber(r12m.edm.current.totalClicks), delta: pctDelta(r12m.edm.current.totalClicks, r12m.edm.prior.totalClicks).delta, deltaDirection: pctDelta(r12m.edm.current.totalClicks, r12m.edm.prior.totalClicks).direction },
          { label: '12M List Size', value: fmtNumber(r12m.edm.current.listSize), delta: pctDelta(r12m.edm.current.listSize, r12m.edm.current.listSize - r12m.edm.current.listGrowth).delta, deltaDirection: pctDelta(r12m.edm.current.listSize, r12m.edm.current.listSize - r12m.edm.current.listGrowth).direction },
          { label: '12M Growth', value: `+${fmtNumber(r12m.edm.current.listGrowth)}`, delta: '12M net', deltaDirection: 'up' },
        ],
      ],
      source: 'Klaviyo',
      lastUpdated: NOW,
    },
  ]
}

// ── Local helpers ────────────────────────────────────────────────────────────

function metric(
  id: string,
  name: string,
  primary: string,
  unit: string,
  trend: import('../types/api.js').TrendDirection,
  trendLabel: string,
  sparkline: SparklinePoint[],
  periods: PeriodCell[],
  source: string,
  customPeriods?: boolean,
): ScorecardMetric {
  return { id, name, primary, unit, trend, trendLabel, trendVsLabel: extractVsLabel(trendLabel), sparkline, periods, source, lastUpdated: NOW, customPeriods }
}

/**
 * Every trendLabel in this file follows the pattern `${delta} <suffix>`,
 * where delta is a formatted number/percent starting with +, − (or exactly
 * "-" for no-prior-data). Strip the leading delta token to get the reusable
 * "vs X" suffix, so the frontend can rebuild the label with a different
 * period's delta when the period selector changes.
 */
function extractVsLabel(trendLabel: string): string {
  const spaceIndex = trendLabel.indexOf(' ')
  return spaceIndex === -1 ? trendLabel : trendLabel.slice(spaceIndex + 1)
}

function periodCell(
  label: string,
  value: string,
  delta: { delta: string; direction: import('../types/api.js').TrendDirection },
): PeriodCell {
  return { label, value, delta: delta.delta, deltaDirection: delta.direction }
}
