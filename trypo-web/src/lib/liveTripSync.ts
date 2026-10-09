import { useEffect, useRef, useState } from "react"
import { supabase, isSupabaseConfigured } from "./supabase"
import { getActiveTripId, refreshTripFromServer, subscribeToTripChanges } from "./trips"

/**
 * Keeps the currently active trip in sync with Supabase in near-real-time.
 * - Subscribes to postgres_changes for the active trip's rows.
 * - Falls back to a light poll and only fires `trypo:db_changed` when the
 *   server copy actually changed (so screens re-render without chatty loops).
 */
export function useLiveTripSync() {
  const [tripId, setTripId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return getActiveTripId()
  })
  const snapshot = useRef<Record<string, string>>({})

  // Track the active trip as the user switches trips / accounts.
  useEffect(() => {
    if (typeof window === "undefined") return
    const sync = () => setTripId(getActiveTripId())
    window.addEventListener("trypo:active_trip_changed", sync)
    window.addEventListener("trypo:db_changed", sync)
    return () => {
      window.removeEventListener("trypo:active_trip_changed", sync)
      window.removeEventListener("trypo:db_changed", sync)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !isSupabaseConfigured || !supabase || !tripId) return

    let cancelled = false

    const refreshAndNotify = async () => {
      if (cancelled) return
      const trip = await refreshTripFromServer(tripId)
      if (cancelled || !trip) return
      const signature = JSON.stringify(trip)
      if (snapshot.current[tripId] && snapshot.current[tripId] === signature) return
      snapshot.current[tripId] = signature
      window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId } }))
    }

    // Real dataset changed on another account.
    const unsubscribe = subscribeToTripChanges(tripId, () => void refreshAndNotify())

    // Polling safety net keeps weaker networks/altered replicas honest.
    const poll = window.setInterval(() => void refreshAndNotify(), 7_000)

    return () => {
      cancelled = true
      window.clearInterval(poll)
      unsubscribe()
    }
  }, [tripId])

  return null
}