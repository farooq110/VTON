/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TRYON_API_ENDPOINT?: string;
  readonly VITE_TRYON_API_KEY?: string;
  readonly VITE_BRAND_ID?: string;
  readonly VITE_FRANCHISE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
