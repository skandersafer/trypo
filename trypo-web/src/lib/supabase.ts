import { createClient } from "@supabase/supabase-js"

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim()
const supabaseUrl = rawUrl ? rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "") : ""
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim()

/** True when the browser can connect to the configured Supabase project. */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
)

/**
 * Browser-only Supabase client. It stays null in design/preview environments
 * until .env.local is configured, so the existing prototype remains usable.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null

/** Use in a feature that requires a configured Supabase project. */
export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.",
    )
  }

  return supabase
}
