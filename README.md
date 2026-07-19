# Autoglym DBC2 - Business Scorecard Dashboard

A custom Business Scorecard Dashboard for Autoglym's DBC2 division: a single, print-ready
A3 view that aggregates key marketing performance metrics for board-ready reporting.

Stack: **React + TypeScript + Vite + TailwindCSS + Chart.js**.

---

## Project status

This repo is staged in two layers:

| Layer | Location | Purpose |
| --- | --- | --- |
| **Phase 1 wireframe** (reference) | [`wireframe/`](wireframe/) | The signed-off static HTML/CSS prototype. Source of truth for layout. Not built or bundled. |
| **React app** (Phases 2–4) | [`src/`](src/) | The production dashboard. Wireframe migrated to React + Tailwind components, running on sample data. |

The four delivery phases (per the proposal):

1. **Discovery & Wireframing** - ✅ wireframe done, migrated to React.
2. **Backend Architecture & Data Integration** - Node.js data pipeline, GA4 / Google Ads / Iconosquare APIs, GTM retailer click tracking. _(not started)_
3. **Frontend Development & Commentary System** - Chart.js visuals, commentary portal. _(scaffolded; sample data)_
4. **Testing, Deployment & Handover** - QA, A3 print optimisation, cloud deploy. _(not started)_

---

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the Vite dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run build      # type-check + production build
npm run preview    # preview the production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

---

## Structure

```
.
├── wireframe/                  # Phase 1 reference prototype (static, do not bundle)
├── public/                     # static assets served as-is
├── src/
│   ├── components/
│   │   ├── scorecard/          # Tab 1 - Balanced Scorecard face (prints to A3)
│   │   ├── commentary/         # Tab 2 - monthly commentary layer
│   │   ├── dashboard/          # Tab 3 - channel drill-down + retailer breakdown
│   │   └── shared/             # Sparkline, SectionLabel, etc.
│   ├── data/                   # sample data (replaced by API layer in Phase 2)
│   ├── types/                  # shared domain types
│   ├── lib/                    # helpers / future API client
│   ├── App.tsx                 # app shell: header, tabs, period controls, print
│   ├── main.tsx                # React entry
│   └── index.css               # Tailwind layers + A3 print stylesheet
├── tailwind.config.ts          # palette/tokens lifted from the wireframe
└── .env.example                # API credentials template (Phase 2)
```

## The three tabs

- **Scorecard** - the BSC face. Two sections (Media Volume & Performance, Engagement &
  Lead Success), each a 4-up grid of metric cards with trend, sparkline, and 3M/6M/12M
  rolling comparisons. **This is the only tab that prints** (A3 landscape).
- **Commentary** - a separate layer (Highlights / Lowlights / Optimisation Opportunities)
  plus campaign attribution. Not on the BSC face.
- **Channel Dashboard** - retailer button-click breakdown and per-channel detail. Drill-down
  reference only; retailer attribution deliberately lives here, not on the scorecard face.

## Notes

- All figures currently shown are **illustrative sample data** for layout sign-off.
- Real data arrives in Phase 2 via the backend API; see `.env.example` for the integrations.
- Tailwind tokens (`ink`, `brand`, `up`/`down`/`neutral`, etc.) mirror the wireframe palette.
