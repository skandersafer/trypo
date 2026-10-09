import { useEffect, useState } from "react"
import { supabase, isSupabaseConfigured } from "../lib/supabase"
import { getCurrentUserId } from "../lib/trips"

/**
 * Shows whether the current account edits are actually synced to Supabase,
 * so a user can tell when a change will NOT reach the other account.
 *   - "live"  (green): real Supabase session present -> writes reach the server
 *   - "local" (amber): guest / not signed in          -> writes stay on-device
 */
export default function SyncStatusBadge() {
  const [live, setLive] = useState<boolean | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // Sticky on purpose: a rejected server write must stay visible until the
    // user dismisses it, otherwise cross-account sync failures go unnoticed.
    const onSyncError = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const msg = detail?.message ? `${detail.scope || "sync"}: ${detail.message}` : "�%criture serveur ǸchouǸe"
      if (!cancelled) setLastError(msg)
    }

    const check = () => {
      if (!isSupabaseConfigured || !supabase || !getCurrentUserId()) {
        if (!cancelled) setLive(false)
        return
      }
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (cancelled) return
          setLive(!error && Boolean(data?.session?.user))
        })
        .catch(() => {
          if (!cancelled) setLive(false)
        })
    }

    check()
    const authSub = supabase?.auth.onAuthStateChange(() => check())
    const onMb = () => check()
    window.addEventListener("trypo:db_changed", onMb)
    window.addEventListener("trypo:active_trip_changed", onMb)
    window.addEventListener("trypo:sync_error", onSyncError)
    const poll = window.setInterval(check, 10_000)

    return () => {
      cancelled = true
      authSub?.data?.subscription?.unsubscribe()
      window.removeEventListener("trypo:db_changed", onMb)
      window.removeEventListener("trypo:active_trip_changed", onMb)
      window.removeEventListener("trypo:sync_error", onSyncError)
      window.clearInterval(poll)
    }
  }, [])

  if (lastError) {
    return (
      <span
        className="flex max-w-[220px] items-center gap-1.5 rounded-full bg-red-500/25 px-2.5 py-1 text-[11px] font-semibold text-red-200 cursor-pointer"
        title={`${lastError} — tap to dismiss`}
        onClick={() => setLastError(null)}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
        <span className="truncate">{lastError}</span>
      </span>
    )
  }

  if (live === null) return null

  return (
    <span
      className="flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-semibold text-white"
      title={
        live
          ? "Compte connecté à Supabase : les modifications se synchronisent avec l'autre compte."
          : "Mode local : les modifications restent sur cet appareil tant que le compte n'est pas connecté."
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`} />
      {live ? "Live sync" : "Local only"}
    </span>
  )
}