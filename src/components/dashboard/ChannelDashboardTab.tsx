import { useState } from 'react'
import type { ScorecardSection } from '@/types'
import { retailerClicks } from '@/data/channel'
import { MetricCard } from '@/components/scorecard/MetricCard'

/** Shows a retailer's logo image; falls back to its text name if the file
 *  isn't present yet (logos go in /public/logos/, see src/data/channel.ts). */
function RetailerLogo({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <div className="text-[0.68rem] font-bold uppercase tracking-[0.06em] text-muted">{name}</div>
  }
  return <img src={src} alt={name} className="mx-auto h-9 w-full max-w-[130px] object-contain" onError={() => setFailed(true)} />
}

interface Props {
  /** Non-BSC-face sections from the API (e.g. Meta Ads channel detail). */
  channelSections: ScorecardSection[]
  /** 0 = 3M, 1 = 6M, 2 = 12M - which period column drives each card's headline value/trend. */
  periodViewIndex: number
  /** Currently selected "As At" month ('YYYY-MM') - passed to MetricCard so manual-input edits save against the right month. */
  asAtMonth: string
  /** Called after a manual value is saved, so the dashboard refetches and shows the update. */
  onManualSave: () => void
  /** 12 month labels (oldest → newest) matching every card's sparkline - used for hover tooltips. */
  sparklineMonths: string[]
}

/** Tab 3 - drill-down reference layer (retailer breakdown + per-channel detail).
 *  Per brief, retailer attribution lives here, NOT on the BSC face. */
export function ChannelDashboardTab({ channelSections, periodViewIndex, asAtMonth, onManualSave, sparklineMonths }: Props) {
  const monthLabel = new Date(`${asAtMonth}-01`).toLocaleString('en-AU', { month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto my-6 max-w-page rounded-xl border border-line bg-card px-8 pb-8 pt-7 shadow-page">
      <div className="mb-6 border-b-2 border-ink pb-4">
        <div className="font-display text-[1.3rem] font-extrabold text-ink">Channel Dashboard &amp; Campaign Detail</div>
        <div className="mt-1.5 text-[0.82rem] text-muted">
          Drill-down reference layer
        </div>
      </div>

      <div className="mb-3 border-b border-line pb-2 font-display text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">
        Retailer Button Click Breakdown - {monthLabel} (All Traffic)
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {retailerClicks.map((r) => (
          <div key={r.name} className="rounded-lg border border-line bg-card p-4 text-center shadow-card">
            <div className="mb-2.5 flex h-9 items-center justify-center">
              <RetailerLogo src={r.logo} name={r.name} />
            </div>
            <div className="figure font-display text-2xl font-extrabold text-ink">{r.clicks.toLocaleString()}</div>
            <div className="mt-0.5 text-[0.72rem] text-muted">{r.sharePct}% of total clicks</div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full" style={{ width: `${r.sharePct}%`, background: r.color }} />
            </div>
          </div>
        ))}
      </div>

      {channelSections.map((section) => (
        <div key={section.id} className="mb-6">
          <div className="mb-3 border-b border-line pb-2 font-display text-[0.72rem] font-bold uppercase tracking-[0.09em] text-muted">
            {section.label}
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {section.metrics.map((m, i) => (
              <MetricCard key={m.id} metric={m} periodViewIndex={periodViewIndex} asAtMonth={asAtMonth} onManualSave={onManualSave} sparklineMonths={sparklineMonths} animationIndex={i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
