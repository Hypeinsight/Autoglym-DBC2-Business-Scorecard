import type { ScorecardSection, PeriodView } from '@/types'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { MetricCard } from './MetricCard'

interface Props {
  sections: ScorecardSection[]
  periodView: PeriodView
  /** 0 = 3M, 1 = 6M, 2 = 12M - which period column index to highlight */
  periodViewIndex: number
  reportingEnd: string
  generatedAt: string
  /** Currently selected "As At" month ('YYYY-MM') - passed to MetricCard so manual-input edits save against the right month. */
  asAtMonth: string
  /** Called after a manual value is saved, so the scorecard refetches and shows the update. */
  onManualSave: () => void
  /** 12 month labels (oldest → newest) matching every card's sparkline - used for hover tooltips. */
  sparklineMonths: string[]
}

/** Tab 1 - the Balanced Scorecard face. This is the only tab that prints to A3. */
export function ScorecardTab({ sections, periodView, periodViewIndex, reportingEnd, generatedAt, asAtMonth, onManualSave, sparklineMonths }: Props) {
  const periodLabel = periodView.replace('Rolling ', '')
  const reportLabel = reportingEnd
    ? new Date(`${reportingEnd}-01`).toLocaleString('en-AU', { month: 'short', year: 'numeric' })
    : '-'
  const generatedLabel = generatedAt
    ? new Date(generatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  return (
    <div className="print-page-outer mx-auto my-6 max-w-page">
      <div className="print-page rounded-xl border border-line bg-card px-8 pb-8 pt-7 shadow-page">
        <header className="relative mb-7 flex items-start justify-between border-b-2 border-ink pb-5 after:absolute after:inset-x-0 after:bottom-[-2px] after:h-[2px] after:w-16 after:bg-brand after:content-['']">
          <div>
            <div className="font-display text-[1.55rem] font-extrabold tracking-tight text-ink">
              Autoglym <span className="text-brand">·</span> Balanced Scorecard
            </div>
            <div className="mt-1.5 text-[0.82rem] text-muted">
              DBC2 Division &nbsp;·&nbsp; Monthly Board Pack &nbsp;·&nbsp; Leading Marketing Indicators
            </div>
          </div>
          <div className="text-right">
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-ink px-3 py-1 text-[0.76rem] font-semibold text-white shadow-sm">
              Rolling {periodLabel}
            </div>
            <div className="text-[0.76rem] text-muted">
              Reporting Period End &nbsp;<span className="font-semibold text-ink">{reportLabel}</span>
            </div>
          </div>
        </header>

        {sections.map((section, idx) => (
          <div key={section.id}>
            {idx > 0 && <div className="my-2 mb-5 h-px bg-gradient-to-r from-line via-line to-transparent" />}
            <SectionLabel color={section.color}>{section.label}</SectionLabel>
            <div className="metric-grid mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              {section.metrics.map((m, i) => (
                <MetricCard key={m.id} metric={m} periodViewIndex={periodViewIndex} asAtMonth={asAtMonth} onManualSave={onManualSave} sparklineMonths={sparklineMonths} animationIndex={i} />
              ))}
            </div>
          </div>
        ))}

        <footer className="mt-2 flex items-center justify-between border-t border-line pt-3.5">
          <div className="text-[0.68rem] text-muted/80">
            Sources: Google Analytics 4 · Google Ads · Meta Ads · Klaviyo · Manual PR Input
            {generatedLabel && ` · Generated ${generatedLabel}`}
          </div>
          <div className="font-display text-[0.7rem] font-bold text-ink/60">Prepared for Autoglym DBC2 · Confidential</div>
        </footer>
      </div>
    </div>
  )
}
