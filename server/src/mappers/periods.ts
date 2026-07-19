/**
 * Rolling period date range helpers.
 *
 * The scorecard always shows 3M / 6M / 12M rolling windows ending
 * at the selected "As At" month (last day of that month).
 *
 * All dates are returned as 'YYYY-MM-DD' strings for use with
 * the GA4, Google Ads, and Klaviyo API clients.
 *
 * Date arithmetic here is done on plain (year, month, day) integers, NOT via
 * JS `Date` objects - `new Date('YYYY-MM-DD')` parses as UTC midnight while
 * `new Date(y, m, d)` constructs in local time, and converting between them
 * with `toISOString()` silently shifts the date by a day in timezones behind
 * UTC. Working entirely in integers sidesteps that class of bug.
 */

export interface DateRange {
  startDate: string
  endDate: string
}

/**
 * Given a reporting month (e.g. '2026-05'), return the date ranges
 * for the 3M, 6M, and 12M rolling windows ending at the last day
 * of that month.
 */
export function getRollingDateRanges(reportingMonth: string): {
  r3m: DateRange
  r6m: DateRange
  r12m: DateRange
} {
  const [year, month] = reportingMonth.split('-').map(Number)

  // Last day of the reporting month
  const endDate = lastDayOfMonth(year, month)

  return {
    r3m: { startDate: shiftMonths(year, month, -2, 'first'), endDate },
    r6m: { startDate: shiftMonths(year, month, -5, 'first'), endDate },
    r12m: { startDate: shiftMonths(year, month, -11, 'first'), endDate },
  }
}

/**
 * Returns the "prior period" range used to calculate the delta shown on
 * each metric card - the SAME window shifted back 12 months (year-on-year),
 * not the immediately preceding sequential period.
 *
 * e.g. current 3M = Mar–May 2026 → prior = Mar–May 2025, NOT Dec 2025–Feb 2026.
 * This mirrors the current period's exact start/end dates one year earlier,
 * so seasonal comparisons are apples-to-apples. This was called out
 * explicitly in the project brief as a hard requirement - a prior board
 * pack submission used sequential quarter-on-quarter by mistake and was
 * flagged as an error.
 *
 * @param range - the current period range (3M/6M/12M)
 */
export function getPriorPeriodRange(range: DateRange): DateRange {
  return {
    startDate: shiftDateYears(range.startDate, -1),
    endDate: shiftDateYears(range.endDate, -1),
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  // month is 1-indexed; day 0 of the next month = last day of this month
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function lastDayOfMonth(year: number, month: number): string {
  return fmt(year, month, daysInMonth(year, month))
}

function firstDayOfMonth(year: number, month: number): string {
  return fmt(year, month, 1)
}

/** Shift (year, month) by `n` months, returning the first or last day of the resulting month. */
function shiftMonths(year: number, month: number, n: number, edge: 'first' | 'last'): string {
  const totalMonths = (year * 12 + (month - 1)) + n
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonth = (totalMonths % 12) + 1

  return edge === 'first' ? firstDayOfMonth(targetYear, targetMonth) : lastDayOfMonth(targetYear, targetMonth)
}

/** Shift a 'YYYY-MM-DD' date by `n` years, preserving month/day (Feb 29 → Feb 28 on non-leap years). */
function shiftDateYears(dateStr: string, n: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const targetYear = year + n
  const clampedDay = Math.min(day, daysInMonth(targetYear, month))
  return fmt(targetYear, month, clampedDay)
}

function fmt(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
