/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL incl. /api/v1, e.g. https://api.swapngo.in/api/v1.
   *  Unset = the site runs entirely on its bundled fallback content. */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_RIDER_WEB_URL: string;
  readonly VITE_PLAY_STORE_URL: string;
  /** GA4 Measurement ID (e.g. G-XXXXXXXXXX). Unset = GA4 does not load. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
