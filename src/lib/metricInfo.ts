/**
 * Plain-English explanations for each scorecard metric, shown in the hover /
 * focus tooltip on every MetricCard. Keyed by `metric.id` (see the server
 * scorecardMapper). This is a presentation-only lookup and deliberately does
 * NOT live in the data pipeline, so adding or rewording a definition never
 * risks the figures themselves.
 *
 * `what` is written for a board audience (what the number means and why it
 * matters), not a technical spec. `source` mirrors the systems the figure is
 * derived from. Any metric id without an entry simply renders no info icon.
 */
export interface MetricInfo {
  what: string
  source: string
}

export const METRIC_INFO: Record<string, MetricInfo> = {
  // ── Scorecard face: Media Volume & Performance ──────────────
  impressions: {
    what: 'The total number of times Autoglym DBC2 ads and organic posts were shown across paid and organic channels. The headline measure of overall reach.',
    source: 'Google Ads + Meta',
  },
  clicks: {
    what: 'Total clicks on all paid advertising (Google Ads and Meta link clicks). Shows how many people engaged enough to click through to the brand.',
    source: 'Google Ads + Meta',
  },
  cpm: {
    what: 'Cost Per Mille, the average cost to serve 1,000 ad impressions, weighted across channels. Lower means reach is being bought more efficiently.',
    source: 'Google Ads + Meta',
  },
  cpc: {
    what: 'Cost Per Link Click, the average amount paid each time someone clicks a paid ad. Lower means cheaper, more efficient traffic.',
    source: 'Google Ads + Meta',
  },
  ctr: {
    what: 'Click-Through Rate, the share of impressions that resulted in a click. Higher signals more relevant, compelling creative and targeting.',
    source: 'Google Ads + Meta',
  },
  conversions: {
    what: 'Retailer button clicks driven by paid activity, where users click through to a stockist. This is the primary commercial outcome the paid media works towards.',
    source: 'GA4 + GTM',
  },
  cpa: {
    what: 'Cost Per Acquisition, the average paid spend behind each conversion (retailer click). Lower means each outcome is won more cheaply.',
    source: 'Google Ads + Meta + GA4',
  },
  press: {
    what: 'PR placements secured through the press office, entered manually each month. Captures earned-media reach that ad platforms cannot see.',
    source: 'Manual PR input',
  },

  // ── Scorecard face: Engagement & Lead Success ───────────────
  visits: {
    what: 'Total website sessions across every traffic source. The topline measure of how much traffic the site is receiving.',
    source: 'Google Analytics 4',
  },
  bounce: {
    what: 'The share of sessions that left without meaningful engagement. Lower is better: it means more visitors stayed and explored the site.',
    source: 'Google Analytics 4',
  },
  retention: {
    what: 'Average time a visitor spends per session. Longer sessions indicate more engaging content and stronger purchase intent.',
    source: 'Google Analytics 4',
  },
  pageconv: {
    what: 'The share of website sessions that ended in a retailer button click, showing how effectively the site turns visits into retailer intent.',
    source: 'Google Analytics 4',
  },
  engrate: {
    what: 'The share of sessions Google counts as "engaged" (a meaningful interaction, not a quick bounce). A quality-of-traffic signal.',
    source: 'Google Analytics 4',
  },
  social: {
    what: 'Total organic engagements (likes, comments, shares, saves) on owned social content. Audience attention earned without paid spend.',
    source: 'Organic social',
  },
  'edm-open': {
    what: 'Email open rate and click-through rate for Klaviyo campaigns: how many recipients opened, and how many then clicked through.',
    source: 'Klaviyo',
  },
  'edm-clicks': {
    what: 'Total email clicks and the rate at which the subscriber list is growing month on month. Reach and momentum of the owned email channel.',
    source: 'Klaviyo',
  },

  // ── Channel Dashboard: Meta Ads ─────────────────────────────
  'meta-spend': {
    what: 'Total amount spent on Meta (Facebook and Instagram) advertising in the reporting month.',
    source: 'Meta Ads',
  },
  'meta-reach': {
    what: 'The number of unique people who saw a Meta ad at least once. Reach counts individuals, not total impressions.',
    source: 'Meta Ads',
  },
  'meta-freq': {
    what: 'The average number of times each person saw a Meta ad. Rising frequency can signal audience fatigue.',
    source: 'Meta Ads',
  },
  'meta-cpa': {
    what: 'The average Meta ad spend behind each conversion. Lower means Meta is driving outcomes more cheaply.',
    source: 'Meta Ads',
  },

  // ── Channel Dashboard: Google Ads ───────────────────────────
  'gads-spend': {
    what: 'Total amount spent on Google Ads in the reporting month.',
    source: 'Google Ads',
  },
  'gads-impressions': {
    what: 'The number of times Google Ads were displayed across search and display placements.',
    source: 'Google Ads',
  },
  'gads-clicks': {
    what: 'Total clicks on Google Ads, showing how many people clicked through from Google.',
    source: 'Google Ads',
  },
  'gads-cpc': {
    what: 'Google Ads Cost Per Click, the average paid each time someone clicks a Google ad. Lower means cheaper traffic.',
    source: 'Google Ads',
  },

  // ── Channel Dashboard: GA4 Website ──────────────────────────
  'ga4-sessions': {
    what: 'Website sessions measured in Google Analytics 4. A session is a single visit to the site.',
    source: 'Google Analytics 4',
  },
  'ga4-pageviews': {
    what: 'The total number of pages viewed across all sessions. A measure of browsing depth and content consumption.',
    source: 'Google Analytics 4',
  },
  'ga4-duration': {
    what: 'The average length of a website session. Longer sessions indicate more engaged visitors.',
    source: 'Google Analytics 4',
  },
  'ga4-bounce': {
    what: 'The share of GA4 sessions that ended without meaningful engagement. Lower is better.',
    source: 'Google Analytics 4',
  },

  // ── Channel Dashboard: Klaviyo EDM ──────────────────────────
  'klaviyo-open': {
    what: 'The share of delivered emails that were opened by recipients. A gauge of subject-line strength and sender reputation.',
    source: 'Klaviyo',
  },
  'klaviyo-ctr': {
    what: 'The share of delivered emails where a recipient clicked a link. Measures how compelling the email content and offer are.',
    source: 'Klaviyo',
  },
  'klaviyo-sends': {
    what: 'The total number of emails sent through Klaviyo in the reporting month.',
    source: 'Klaviyo',
  },
  'klaviyo-list-size': {
    what: 'The total number of subscribers on the main Autoglym email list. The owned audience the brand can reach directly at no media cost.',
    source: 'Klaviyo',
  },

  // ── Channel Dashboard: Organic Social ───────────────────────
  'social-engagements': {
    what: 'Total organic engagements (likes, comments, shares, saves) across owned social channels.',
    source: 'Organic social',
  },
  'social-reach': {
    what: 'The number of unique accounts that saw organic social content, earned without paid promotion.',
    source: 'Organic social',
  },
  'social-engagement-rate': {
    what: 'Engagements as a share of reach. Higher means content is resonating with the audience that sees it.',
    source: 'Organic social',
  },
  'social-followers': {
    what: 'The net growth in followers across owned social channels during the reporting month.',
    source: 'Organic social',
  },
}
