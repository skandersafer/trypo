import type { Screen } from "../App"

export type DeepRoute =
  | { kind: "screen"; screen: Screen }
  | { kind: "trip"; tripId: string }
  | { kind: "community-trip"; tripId: string }
  | { kind: "join"; code: string }

const SCREEN_ALIASES: Record<string, Screen> = {
  home: "home",
  explore: "explore",
  "create-trip": "create-trip",
  create: "create-trip",
  trips: "trips",
  "trip-overview": "trip-overview",
  itinerary: "itinerary",
  map: "map",
  budget: "budget",
  profile: "profile",
  "edit-profile": "edit-profile",
  "world-map": "world-map",
  worldmap: "world-map",
  "saved-places": "saved-places",
  notifications: "notifications",
  settings: "settings",
  "packing-list": "packing-list",
  currency: "currency",
  weather: "weather",
  collaborative: "collaborative",
  crew: "collaborative",
  "split-bills": "split-bills",
  bills: "split-bills",
  "crew-tracker": "crew-tracker",
  search: "search",
  "trip-social": "trip-social",
  community: "trip-social",
  chatbot: "chatbot",
  "trip-memories": "trip-memories",
  memories: "trip-memories",
}

/**
 * Parse a deep link into an in-app route. Accepts:
 * - trypo://trip/<id>, trypo://community/trip/<id>, trypo://join/<code>
 * - trypo://<screen> (e.g. trypo://world-map)
 * - https://trypo-app.vercel.app/... and https://trypo.app/... (same paths)
 * - ?screen=<name>&trip=<id> query params (push-notification style)
 */
export function parseDeepLink(raw: string | null | undefined): DeepRoute | null {
  if (!raw || typeof raw !== "string") return null
  let url: URL
  try {
    // Bare codes like "TRIP-AB12" pasted from a message still work.
    if (/^[A-Z0-9]{3,}-[A-Z0-9]{4}$/i.test(raw.trim())) {
      return { kind: "join", code: raw.trim().toUpperCase() }
    }
    url = new URL(raw.trim())
  } catch {
    return null
  }

  const params = url.searchParams
  const queryScreen = params.get("screen")
  if (queryScreen && SCREEN_ALIASES[queryScreen]) {
    return { kind: "screen", screen: SCREEN_ALIASES[queryScreen] }
  }
  const queryTrip = params.get("trip")
  if (queryTrip) return { kind: "trip", tripId: queryTrip }

  const segs = url.pathname.split("/").map((s) => s.trim()).filter(Boolean)

  // trypo://world-map style: host doubles as the first segment.
  if (url.protocol === "trypo:") {
    const hostSegs = url.hostname ? [url.hostname, ...segs] : segs
    return routeFromSegments(hostSegs)
  }
  return routeFromSegments(segs)
}

function routeFromSegments(segs: string[]): DeepRoute | null {
  if (segs.length === 0) return null
  const [first, second, third] = [segs[0]?.toLowerCase(), segs[1], segs[2]]
  if (first === "join" && second) return { kind: "join", code: second.toUpperCase() }
  if (first === "trip" && second) return { kind: "trip", tripId: second }
  if (first === "community" && second?.toLowerCase() === "trip" && third) {
    return { kind: "community-trip", tripId: third }
  }
  if (SCREEN_ALIASES[first]) return { kind: "screen", screen: SCREEN_ALIASES[first] }
  return null
}

const PENDING_JOIN_KEY = "trypo_pending_join_code"

/** Stash an invite code so TripsListScreen auto-opens the join sheet. */
export function stashPendingJoinCode(code: string): void {
  try {
    localStorage.setItem(PENDING_JOIN_KEY, code.trim().toUpperCase())
  } catch {}
}

/** Read + clear the stashed invite code (single use). */
export function consumePendingJoinCode(): string | null {
  try {
    const code = localStorage.getItem(PENDING_JOIN_KEY)
    if (code) localStorage.removeItem(PENDING_JOIN_KEY)
    return code
  } catch {
    return null
  }
}
