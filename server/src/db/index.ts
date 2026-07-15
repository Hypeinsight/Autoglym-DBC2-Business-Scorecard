/**
 * SQLite database for daily metric snapshots.
 *
 * One row per (date, source, metric) — populated once a day by the ingestion
 * job in src/db/ingest.ts. The scorecard route sums/aggregates over this
 * table for rolling 3M/6M/12M windows instead of calling live APIs on every
 * page load.
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '../../data')
const DB_PATH = path.join(DATA_DIR, 'scorecard.db')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

export const db: Database.Database = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    source TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    value REAL NOT NULL,
    fetched_at TEXT NOT NULL,
    UNIQUE(date, source, metric_key)
  );

  CREATE INDEX IF NOT EXISTS idx_daily_metrics_lookup
    ON daily_metrics (source, metric_key, date);

  -- Manually entered figures (e.g. Press Office Impressions) — one value per
  -- (metric, calendar month), typed in directly on the scorecard card rather
  -- than pulled from an API.
  CREATE TABLE IF NOT EXISTS manual_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    value REAL NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(month, metric_key)
  );

  -- Editable free-text commentary (highlight/lowlight/opportunity blocks,
  -- campaign bullets) — one row per (month, field key), edited directly on
  -- the Commentary tab. Falls back to the seeded sample text in
  -- src/data/commentary.ts when no row exists for a given key/month yet.
  CREATE TABLE IF NOT EXISTS commentary_text (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    field_key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(month, field_key)
  );
`)

export type MetricSource = 'ga4' | 'google_ads' | 'meta' | 'klaviyo'

/** Upsert a single day's value for one (source, metric) pair. */
export function upsertDailyMetric(
  date: string,
  source: MetricSource,
  metricKey: string,
  value: number,
): void {
  db.prepare(`
    INSERT INTO daily_metrics (date, source, metric_key, value, fetched_at)
    VALUES (@date, @source, @metricKey, @value, @fetchedAt)
    ON CONFLICT(date, source, metric_key)
    DO UPDATE SET value = @value, fetched_at = @fetchedAt
  `).run({
    date,
    source,
    metricKey,
    value,
    fetchedAt: new Date().toISOString(),
  })
}

/** Sum a metric across a date range (inclusive) — used for spend, impressions, clicks, etc. */
export function sumMetric(source: MetricSource, metricKey: string, startDate: string, endDate: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(value), 0) AS total
    FROM daily_metrics
    WHERE source = ? AND metric_key = ? AND date BETWEEN ? AND ?
  `).get(source, metricKey, startDate, endDate) as { total: number }
  return row.total
}

/** Average a metric across a date range (inclusive) — used for rates like CTR, bounce rate, frequency. */
export function avgMetric(source: MetricSource, metricKey: string, startDate: string, endDate: string): number {
  const row = db.prepare(`
    SELECT COALESCE(AVG(value), 0) AS avg
    FROM daily_metrics
    WHERE source = ? AND metric_key = ? AND date BETWEEN ? AND ?
  `).get(source, metricKey, startDate, endDate) as { avg: number }
  return row.avg
}

/** Last known value of a metric on or before a given date — used for point-in-time values like list size. */
export function latestMetric(source: MetricSource, metricKey: string, onOrBeforeDate: string): number {
  const row = db.prepare(`
    SELECT value
    FROM daily_metrics
    WHERE source = ? AND metric_key = ? AND date <= ?
    ORDER BY date DESC
    LIMIT 1
  `).get(source, metricKey, onOrBeforeDate) as { value: number } | undefined
  return row?.value ?? 0
}

/** Whether we have ANY ingested data for a source — used to decide DB-backed vs live-fetch fallback. */
export function hasIngestedData(source: MetricSource): boolean {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM daily_metrics WHERE source = ?`).get(source) as { count: number }
  return row.count > 0
}

/**
 * Whether we have at least one row of data for a source within a specific
 * date range. A source can have SOME history (e.g. Meta going back a year)
 * but no rows for an older window before the backfill's start date — this
 * catches that case so the caller can fall back to a live API call or
 * sample data for just that window, instead of silently returning zeros.
 */
export function hasIngestedDataForRange(source: MetricSource, startDate: string, endDate: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) AS count FROM daily_metrics
    WHERE source = ? AND date BETWEEN ? AND ?
  `).get(source, startDate, endDate) as { count: number }
  return row.count > 0
}

/** Most recent date we have data for, across all sources — used to detect a stale/stopped ingestion job. */
export function latestIngestedDate(): string | null {
  const row = db.prepare(`SELECT MAX(date) AS maxDate FROM daily_metrics`).get() as { maxDate: string | null }
  return row.maxDate
}

/** Upsert a manually-typed value for one metric in one calendar month. */
export function upsertManualMetric(month: string, metricKey: string, value: number): void {
  db.prepare(`
    INSERT INTO manual_metrics (month, metric_key, value, updated_at)
    VALUES (@month, @metricKey, @value, @updatedAt)
    ON CONFLICT(month, metric_key)
    DO UPDATE SET value = @value, updated_at = @updatedAt
  `).run({ month, metricKey, value, updatedAt: new Date().toISOString() })
}

/** Single month's manually-entered value, or null if never entered. */
export function getManualMetric(month: string, metricKey: string): number | null {
  const row = db.prepare(`
    SELECT value FROM manual_metrics WHERE month = ? AND metric_key = ?
  `).get(month, metricKey) as { value: number } | undefined
  return row?.value ?? null
}

/** All entered months for a metric, oldest first — used to build sparklines from manual data. */
export function getManualMetricSeries(metricKey: string, months: string[]): Array<number | null> {
  const rows = db.prepare(`
    SELECT month, value FROM manual_metrics WHERE metric_key = ? AND month IN (${months.map(() => '?').join(',')})
  `).all(metricKey, ...months) as Array<{ month: string; value: number }>
  const byMonth = new Map(rows.map((r) => [r.month, r.value]))
  return months.map((m) => byMonth.get(m) ?? null)
}

/** Upsert a manually-edited commentary text field (a highlight/lowlight/opportunity item or campaign bullet) for one month. */
export function upsertCommentaryText(month: string, fieldKey: string, value: string): void {
  db.prepare(`
    INSERT INTO commentary_text (month, field_key, value, updated_at)
    VALUES (@month, @fieldKey, @value, @updatedAt)
    ON CONFLICT(month, field_key)
    DO UPDATE SET value = @value, updated_at = @updatedAt
  `).run({ month, fieldKey, value, updatedAt: new Date().toISOString() })
}

/** All edited commentary text fields for a given month — keyed by field_key, for the route to overlay on top of the seeded sample text. */
export function getCommentaryTextForMonth(month: string): Record<string, string> {
  const rows = db.prepare(`
    SELECT field_key, value FROM commentary_text WHERE month = ?
  `).all(month) as Array<{ field_key: string; value: string }>
  return Object.fromEntries(rows.map((r) => [r.field_key, r.value]))
}
