import type { CommentaryBlock, Campaign } from '@/types'

/** Seeded sample commentary — editable on the Commentary tab; edits persist to the DB and override this per month. */
export const commentaryBlocks: CommentaryBlock[] = [
  {
    id: 'media',
    title: 'Media Volume & Performance',
    items: [
      {
        id: 'media-highlight',
        kind: 'highlight',
        text: 'Made for Both campaign launch drove an 18.2% lift in total impressions. CPC improved to $0.38 — the lowest in 12 months — indicating improving paid efficiency as creative matured mid-period.',
      },
      {
        id: 'media-lowlight',
        kind: 'lowlight',
        text: 'CPM increased $0.38 to $8.42, reflecting broader Meta auction pressure in the category. Frequency and relevance scores remained stable — this is external market movement, not a campaign quality issue.',
      },
      {
        id: 'media-opportunity',
        kind: 'opportunity',
        text: 'Reallocating 15–20% of Meta spend toward Google Search is projected to reduce blended CPM while maintaining conversion volume. Recommend board consideration for Q3 budget flexibility.',
      },
    ],
  },
  {
    id: 'engagement',
    title: 'Engagement & Lead Success',
    items: [
      {
        id: 'engagement-highlight',
        kind: 'highlight',
        text: 'Website sessions grew 12.4% to 84,210 in the 3-month period. Organic social engagement up 15.3%, with RUPES AU/NZ contributing the largest share of earned engagement growth this cycle.',
      },
      {
        id: 'engagement-lowlight',
        kind: 'lowlight',
        text: 'Bounce rate increased 4.2pp to 52.8% and page conversion rate fell 3.2pp to 18.4%. Both correlate with reduced paid spend this period driving lower-intent traffic to product pages.',
      },
      {
        id: 'engagement-opportunity',
        kind: 'opportunity',
        text: 'Product page landing experience should be reviewed for mobile. Session duration decline (−0:12) suggests friction on mobile devices. Quick wins available via CTA placement and page load speed.',
      },
    ],
  },
]

export const campaigns: Campaign[] = [
  {
    id: 'core-products',
    name: 'Core Products — Always On',
    startedMonthsAgo: 3,
    bullets: [
      { id: 'core-products-bullet-0', text: 'Meta feed and stories running across 6 hero SKUs. Exterior Trim Restorer and Ultra High Definition Wax driving the majority of retailer click volume.' },
      { id: 'core-products-bullet-1', text: 'Reach 820,000 across the period. Efficiency maintained — CPA $1.82, below the 3-month average of $1.87.' },
      { id: 'core-products-bullet-2', text: 'Page conversion rate for Core Products landing pages: 21.4% — above site average, confirming campaign-to-page alignment is strong.' },
      { id: 'core-products-bullet-3', text: 'Key learning: Hero SKU rotation every 4 weeks reduces audience fatigue and maintains CTR above 2.4%.' },
    ],
  },
  {
    id: 'made-for-both',
    name: 'Made for Both — Always On',
    startedMonthsAgo: 2,
    bullets: [
      { id: 'made-for-both-bullet-0', text: 'New campaign stream launched April 2026. Early performance: 480,000 impressions in first 6 weeks at CPM $7.80 — below account average.' },
      { id: 'made-for-both-bullet-1', text: 'CTR 3.1% in launch period — above account average, indicating strong creative resonance with the target audience.' },
      { id: 'made-for-both-bullet-2', text: 'Retailer click attribution for this campaign: 21.4% of sessions convert to a retailer click, consistent with Core Products.' },
      { id: 'made-for-both-bullet-3', text: 'Key learning: Dual-hero (automotive + lifestyle) creative outperforming product-only formats by 24% on CTR in A/B test.' },
    ],
  },
]
