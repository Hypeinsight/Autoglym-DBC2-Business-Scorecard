import { useState, useEffect, useCallback } from 'react'
import type { TabId, PeriodView, ScorecardSection, Metric } from '@/types'
import type { ScorecardResponse } from '../server/src/types/api.js'
import { fetchScorecard } from '@/lib/apiClient'
import { ScorecardTab } from '@/components/scorecard/ScorecardTab'
import { CommentaryTab } from '@/components/commentary/CommentaryTab'
import { ChannelDashboardTab } from '@/components/dashboard/ChannelDashboardTab'

const TABS: { id: TabId; label: string }[] = [
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'commentary', label: 'Commentary' },
  { id: 'dashboard', label: 'Channel Dashboard' },
]

const PERIOD_OPTIONS: { label: string; value: PeriodView }[] = [
  { label: 'Rolling 12 Months', value: 'Rolling 12 Months' },
  { label: 'Rolling 6 Months', value: 'Rolling 6 Months' },
  { label: 'Rolling 3 Months', value: 'Rolling 3 Months' },
]

/** Generates the last `count` completed months (excluding the current, still-in-progress month) as 'YYYY-MM' options, newest first. */
function generateAsAtOptions(count: number): { label: string; value: string }[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('en-AU', { month: 'short', year: 'numeric' })
    return { label, value }
  })
}

const AS_AT_OPTIONS = generateAsAtOptions(12)

/** Autoglym logo in the app header - hides itself if the file isn't present (falls back to the text wordmark next to it). */
function AutoglymLogo() {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <img src="/logos/autoglym.webp" alt="Autoglym" className="h-8 w-auto object-contain" onError={() => setFailed(true)} />
}

// A3 landscape printable area at 96 CSS px/inch, minus the 10mm @page
// margin on each side set in index.css (A3 = 420mm x 297mm).
const MM_TO_PX = 96 / 25.4
const A3_PRINTABLE_HEIGHT_PX = (297 - 20) * MM_TO_PX
const A3_PRINTABLE_WIDTH_PX = (420 - 20) * MM_TO_PX

/** Measures the rendered scorecard and shrinks it (via CSS vars read by
 *  index.css) to fit on one A3 page, however it actually renders - avoids
 *  hardcoding a scale that only works for one browser/font combination.
 *  Runs synchronously right before window.print().
 *
 *  Scale is UNIFORM (one ratio for both axes) so nothing gets distorted or
 *  clipped - an earlier independent X/Y version stretched cards past the
 *  printable width and cut off their right edges. Whichever axis has the
 *  looser fit is centered within the page rather than left/top-aligned, so
 *  the leftover space (if any) is evenly split as margin instead of being
 *  dumped entirely on one side.
 *
 *  Two-element shrink-to-fit (see index.css for the full explanation):
 *  .print-page is measured at its NATURAL size and only gets a visual
 *  transform: scale() (which never clips content); .print-page-outer is
 *  resized down to that scaled size so it's what actually reserves layout
 *  space when the browser paginates for print. */
function scaleToFitA3() {
  const page = document.querySelector<HTMLElement>('.print-page')
  const outer = document.querySelector<HTMLElement>('.print-page-outer')
  if (!page || !outer) return
  const root = document.documentElement.style
  root.removeProperty('--print-scale')
  root.removeProperty('--print-page-width')
  root.removeProperty('--print-page-outer-width')
  root.removeProperty('--print-page-outer-height')
  // Force the wide-screen 4-column grid BEFORE measuring, so a narrow
  // browser window doesn't get measured at its (possibly 2-column) on-screen
  // layout and then print that instead - see .print-forced-layout in index.css.
  document.body.classList.add('print-forced-layout')
  const { width, height } = page.getBoundingClientRect()
  const scale = Math.min(A3_PRINTABLE_WIDTH_PX / width, A3_PRINTABLE_HEIGHT_PX / height, 1)
  root.setProperty('--print-scale', String(scale))
  root.setProperty('--print-page-width', `${width}px`)
  root.setProperty('--print-page-outer-width', `${A3_PRINTABLE_WIDTH_PX}px`)
  root.setProperty('--print-page-outer-height', `${A3_PRINTABLE_HEIGHT_PX}px`)
}

