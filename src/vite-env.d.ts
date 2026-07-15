/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GA4_PROPERTY_ID: string
  readonly VITE_GOOGLE_ADS_CUSTOMER_ID: string
  readonly VITE_ICONOSQUARE_PROFILE_ID: string
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
