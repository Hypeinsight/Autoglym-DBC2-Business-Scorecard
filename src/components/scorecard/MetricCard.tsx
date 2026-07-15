import { useState } from 'react'
import type { Metric, TrendDirection } from '@/types'
import { Sparkline } from '@/components/shared/Sparkline'
import { saveManualMetric } from '@/lib/apiClient'
import { useCountUp } from '@/hooks/useCountUp'

// Left-rail accent (not a full-width top bar) — a quieter way to encode
// trend state that reads as enterprise dashboard rather than wireframe.
// before:text-{color} makes currentColor resolve correctly for the
// hover glow (before:shadow-[...currentColor]) further down.
const railAccent: Record<TrendDirection, string> = {
  up: 'before:bg-up before:text-up',
  down: 'before:bg-down before:text-down',
  neutral: 'before:bg-neutral before:text-neutral',
}

const trendText: Record<TrendDirection, string> = {
  up: 'text-up',
  down: 'text-down',
  neutral: 'text-neutral',
}

const trendArrow: Record<TrendDirection, string> = {
  up: '▲',
  down: '▼',
  neutral: '—',
}

const deltaPill: Record<TrendDirection, string> = {
  up: 'bg-up/10 text-up',
  down: 'bg-down/10 text-down',
  neutral: 'bg-neutral/10 text-neutral',
}

// periodViewIndex 0/1/2 -> 3/6/12 months — how many trailing months the
// sparkline shows, matching the 3M/6M/12M Period View selector.
const MONTHS_BY_PERIOD_INDEX = [3, 6, 12] as const

interface Props {
  metric: Metric
  /** 0 = 3M, 1 = 6M, 2 = 12M — which period column drives the headline value/trend. Defaults to 0 (3M). */
  periodViewIndex?: number
  /** Currently selected "As At" month ('YYYY-MM') — required for manualInput cards so edits save against the right month. */
  asAtMonth?: string
  /** Called after a manual value is saved, so the parent can refetch the scorecard and show the update everywhere it appears. */
  onManualSave?: () => void
  /** 12 month labels (oldest → newest) matching metric.sparkline — passed to Sparkline for hover tooltips. */
  sparklineMonths?: string[]
  /** Position within the grid — staggers this card's load-in animation so the whole grid doesn't fade in as one flat block. Omit to skip the stagger (renders instantly). */
  animationIndex?: number
}

