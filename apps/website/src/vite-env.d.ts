/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL incl. /api/v1, e.g. https://api.swapngo.in/api/v1.
   *  Unset = the site runs entirely on its bundled fallback content. */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ADMIN_CONSOLE_URL: string;
  readonly VITE_PLAY_STORE_URL: string;
  readonly VITE_APP_STORE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