const SCORECARD_FACE_SECTION_IDS = new Set(['media', 'engagement'])

const SECTION_COLORS: Record<string, ScorecardSection['color']> = {
  media: 'red',
  engagement: 'blue',
  edm: 'green',
  commercial: 'orange',
}

function toSections(resp: ScorecardResponse, sectionIds: Set<string> | null): ScorecardSection[] {
  return resp.sections
    .filter((s) => sectionIds === null || sectionIds.has(s.id))
    .map((s) => ({
      id: s.id,
      label: s.label,
      color: SECTION_COLORS[s.id] ?? 'ink',
      metrics: s.metrics as unknown as Metric[],
    }))
}

/** BSC scorecard face - only Media Volume & Engagement, per brief. */
function toScorecardSections(resp: ScorecardResponse): ScorecardSection[] {
  return toSections(resp, SCORECARD_FACE_SECTION_IDS)
}

/** Everything NOT on the scorecard face - channel-level drill-down detail. */
function toChannelSections(resp: ScorecardResponse): ScorecardSection[] {
  const channelIds = new Set(resp.sections.map((s) => s.id).filter((id) => !SCORECARD_FACE_SECTION_IDS.has(id)))
  return toSections(resp, channelIds)
}

type LoadState = 'loading' | 'live' | 'mixed' | 'sample' | 'error'

