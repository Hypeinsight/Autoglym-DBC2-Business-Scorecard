/**
 * Frontend API client — calls the Node.js backend at /api.
 * Vite proxies /api → http://localhost:3001 in dev (see vite.config.ts).
 * In production, set VITE_API_BASE_URL to the deployed server URL.
 */
import type { ScorecardResponse, HealthResponse } from '../../server/src/types/api.js'

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `API error ${res.status}`)
  }

  return res.json() as Promise<T>
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const respBody = await res.json().catch(() => ({}))
    throw new Error((respBody as { error?: string }).error ?? `API error ${res.status}`)
  }

  return res.json() as Promise<T>
}

/**
 * Fetch the full scorecard data for a given reporting month.
 * @param month - 'YYYY-MM' (optional, defaults to current month on the server)
 */
export async function fetchScorecard(month?: string): Promise<ScorecardResponse> {
  return apiFetch<ScorecardResponse>('/scorecard', month ? { month } : undefined)
}

export async function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health')
}

/**
 * Save a manually-typed figure (e.g. Press Office Impressions) for one
 * metric in one calendar month.
 */
export async function saveManualMetric(month: string, metricKey: string, value: number): Promise<void> {
  await apiPost('/manual-metrics', { month, metricKey, value })
}

/** Fetch this month's saved commentary edits (field key -> text), if any — falls back to seeded sample text for anything not overridden. */
export async function fetchCommentaryEdits(month: string): Promise<Record<string, string>> {
  const { edits } = await apiFetch<{ month: string; edits: Record<string, string> }>('/commentary', { month })
  return edits
}

/** Save an edited commentary text field (a highlight/lowlight/opportunity item or campaign bullet) for one month. */
export async function saveCommentaryText(month: string, fieldKey: string, value: string): Promise<void> {
  await apiPost('/commentary', { month, fieldKey, value })
}