export function MetricCard({ metric, periodViewIndex = 0, asAtMonth, onManualSave, sparklineMonths, animationIndex }: Props) {
  // periodsByView cards (e.g. EDM Open Rate & CTR, EDM Clicks & List Growth)
  // show 3 DIFFERENT sub-metrics per period, not a 3M/6M/12M progression of
  // one metric — the period selector swaps the whole periods row, and the
  // headline follows that row's first cell.
  const displayPeriods = metric.periodsByView?.[periodViewIndex] ?? metric.periods

  // Cards flagged customPeriods with periodsByView (e.g. EDM cards showing 3
  // different sub-metrics per period) use period labels not tied to the
  // selector — their headline stays pinned to metric.primary/trend. Manual
  // -input cards (e.g. Press Office) ARE customPeriods but their
  // periods[0..2] still correspond to 3M/6M/12M, so the headline should
  // still follow the Period View selector like a normal card.
  const usePeriodSelection = !metric.periodsByView
  const selected = usePeriodSelection
    ? metric.periods[periodViewIndex]
    : displayPeriods[metric.headlineIndex ?? 0]
  const trend = selected?.deltaDirection ?? metric.trend
  const primary = selected?.value ?? metric.primary
  // trendVsLabel is the "vs X" suffix (e.g. "vs prior period", "vs May 2026")
  // computed once server-side from the 3M window; when a non-3M period is
  // selected we still show that same comparison phrase, just with the
  // selected period's delta value substituted in. Manual-input cards have no
  // trendVsLabel (nothing to compare against), so there's nothing to show.
  const trendLabel = selected && metric.trendVsLabel ? `${selected.delta} ${metric.trendVsLabel}` : metric.trendLabel
  const animatedPrimary = useCountUp(primary)

  // 'headline' edits metric.primary via metric.manualMetricKey; a period
  // label ('3M'/'6M'/'12M') edits that cell via its own manualMetricKey.
  const [editingTarget, setEditingTarget] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const canEditHeadline = metric.manualInput && metric.manualMetricKey && asAtMonth

  function startEditing(target: string, currentValue: string) {
    // Seed the input with the current raw number, if any was entered — strip formatting (commas etc.)
    const raw = currentValue.replace(/[^0-9.-]/g, '')
    setDraftValue(raw === '' || currentValue === '—' ? '' : raw)
    setSaveError('')
    setEditingTarget(target)
  }

  // The period box matching the currently selected Period View (3M/6M/12M).
  // The headline and this cell are kept in sync in both directions — typing
  // into either one fills the other — since the headline IS that period's
  // figure from the user's point of view. Manual-input cards (e.g. Press
  // Office) use customPeriods, so this looks at metric.periods directly
  // rather than the period-selection logic used for display.
  const currentPeriodCell = metric.periods[periodViewIndex]
  const isCurrentPeriodCell = (manualKey: string) => currentPeriodCell?.manualMetricKey === manualKey

  async function commitEdit(manualKey: string, isHeadline: boolean) {
    const num = Number(draftValue)
    if (draftValue.trim() === '' || Number.isNaN(num)) {
      setEditingTarget(null)
      return
    }
    setIsSaving(true)
    setSaveError('')
    try {
      const keysToSave = [manualKey]
      const syncsWithCurrentPeriod = isHeadline || isCurrentPeriodCell(manualKey)
      if (syncsWithCurrentPeriod) {
        // Editing the headline syncs to the current period cell; editing the
        // current period cell syncs back to the headline. Editing a NON-current
        // period cell (e.g. 6M while Period View is set to 3M) stays independent.
        const otherKey = isHeadline ? currentPeriodCell?.manualMetricKey : metric.manualMetricKey
        if (otherKey && otherKey !== manualKey) keysToSave.push(otherKey)
      }
      await Promise.all(keysToSave.map((key) => saveManualMetric(asAtMonth!, key, num)))
      setEditingTarget(null)
      onManualSave?.()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-line bg-card p-4 shadow-card transition-all duration-300 ease-out before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:shadow-[0_0_0px_currentColor] before:transition-shadow before:duration-300 before:content-[''] hover:-translate-y-0.5 hover:border-line/60 hover:shadow-card-hover hover:before:shadow-[0_0_8px_currentColor] ${railAccent[trend]} ${metric.pending ? 'opacity-60' : ''} ${animationIndex !== undefined ? 'card-animate-in' : ''}`}
      style={animationIndex !== undefined ? { '--card-delay': `${Math.min(animationIndex, 12) * 40}ms` } as React.CSSProperties : undefined}
    >
      <div className="mb-2.5 text-[0.68rem] font-bold uppercase tracking-[0.07em] text-muted">
        {metric.name}
      </div>

      {editingTarget === 'headline' ? (
        <div className="mb-1 flex items-center gap-1.5">
          <input
            type="number"
            autoFocus
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitEdit(metric.manualMetricKey!, true)
              if (e.key === 'Escape') setEditingTarget(null)
            }}
            onBlur={() => void commitEdit(metric.manualMetricKey!, true)}
            disabled={isSaving}
            className="figure w-full rounded-md border border-brand px-2 py-1 font-display text-[1.55rem] font-extrabold leading-none text-ink outline-none focus:ring-2 focus:ring-brand/30"
          />
          {metric.unit && <span className="text-[0.85rem] font-medium text-muted">{metric.unit}</span>}
        </div>
      ) : (
        <div
          className={`figure mb-1 font-display text-[1.55rem] font-extrabold leading-none tracking-tight text-ink ${canEditHeadline ? 'cursor-pointer decoration-brand/40 decoration-2 underline-offset-4 hover:underline' : ''}`}
          onClick={() => canEditHeadline && startEditing('headline', primary)}
        >
          {animatedPrimary}
          {metric.unit && <span className="ml-1.5 text-[0.82rem] font-medium text-muted">{metric.unit}</span>}
        </div>
      )}
      {saveError && <div className="mb-1 text-[0.68rem] font-semibold text-down">{saveError}</div>}

      {trendLabel && (
        <div className={`mb-3 flex items-center gap-1 text-[0.78rem] font-semibold ${trendText[trend]}`}>
          <span className="text-[0.72rem]">{trendArrow[trend]}</span>
          {trendLabel}
        </div>
      )}

      <Sparkline points={metric.sparkline} trend={trend} months={sparklineMonths} monthsToShow={MONTHS_BY_PERIOD_INDEX[periodViewIndex] ?? 12} />

      <div className="mt-2.5 grid grid-cols-3 gap-1.5 border-t border-line pt-2.5">
        {displayPeriods.map((p, i) => {
          const canEditCell = !!(p.manualMetricKey && asAtMonth)
          const cellTarget = `period-${p.label}`
          const isActivePeriod = !metric.periodsByView && i === periodViewIndex
          return (
            <div key={p.label} className={`rounded-md py-1 text-center transition-colors ${isActivePeriod ? 'bg-ink/[0.035] ring-1 ring-ink/10' : ''}`}>
              <div className="text-[0.6rem] font-bold uppercase tracking-[0.07em] text-muted/80">{p.label}</div>
              {editingTarget === cellTarget ? (
                <input
                  type="number"
                  autoFocus
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitEdit(p.manualMetricKey!, false)
                    if (e.key === 'Escape') setEditingTarget(null)
                  }}
                  onBlur={() => void commitEdit(p.manualMetricKey!, false)}
                  disabled={isSaving}
                  className="figure w-full rounded border border-brand px-1 py-0.5 text-center text-[0.86rem] font-bold text-ink outline-none focus:ring-2 focus:ring-brand/30"
                />
              ) : (
                <div
                  className={`figure text-[0.86rem] font-bold text-ink ${canEditCell ? 'cursor-pointer decoration-brand/40 decoration-2 underline-offset-2 hover:underline' : ''}`}
                  onClick={() => canEditCell && startEditing(cellTarget, p.value)}
                >
                  {p.value}
                </div>
              )}
              {!canEditCell && (
                <div className={`mt-1 inline-block rounded px-[5px] py-px text-[0.64rem] font-bold ${deltaPill[p.deltaDirection]}`}>
                  {p.delta}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