export default function App() {
  const [tab, setTab] = useState<TabId>('scorecard')
  const [periodView, setPeriodView] = useState<PeriodView>('Rolling 3 Months')
  const [asAt, setAsAt] = useState(AS_AT_OPTIONS[0].value)

  const [sections, setSections] = useState<ScorecardSection[]>([])
  const [channelSections, setChannelSections] = useState<ScorecardSection[]>([])
  const [reportingEnd, setReportingEnd] = useState('')
  const [generatedAt, setGeneratedAt] = useState('')
  const [sparklineMonths, setSparklineMonths] = useState<string[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const load = useCallback(async (month: string) => {
    setLoadState('loading')
    setErrorMsg('')
    try {
      const resp = await fetchScorecard(month)
      setSections(toScorecardSections(resp))
      setChannelSections(toChannelSections(resp))
      setReportingEnd(resp.reportingPeriodEnd)
      setGeneratedAt(resp.generatedAt)
      setSparklineMonths(resp.sparklineMonths)
      setLoadState(resp.dataSourceStatus)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setLoadState('error')
    }
  }, [])

  // Re-fetches without dropping to the loading screen - used after a manual
  // metric edit, where only that one card's numbers changed and the rest of
  // the page shouldn't flicker/unmount.
  const refresh = useCallback(async (month: string) => {
    try {
      const resp = await fetchScorecard(month)
      setSections(toScorecardSections(resp))
      setChannelSections(toChannelSections(resp))
      setReportingEnd(resp.reportingPeriodEnd)
      setGeneratedAt(resp.generatedAt)
      setSparklineMonths(resp.sparklineMonths)
      setLoadState(resp.dataSourceStatus)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [])

  useEffect(() => {
    void load(asAt)
  }, [load, asAt])

  useEffect(() => {
    const resetScale = () => {
      const root = document.documentElement.style
      root.removeProperty('--print-scale')
      root.removeProperty('--print-page-width')
      root.removeProperty('--print-page-outer-width')
      root.removeProperty('--print-page-outer-height')
      document.body.classList.remove('print-forced-layout')
    }
    window.addEventListener('afterprint', resetScale)
    return () => window.removeEventListener('afterprint', resetScale)
  }, [])

  const periodIndex = { 'Rolling 3 Months': 0, 'Rolling 6 Months': 1, 'Rolling 12 Months': 2 } as const

  return (
    <>
      {/* APP HEADER */}
      <header className="no-print sticky top-0 z-[100] flex items-center justify-between border-b border-white/[0.06] bg-gradient-to-b from-[#0a0a4d] to-ink px-8 py-3.5 text-white shadow-[0_1px_0_rgba(234,25,46,0.4)]">
        <div className="flex items-center gap-3">
          <AutoglymLogo />
          <div className="font-display text-[1.05rem] font-bold tracking-[0.02em]">
            Autoglym <span className="text-brand">DBC2</span>
            <span className="ml-2 font-sans text-[0.78rem] font-normal text-white/50">Business Scorecard</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-[0.75rem] font-medium text-white/50">Period</label>
            <select
              value={periodView}
              onChange={(e) => setPeriodView(e.target.value as PeriodView)}
              className="rounded-md border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[0.8rem] font-medium text-white outline-none transition-colors hover:bg-white/[0.12] focus:border-brand"
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-ink text-white">{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[0.75rem] font-medium text-white/50">As at</label>
            <select
              value={asAt}
              onChange={(e) => setAsAt(e.target.value)}
              className="rounded-md border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[0.8rem] font-medium text-white outline-none transition-colors hover:bg-white/[0.12] focus:border-brand"
            >
              {AS_AT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-ink text-white">{o.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              scaleToFitA3()
              window.print()
            }}
            className="rounded-md bg-brand px-4 py-1.5 text-[0.8rem] font-semibold text-white shadow-[0_2px_8px_rgba(234,25,46,0.35)] transition-all duration-200 hover:-translate-y-px hover:bg-brand-dark hover:shadow-[0_4px_14px_rgba(234,25,46,0.45)] active:translate-y-0"
          >
            Export A3
          </button>
        </div>
      </header>

      {/* TAB BAR */}
      <nav className="no-print mx-auto flex max-w-page border-b border-line bg-card px-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative -mb-px border-b-2 px-5 py-3.5 font-display text-[0.78rem] font-bold uppercase tracking-[0.05em] transition-colors duration-200 ${
              tab === t.id ? 'border-brand bg-brand/[0.03] text-ink' : 'border-transparent text-muted hover:bg-ink/[0.02] hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* LOAD STATE BANNERS */}
      {loadState === 'loading' && (
        <div className="no-print mx-auto mt-6 max-w-page rounded-xl border border-line bg-card p-8 text-center text-[0.88rem] text-muted shadow-page">
          Loading scorecard data…
        </div>
      )}
      {loadState === 'error' && (
        <div className="no-print mx-auto mt-6 max-w-page rounded-xl border border-down/25 bg-down/5 p-6 shadow-page">
          <div className="font-display font-bold text-down">Failed to load scorecard</div>
          <div className="mt-1 text-[0.85rem] text-ink/70">{errorMsg}</div>
          <button
            onClick={() => void load(asAt)}
            className="mt-3 rounded-md bg-brand px-4 py-1.5 text-[0.82rem] font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            Retry
          </button>
        </div>
      )}

      {/* PANELS - only render once data is available */}
      {loadState !== 'loading' && loadState !== 'error' && (
        <>
          {tab === 'scorecard' && (
            <ScorecardTab
              sections={sections}
              periodView={periodView}
              periodViewIndex={periodIndex[periodView]}
              reportingEnd={reportingEnd}
              generatedAt={generatedAt}
              asAtMonth={asAt}
              onManualSave={() => void refresh(asAt)}
              sparklineMonths={sparklineMonths}
            />
          )}
          {tab === 'commentary' && <CommentaryTab asAtMonth={asAt} />}
          {tab === 'dashboard' && (
            <ChannelDashboardTab
              channelSections={channelSections}
              periodViewIndex={periodIndex[periodView]}
              asAtMonth={asAt}
              onManualSave={() => void refresh(asAt)}
              sparklineMonths={sparklineMonths}
            />
          )}
        </>
      )}

      {/* API STATUS BADGE - reflects the real per-source mix from the API (dataSourceStatus), not just "always live" */}
      <div
        className={`no-print fixed bottom-6 right-6 z-[200] rounded-full px-3.5 py-1.5 font-display text-[0.7rem] font-bold uppercase tracking-[0.05em] text-white shadow-badge ${
          loadState === 'live' ? 'bg-up' : loadState === 'error' ? 'bg-down' : 'bg-neutral'
        }`}
      >
        {loadState === 'loading' && 'Loading…'}
        {loadState === 'live' && 'Live API Data'}
        {loadState === 'mixed' && 'Sample + API Data'}
        {loadState === 'sample' && 'Sample Data'}
        {loadState === 'error' && 'API Error'}
      </div>
    </>
  )
}
