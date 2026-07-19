import type { RetailerClicks } from '@/types'

/** Retailer button click breakdown - dashboard-layer only, NOT on the BSC face. */
export const retailerClicks: RetailerClicks[] = [
  { name: 'Super Cheap Auto', clicks: 5820, sharePct: 37.6, color: '#2563eb', logo: '/logos/supercheap-auto.webp' },
  { name: 'Repco', clicks: 4210, sharePct: 27.2, color: '#16a34a', logo: '/logos/repco.webp' },
  { name: 'Amazon', clicks: 3640, sharePct: 23.5, color: '#7c3aed', logo: '/logos/amazon.webp' },
  { name: 'Autobarn', clicks: 1820, sharePct: 11.7, color: '#e63946', logo: '/logos/autobarn.webp' },
]
