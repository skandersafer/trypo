import { useEffect, useState } from "react"
import { supabase, isSupabaseConfigured } from "./supabase"
import { getCurrentAuthUser, getCurrentUserId } from "./trips"

export type CrewLocation = {
  id?: string
  tripId: string
  userId: string
  deviceId: string
  lat: number
  lng: number
  heading?: number | null
  accuracy?: number | null
  locationName?: string | null
  updatedAt: string
  source?: "supabase" | "backend" | "local"
}

const LOCATIONS_KEY = "trypo_crew_locations_v1"

export function getDeviceId(): string {
  if (typeof window === "undefined") return "default"
  let id = window.localStorage.getItem("trypo_device_id")
  if (!id) {
    id = Math.random().toString(36).slice(2, 10)
    window.localStorage.setItem("trypo_device_id", id)
  }
  return id
}

export function getMyUserId(): string {
  const uid = getCurrentUserId()
  if (uid) return uid
  const authUser = getCurrentAuthUser()
  if (authUser?.id && authUser.id !== "guest") return authUser.id
  return `guest-${getDeviceId()}`
}

export function locKey(userId: string, deviceId?: string): string {
  return `${userId}::${deviceId || "default"}`
}

export function fromCoords(
  tripId: string,
  coords: {
    latitude: number
    longitude: number
    accuracy?: number | null
    heading?: number | null
  },
  extras?: { locationName?: string | null },
): CrewLocation {
  return {
    tripId,
    userId: getMyUserId(),
    deviceId: getDeviceId(),
    lat: Number(coords.latitude),
    lng: Number(coords.longitude),
    heading: coords.heading != null && coords.heading >= 0 ? Number(coords.heading) : null,
    accuracy: coords.accuracy != null ? Number(coords.accuracy) : null,
    locationName: extras?.locationName || null,
    updatedAt: new Date().toISOString(),
  }
}

function readLocal(tripId: string): CrewLocation[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(LOCATIONS_KEY)
    const all: Record<string, CrewLocation[]> = raw ? JSON.parse(raw) : {}
    return all[tripId] || []
  } catch {
    return []
  }
}

function writeLocal(tripId: string, loc: CrewLocation): void {
  if (typeof window === "undefined") return
  try {
    const raw = window.localStorage.getItem(LOCATIONS_KEY)
    const all: Record<string, CrewLocation[]> = raw ? JSON.parse(raw) : {}
    const list = all[tripId] || []
    const idx = list.findIndex((l) => l.userId === loc.userId && l.deviceId === loc.deviceId)
    if (idx >= 0) list[idx] = loc
    else list.unshift(loc)
    all[tripId] = list.slice(0, 60)
    window.localStorage.setItem(LOCATIONS_KEY, JSON.stringify(all))
  } catch {}
}

function pushBackend(loc: CrewLocation): void {
  if (typeof fetch === "undefined") return
  fetch("/api/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loc),
  }).catch(() => {})
}

function mapRow(r: any): CrewLocation {
  return {
    id: r.id,
    tripId: r.trip_id ?? r.tripId,
    userId: r.user_id ?? r.userId,
    deviceId: r.device_id ?? r.deviceId ?? "default",
    lat: Number(r.lat),
    lng: Number(r.lng),
    heading: r.heading != null ? Number(r.heading) : null,
    accuracy: r.accuracy != null ? Number(r.accuracy) : null,
    locationName: r.location_name ?? r.locationName ?? null,
    updatedAt: r.updated_at ?? r.updatedAt,
    source: (r.id ? "supabase" : r.source) || "backend",
  }
}

async function pushSupabase(loc: CrewLocation): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const uid = getCurrentUserId()
  if (!uid) return false
  try {
    const row = {
      trip_id: loc.tripId,
      user_id: uid,
      device_id: loc.deviceId,
      lat: loc.lat,
      lng: loc.lng,
      heading: loc.heading ?? null,
      accuracy: loc.accuracy ?? null,
      location_name: loc.locationName || null,
      updated_at: loc.updatedAt,
    }
    await supabase
      .from("crew_locations")
      .upsert(row, { onConflict: "trip_id,user_id,device_id" })
    return true
  } catch (e) {
    console.warn("pushSupabase crew location failed (migration not applied?):", e)
    return false
  }
}

