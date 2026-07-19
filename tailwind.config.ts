import type { Config } from 'tailwindcss'

/**
 * Palette lifted directly from Autoglym's live site CSS (theme_international
 * .min.css) - not an approximation. #ea192e and #00003b are the two colors
 * that dominate their real stylesheet by a wide margin; #cb1628 is their
 * confirmed hover/pressed state for the red.
 *
 * "down"/negative trend deliberately does NOT reuse brand red - a red card
 * accent (brand identity) and a red trend arrow (bad news) would blur
 * together on the same card. Status color stays a distinct rust/amber.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#00003b',        // Autoglym deep navy - primary text, headers
        brand: '#ea192e',      // Autoglym red - primary accent, confirmed from live CSS
        'brand-dark': '#cb1628', // confirmed hover/pressed state for brand red
        up: '#1a7a4c',          // positive trend - distinct from brand red/green defaults
        down: '#c2410c',        // negative trend - rust, not brand red (avoids identity/status clash)
        neutral: '#a16207',     // flat/attention trend - amber-brown, reads calmer than default amber-500
        muted: '#707070',       // confirmed secondary text color from live CSS
        card: '#ffffff',
        paper: '#fafafa',       // page background - a hair off white, not inherited default
        line: '#e3e3e3',        // confirmed border/divider color from live CSS
      },
      fontFamily: {
        // Figtree carries headlines/labels - a geometric-humanist face in
        // the same spirit as Autoglym's licensed Gill Sans Nova, without
        // defaulting to Inter-everywhere.
        display: ['Figtree', 'Segoe UI', 'Arial', 'sans-serif'],
        // Inter reserved for numeric data specifically - tabular-nums
        // support matters more there than for headings.
        sans: ['Inter', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        page: '0 1px 3px rgba(0,0,59,0.08), 0 8px 24px rgba(0,0,59,0.06)',
        card: '0 1px 2px rgba(0,0,59,0.05)',
        'card-hover': '0 4px 16px rgba(0,0,59,0.10)',
        badge: '0 2px 12px rgba(0,0,0,0.15)',
      },
      maxWidth: {
        page: '1280px',
      },
    },
  },
  plugins: [],
} satisfies Config
