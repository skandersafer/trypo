/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string
  readonly VITE_AMADEUS_BASE_URL?: string
  // NOTE: Amadeus key/secret must NOT use VITE_ prefix (browser-exposed).
  // They live server-side only (Vercel env / api/). See .env.example.
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