export async function publishMyLocation(loc: CrewLocation): Promise<CrewLocation> {
  writeLocal(loc.tripId, loc)
  pushBackend(loc)
  const pushed = await pushSupabase(loc)
  if (pushed) return { ...loc, source: "supabase" }
  return loc
}

export async function fetchCrewLocations(tripId: string): Promise<CrewLocation[]> {
  const merged: CrewLocation[] = []
  const seen = new Map<string, CrewLocation>()

  const add = (loc: CrewLocation) => {
    const key = locKey(loc.userId, loc.deviceId)
    const existing = seen.get(key)
    if (!existing || existing.updatedAt < loc.updatedAt) seen.set(key, loc)
  }

  for (const l of readLocal(tripId)) add(l)

  try {
    const res = await fetch(`/api/locations?tripId=${encodeURIComponent(tripId)}`)
    if (res.ok) {
      const rows = await res.json()
      if (Array.isArray(rows)) for (const r of rows) add(mapRow(r))
    }
  } catch {}

  if (isSupabaseConfigured && supabase && getCurrentUserId()) {
    try {
      const { data, error } = await supabase
        .from("crew_locations")
        .select("*")
        .eq("trip_id", tripId)
      if (!error && Array.isArray(data)) for (const r of data) add(mapRow(r))
    } catch {}
  }

  for (const l of seen.values()) merged.push(l)
  return merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function subscribeToCrewLocations(
  tripId: string,
  onLocation: (loc: CrewLocation) => void,
): () => void {
  const cleanups: Array<() => void> = []

  if (isSupabaseConfigured && supabase && getCurrentUserId()) {
    const channel = supabase
      .channel(`crew-locations-${tripId}-${getDeviceId()}-${Math.random().toString(36).slice(2, 6)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crew_locations", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const row = payload.new || payload.old
          if (row) onLocation(mapRow(row))
        },
      )
      .subscribe()
    cleanups.push(() => {
      try {
        supabase?.removeChannel(channel)
      } catch {}
    })
  }

  const poll = window.setInterval(async () => {
    const locs = await fetchCrewLocations(tripId)
    for (const l of locs) onLocation(l)
  }, 4000)
  cleanups.push(() => window.clearInterval(poll))

  return () => cleanups.forEach((fn) => fn())
}

export function useMyLocationShare(tripId: string | null | undefined, enabled: boolean) {
  const [sharing, setSharing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFix, setLastFix] = useState<CrewLocation | null>(null)

  // Toggling OFF (or losing the trip) must immediately reset the UI —
  // otherwise the button stays stuck on "Sharing".
  useEffect(() => {
    if (!enabled || !tripId) {
      setSharing(false)
      setStarting(false)
      setError(null)
    }
  }, [enabled, tripId])

  // Inside the APK (Expo WebView shell) the browser geolocation prompt can
  // be blocked — the native shell pushes GPS fixes via the
  // `trypo:native-location` window event (see TrypoExpo/App.tsx). Consume
  // those fixes first, fall back to navigator.geolocation otherwise.
  useEffect(() => {
    if (!enabled || !tripId) return
    const w = window as unknown as Record<string, unknown>
    if (w.__TRYPO_NATIVE__ !== true) return

    const onNativeFix = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { latitude: number; longitude: number; accuracy?: number | null; heading?: number | null }
        | undefined
      if (!detail || !Number.isFinite(detail.latitude) || !Number.isFinite(detail.longitude)) return
      const loc = fromCoords(tripId, {
        latitude: detail.latitude,
        longitude: detail.longitude,
        accuracy: detail.accuracy ?? null,
        heading: detail.heading ?? null,
      })
      void publishMyLocation(loc).then((saved) => {
        setLastFix(saved)
        setSharing(true)
        setStarting(false)
        setError(null)
      })
    }

    window.addEventListener("trypo:native-location", onNativeFix)
    // Ask the shell for an immediate fix (it replies with the same event).
    try {
      const rnw = w.ReactNativeWebView as { postMessage?: (msg: string) => void } | undefined
      rnw?.postMessage?.(JSON.stringify({ type: "getNativeLocation" }))
    } catch {}
    // If a fix was already pushed before we subscribed, pick it up.
    try {
      const existing = w.__TRYPO_NATIVE_LOCATION__ as
        | { latitude: number; longitude: number; accuracy?: number | null; heading?: number | null }
        | null
        | undefined
      if (existing && Number.isFinite(existing.latitude)) {
        onNativeFix(new CustomEvent("trypo:native-location", { detail: existing }))
      }
    } catch {}

    return () => window.removeEventListener("trypo:native-location", onNativeFix)
  }, [tripId, enabled])

  useEffect(() => {
    if (!enabled || !tripId) return
    if (!("geolocation" in navigator)) {
      // In the APK the native bridge above still delivers fixes.
      const w = window as unknown as Record<string, unknown>
      if (w.__TRYPO_NATIVE__ === true) {
        setStarting(true)
        return
      }
      setError("Geolocation is not supported by this browser")
      setSharing(false)
      return
    }

    let cancelled = false
    let watchId: number | null = null

    const publish = (pos: GeolocationPosition) => {
      const loc = fromCoords(tripId, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
      })
      void publishMyLocation(loc).then((saved) => {
        if (cancelled) return
        setLastFix(saved)
        setSharing(true)
        setStarting(false)
        setError(null)
      })
    }

    const fail = (err: GeolocationPositionError) => {
      if (cancelled) return
      const w = window as unknown as Record<string, unknown>
      const isNative = w.__TRYPO_NATIVE__ === true
      // Inside the APK the native bridge keeps delivering fixes even when
      // the browser geolocation prompt fails — don't kill sharing then.
      if (isNative) {
        setStarting(true)
        setError(
          err?.code === err?.PERMISSION_DENIED
            ? "Browser GPS blocked — using the native fix. Enable location permission for Trypo if the pin stays stale."
            : "Waiting for GPS fix… make sure GPS is on.",
        )
        return
      }
      setStarting(false)
      setSharing(false)
      if (err?.code === err?.PERMISSION_DENIED) {
        setError("Location permission was denied — enable it to share live GPS.")
      } else {
        setError("Could not get your GPS fix yet. Make sure GPS is on, then retry…")
      }
    }

    setStarting(true)
    navigator.geolocation.getCurrentPosition(publish, fail, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    })
    watchId = navigator.geolocation.watchPosition(publish, fail, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 5000,
    })

    return () => {
      cancelled = true
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
    }
  }, [tripId, enabled])

  return { sharing, starting, error, lastFix }
}

export function openInMaps(lat: number, lng: number, name?: string): void {
  if (typeof window === "undefined") return
  const isIOS = /iP(ad|hone|od)/i.test(navigator.userAgent)
  const label = encodeURIComponent(name || "Crew location")
  const url = isIOS
    ? `https://maps.apple.com/?ll=${lat},${lng}&q=${label}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  try {
    const w = window as unknown as Record<string, unknown>
    const rnw = w.ReactNativeWebView as { postMessage?: (msg: string) => void } | undefined
    // Inside the APK let the native shell open the system Maps app —
    // window.open can be swallowed by the WebView.
    if (w.__TRYPO_NATIVE__ === true && rnw?.postMessage) {
      rnw.postMessage(JSON.stringify({ type: "openExternal", url }))
      return
    }
  } catch {}
  const opened = window.open(url, "_blank", "noopener")
  if (!opened) window.location.href = url
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—"
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatEta(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—"
  const minutes = Math.max(1, Math.round(meters / 80))
  if (minutes < 60) return `${minutes} min away`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} h ${m} min away` : `${h} h away`
}

export function timeAgo(iso: string | undefined | null, nowMs: number): string {
  if (!iso) return "never"
  const diff = Math.max(0, nowMs - new Date(iso).getTime())
  if (diff < 5000) return "now"
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(iso).toLocaleTimeString()
}