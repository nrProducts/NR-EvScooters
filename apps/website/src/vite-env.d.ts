/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_CONSOLE_URL: string;
  readonly VITE_PLAY_STORE_URL: string;
  readonly VITE_APP_STORE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
