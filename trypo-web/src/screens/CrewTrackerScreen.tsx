import { useEffect, useMemo, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import type { Screen } from "../App"
import {
  getTripDetails,
  getTripMembers,
  getCurrentUserId,
  getCurrentAuthUser,
  type DbTripMember,
} from "../lib/trips"
import {
  fetchCrewLocations,
  subscribeToCrewLocations,
  locKey,
  useMyLocationShare,
  openInMaps,
  haversineMeters,
  formatDistance,
  formatEta,
  timeAgo,
  type CrewLocation,
} from "../lib/crewLocations"
import { resolveKnownCoords, geocodeCity } from "../lib/geocode"
import {
  configureMapbox,
  hasMapboxToken,
  MAPBOX_STYLES,
  applyMapTheme,
  mapboxForwardGeocode,
} from "../lib/mapbox"
import GoogleMapsPlacePicker from "../components/GoogleMapsPlacePicker"
import type { PlaceSearchResult } from "../lib/travelApi"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

type CrewPin = {
  key: string
  memberId: string
  name: string
  avatar: string
  color: string
  isMe: boolean
  isPending: boolean
  live: boolean
  awaiting: boolean
  lat: number
  lng: number
  updatedAt?: string
  locationName?: string | null
  accuracy?: number | null
  email?: string
}

const PALETTE = ["#3B41C8", "#06C4D4", "#FF6347", "#7C3AED", "#22C55E", "#F59E0B", "#EC4899"]

const DEFAULT_COORDS = { lat: 36.8065, lng: 10.1815 }

type MeetupSpot = {
  id: string
  name: string
  emoji: string
  type: string
  lat: number
  lng: number
  address?: string | null
}

/** Extract "[lat,lng]" pins saved in itinerary location_name (see MapScreen). */
function parseBracketCoords(locationName?: string | null): { lat: number; lng: number } | null {
  if (!locationName) return null
  const m = String(locationName).match(/\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null
  return { lat, lng }
}

function emojiForItemType(itemType?: string): string {
  if (itemType === "stay") return "🏨"
  if (itemType === "food") return "🍜"
  if (itemType === "activity") return "🎯"
  return "📍"
}

function labelForItemType(itemType?: string): string {
  if (itemType === "stay") return "Your stay"
  if (itemType === "food") return "Food spot"
  if (itemType === "activity") return "Activity"
  return "Trip place"
}

/** POI categories searched around the live position for meetup ideas. */
const NEARBY_QUERIES = [
  { q: "café", emoji: "☕", type: "Café" },
  { q: "restaurant", emoji: "🍜", type: "Restaurant" },
  { q: "hôtel", emoji: "🏨", type: "Hôtel" },
] as const

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function resolveCityCoords(city?: string): { lat: number; lng: number } | null {
  const clean = (city || "").trim()
  if (!clean) return null
  // Shared resolver: exact + French aliases + safe forward match.
  return resolveKnownCoords(clean)
}

/** DOM marker for a crew pin on the real Mapbox map. */
function createCrewMarkerEl(p: CrewPin, isSelected: boolean): HTMLDivElement {
  const wrapper = document.createElement("div")
  wrapper.style.position = "relative"
  wrapper.style.width = isSelected ? "48px" : "40px"
  wrapper.style.height = isSelected ? "48px" : "40px"
  wrapper.style.cursor = "pointer"
  wrapper.style.zIndex = isSelected ? "20" : "5"

  const pinColor = p.awaiting && !p.isPending ? "#64748b" : p.isPending ? "#94a3b8" : p.color
  const dot = document.createElement("div")
  dot.style.width = "100%"
  dot.style.height = "100%"
  dot.style.borderRadius = "50%"
  dot.style.background = pinColor
  dot.style.border = p.isMe ? "3px solid #fff" : "2.5px solid #fff"
  dot.style.boxShadow = isSelected
    ? `0 0 0 3px ${pinColor}55, 0 8px 20px rgba(0,0,0,0.5)`
    : "0 4px 12px rgba(0,0,0,0.45)"
  dot.style.display = "flex"
  dot.style.alignItems = "center"
  dot.style.justifyContent = "center"
  dot.style.color = "#fff"
  dot.style.fontWeight = "900"
  dot.style.fontSize = isSelected ? "17px" : "14px"
  dot.style.fontFamily = "'Plus Jakarta Sans', system-ui, sans-serif"
  dot.style.opacity = p.awaiting && !p.live ? "0.65" : "1"
  dot.textContent = (p.name.charAt(0) || "?").toUpperCase()
  wrapper.appendChild(dot)

  if (p.live) {
    const live = document.createElement("div")
    live.style.position = "absolute"
    live.style.right = "0px"
    live.style.bottom = "0px"
    live.style.width = "13px"
    live.style.height = "13px"
    live.style.borderRadius = "50%"
    live.style.background = "#4ade80"
    live.style.border = "2.5px solid #0a0c2e"
    live.style.boxShadow = "0 0 8px #4ade80"
    wrapper.appendChild(live)
  }
  return wrapper
}

/** Star pin for the selected meetup spot on the real map. */
function createMeetupMarkerEl(): HTMLDivElement {
  const wrapper = document.createElement("div")
  wrapper.style.width = "44px"
  wrapper.style.height = "44px"
  wrapper.style.borderRadius = "50%"
  wrapper.style.background = "linear-gradient(135deg, #7C3AED, #EC4899)"
  wrapper.style.border = "3px solid #fff"
  wrapper.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.4), 0 8px 20px rgba(0,0,0,0.5)"
  wrapper.style.display = "flex"
  wrapper.style.alignItems = "center"
  wrapper.style.justifyContent = "center"
  wrapper.style.fontSize = "20px"
  wrapper.textContent = "📌"
  return wrapper
}

function crewBounds(pins: CrewPin[]): [[number, number], [number, number]] | null {
  const pts = pins.filter(
    (p) => !p.isPending && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  )
  if (pts.length === 0) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const p of pts) {
    if (p.lng < minLng) minLng = p.lng
    if (p.lat < minLat) minLat = p.lat
    if (p.lng > maxLng) maxLng = p.lng
    if (p.lat > maxLat) maxLat = p.lat
  }
  if (minLng === maxLng && minLat === maxLat) {
    return [
      [minLng - 0.05, minLat - 0.05],
      [maxLng + 0.05, maxLat + 0.05],
    ]
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

export default function CrewTrackerScreen({ navigate, goBack }: Props) {
  const isDesktop = useIsDesktop()
  const [trip, setTrip] = useState<any>(null)
  const [members, setMembers] = useState<DbTripMember[]>([])
  const [locations, setLocations] = useState<Record<string, CrewLocation>>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [showMeetup, setShowMeetup] = useState(false)
  const [showPlacePicker, setShowPlacePicker] = useState(false)
  const [customSpots, setCustomSpots] = useState<MeetupSpot[]>([])
  const [selectedMeetupId, setSelectedMeetupId] = useState<string | null>(null)
  const [meetupNotice, setMeetupNotice] = useState<string | null>(null)
  const [sentPing, setSentPing] = useState<string[]>([])
  const [shareOn, setShareOn] = useState(false)
  const [now, setNow] = useState<number>(() => Date.now())

  const tripId = trip?.id as string | undefined
  const myLoc = useMyLocationShare(tripId, shareOn)

  const authUser = getCurrentAuthUser()
  const currentId = getCurrentUserId() ?? authUser?.id
  const currentEmail = (authUser?.email || "").toLowerCase().trim()

  const isMeMember = (m: DbTripMember): boolean =>
    Boolean(m.user_id && m.user_id === currentId) ||
    Boolean(m.email && m.email.toLowerCase().trim() === currentEmail)

  const seedLocations = (list: CrewLocation[]) => {
    setLocations((prev) => {
      const next = { ...prev }
      for (const loc of list) {
        const key = locKey(loc.userId, loc.deviceId)
        const existing = next[key]
        if (!existing || existing.updatedAt < loc.updatedAt) next[key] = loc
      }
      return next
    })
  }

  const locationForUser = (userId: string): CrewLocation | null => {
    let best: CrewLocation | null = null
    for (const loc of Object.values(locations)) {
      if (loc.userId !== userId) continue
      if (!best || best.updatedAt < loc.updatedAt) best = loc
    }
    return best
  }

  const applyLocation = (loc: CrewLocation) => {
    setLocations((prev) => {
      const key = locKey(loc.userId, loc.deviceId)
      const existing = prev[key]
      if (existing && existing.updatedAt >= loc.updatedAt) return prev
      return { ...prev, [key]: loc }
    })
  }

  useEffect(() => {
    let alive = true
    let unsubscribe: (() => void) | null = null

    const load = async () => {
      const t = await getTripDetails()
      if (!alive) return
      setTrip(t)
      const mems = await getTripMembers(t?.id)
      if (!alive) return
      setMembers(mems)
      if (t?.id) {
        const existing = await fetchCrewLocations(t.id)
        if (alive) seedLocations(existing)
        unsubscribe = subscribeToCrewLocations(t.id, (loc) => {
          if (alive) applyLocation(loc)
        })
      }
    }

    void load()

    const onDbChanged = () => {
      void load()
    }
    window.addEventListener("trypo:db_changed", onDbChanged)
    return () => {
      alive = false
      unsubscribe?.()
      window.removeEventListener("trypo:db_changed", onDbChanged)
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (myLoc.lastFix) applyLocation(myLoc.lastFix)
  }, [myLoc.lastFix])

  const anchor = useMemo(() => {
    const dest = trip?.trip_destinations?.[0]
    if (dest) {
      // Real GPS first (worldwide, exact) — known list only as fallback.
      if (Number.isFinite(Number(dest.lat)) && Number.isFinite(Number(dest.lng)) && Number(dest.lat) !== 0) {
        return { lat: Number(dest.lat), lng: Number(dest.lng) }
      }
      const cityCoords = resolveCityCoords(dest.city)
      if (cityCoords) return cityCoords
    }
    return DEFAULT_COORDS
  }, [trip])

  // Live-geocode the trip city when it isn't in the built-in list, so the
  // real map centres on the actual destination instead of the Tunis fallback.
  const [liveAnchor, setLiveAnchor] = useState<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    const city = String(trip?.trip_destinations?.[0]?.city || "").trim()
    if (!city) {
      setLiveAnchor(null)
      return
    }
    if (resolveKnownCoords(city)) {
      setLiveAnchor(null)
      return
    }
    let alive = true
    const firstToken = city.split(",")[0].trim()
    void (async () => {
      for (const q of firstToken !== city ? [firstToken, city] : [city]) {
        const res = await geocodeCity(q)
        if (alive && res && Number.isFinite(res.lat) && Number.isFinite(res.lng)) {
          setLiveAnchor({ lat: res.lat, lng: res.lng })
          return
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [trip])
  const mapAnchor = liveAnchor ?? anchor

  // Real Mapbox map refs.
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const meetupMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const mapLoadedRef = useRef(false)
  const pinsRef = useRef<CrewPin[]>([])
  const selectedKeyRef = useRef<string | null>(null)
  selectedKeyRef.current = selectedKey

  const pins = useMemo<CrewPin[]>(() => {
    const result: CrewPin[] = []
    const pending = members.filter((m) => !m.user_id || m.status === "pending")
    let colorIndex = 0

    for (const m of members) {
      if (m.user_id && m.status !== "pending") {
        const key = `user:${m.user_id}`
        const loc = locationForUser(m.user_id)
        const fresh = Boolean(loc && now - new Date(loc.updatedAt).getTime() < 3 * 60 * 1000)
        let lat = mapAnchor.lat
        let lng = mapAnchor.lng
        let live = false
        let awaiting = false

        if (fresh) {
          lat = loc.lat
          lng = loc.lng
          live = true
        } else {
          const jx = (hashStr(m.user_id + "x") % 100) / 4000
          const jy = (hashStr(m.user_id + "y") % 100) / 4000
          lat = mapAnchor.lat + jx
          lng = mapAnchor.lng + jy
          awaiting = true
        }

        result.push({
          key,
          memberId: m.id || m.user_id,
          name: m.name,
          avatar: m.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop",
          color: m.color || PALETTE[colorIndex % PALETTE.length],
          isMe: isMeMember(m),
          isPending: false,
          live,
          awaiting,
          lat,
          lng,
          updatedAt: loc?.updatedAt,
          locationName: loc?.locationName,
          accuracy: loc?.accuracy,
        })
        colorIndex++
      }
    }

    for (const m of pending) {
      result.push({
        key: `pending:${m.id || m.name}`,
        memberId: m.id || m.name,
        name: m.name,
        avatar: m.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop",
        color: "#94a3b8",
        isMe: isMeMember(m),
        isPending: true,
        live: false,
        awaiting: true,
        lat: mapAnchor.lat,
        lng: mapAnchor.lng,
        email: m.email,
      })
    }

    return result
  }, [members, locations, mapAnchor, now])

  pinsRef.current = pins

  // My live GPS when sharing (crew pin first, raw fix as fallback).
  const myLiveCoords = useMemo(() => {
    const me = pins.find((p) => p.isMe && p.live)
    if (me) return { lat: me.lat, lng: me.lng }
    const fix = myLoc.lastFix
    if (fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lng)) {
      return { lat: fix.lat, lng: fix.lng }
    }
    return null
  }, [pins, myLoc.lastFix])

  // Meetup suggestions built from where the crew actually is:
  // live GPS first, then the trip's own stays/places, then the destination.
  // Trip places are sorted nearest-first from my live position (trip centre
  // when not sharing) so the closest options are always on top.
  const suggestedSpots = useMemo<MeetupSpot[]>(() => {
    const spots: MeetupSpot[] = []
    const seen = new Set<string>()

    const push = (s: MeetupSpot) => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return
      const key = `${s.name.toLowerCase()}::${s.lat.toFixed(3)},${s.lng.toFixed(3)}`
      if (seen.has(key)) return
      seen.add(key)
      spots.push(s)
    }

    // 1. My live position (where *I* am right now).
    const me = pins.find((p) => p.isMe && p.live)
    if (me) {
      push({
        id: "me-live",
        name: "My live position",
        emoji: "📍",
        type: "You are here",
        lat: me.lat,
        lng: me.lng,
        address: me.locationName,
      })
    }

    // 2. Live crew midpoint (where the crew is on average).
    const livePins = pins.filter((p) => p.live && !p.isPending)
    if (livePins.length >= 2) {
      const avgLat = livePins.reduce((s, p) => s + p.lat, 0) / livePins.length
      const avgLng = livePins.reduce((s, p) => s + p.lng, 0) / livePins.length
      push({
        id: "crew-mid",
        name: "Crew midpoint",
        emoji: "👥",
        type: `${livePins.length} live nearby`,
        lat: avgLat,
        lng: avgLng,
      })
    } else if (livePins.length === 1 && !me) {
      const only = livePins[0]
      push({
        id: `crew-${only.key}`,
        name: `${only.name.split(" ")[0]}'s position`,
        emoji: "📍",
        type: "Crew live",
        lat: only.lat,
        lng: only.lng,
        address: only.locationName,
      })
    }

    // 3. The trip's own stays & saved places (real itinerary data).
    const items = Array.isArray(trip?.itinerary_items) ? trip.itinerary_items : []
    for (const item of items) {
      const coords = parseBracketCoords(item?.location_name)
      if (!coords) continue
      const title = String(item?.title || "Trip place").trim() || "Trip place"
      push({
        id: `stay:${item?.id || title}`,
        name: title,
        emoji: emojiForItemType(item?.item_type),
        type: labelForItemType(item?.item_type),
        lat: coords.lat,
        lng: coords.lng,
        address: String(item?.location_name || "").replace(/\s*\[.*\]$/, "") || null,
      })
      if (spots.length >= 8) break
    }

    // 4. Trip destinations with real GPS.
    const dests = Array.isArray(trip?.trip_destinations) ? trip.trip_destinations : []
    for (const d of dests) {
      const lat = Number(d?.lat)
      const lng = Number(d?.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) continue
      const city = String(d?.city || "Destination").trim() || "Destination"
      push({
        id: `dest:${d?.id || city}`,
        name: city,
        emoji: "🌟",
        type: String(d?.country || "Destination").replace(/\s*\[.*\]$/, ""),
        lat,
        lng,
      })
      if (spots.length >= 8) break
    }

    // 5. Destination centre fallback (where the trip is heading).
    const destCity = String(trip?.trip_destinations?.[0]?.city || "").trim()
    push({
      id: "trip-center",
      name: destCity || trip?.title || "Trip centre",
      emoji: "🌟",
      type: destCity ? `${destCity} centre` : "Trip area",
      lat: mapAnchor.lat,
      lng: mapAnchor.lng,
    })

    // Nearest-first: live pins stay pinned on top, everything else is
    // ordered by real distance from where I am (trip centre fallback).
    const ref = myLiveCoords ?? mapAnchor
    const distTo = (s: MeetupSpot) => haversineMeters(ref.lat, ref.lng, s.lat, s.lng)
    const head = spots.filter((s) => s.id === "me-live" || s.id === "crew-mid" || s.id.startsWith("crew-"))
    const tail = spots
      .filter((s) => !(s.id === "me-live" || s.id === "crew-mid" || s.id.startsWith("crew-")))
      .sort((a, b) => distTo(a) - distTo(b))
    return [...head, ...tail].slice(0, 8)
  }, [pins, trip, mapAnchor, myLiveCoords])

  // Real POIs around my live position (trip centre when not sharing).
  // Strictly limited to a small radius: bbox + POI-only + client-side
  // distance filter, because Mapbox `proximity` alone only biases results
  // and can return places kilometres away. Refetched whenever the modal
  // opens or the position moves.
  const [nearbySpots, setNearbySpots] = useState<MeetupSpot[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const nearbyCenter = myLiveCoords ?? { lat: mapAnchor.lat, lng: mapAnchor.lng }
  const nearbyCenterKey = `${nearbyCenter.lat.toFixed(3)},${nearbyCenter.lng.toFixed(3)}`

  useEffect(() => {
    if (!showMeetup) return
    if (!hasMapboxToken()) return
    let alive = true
    setNearbyLoading(true)
    void (async () => {
      try {
        const STRICT_KM = 2
        const lat = nearbyCenter.lat
        const lng = nearbyCenter.lng
        const dLat = STRICT_KM / 111.32
        const dLng = STRICT_KM / (111.32 * Math.max(0.3, Math.cos((lat * Math.PI) / 180)))
        const bbox: [number, number, number, number] = [lng - dLng, lat - dLat, lng + dLng, lat + dLat]
        const proximity = { lng, lat }

        // Pass 1 — strict: POIs inside the 2 km box only.
        const strict = await Promise.all(
          NEARBY_QUERIES.map((item) =>
            mapboxForwardGeocode(item.q, proximity, { bbox, types: "poi", limit: 10 }),
          ),
        )
        const seen = new Set<string>()
        const merged: MeetupSpot[] = []
        const distTo = (pLat: number, pLng: number) => haversineMeters(lat, lng, pLat, pLng)
        strict.forEach((list, qi) => {
          list.forEach((p) => {
            const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
            if (seen.has(key)) return
            // Belt and braces: the box is square, keep only true-radius hits.
            if (distTo(p.lat, p.lng) > STRICT_KM * 1000) return
            seen.add(key)
            merged.push({
              id: `nearby:${key}`,
              name: p.name,
              emoji: NEARBY_QUERIES[qi].emoji,
              type: NEARBY_QUERIES[qi].type,
              lat: p.lat,
              lng: p.lng,
              address: p.address,
            })
          })
        })

        // Pass 2 — top-up: sparse area (< 4 strict hits)? Widen without the
        // box but still POI-only, closest first (distances stay visible).
        if (merged.length < 4) {
          const wide = await Promise.all(
            NEARBY_QUERIES.map((item) =>
              mapboxForwardGeocode(item.q, proximity, { types: "poi", limit: 10 }),
            ),
          )
          wide.forEach((list, qi) => {
            list.forEach((p) => {
              const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
              if (seen.has(key)) return
              seen.add(key)
              merged.push({
                id: `nearby:${key}`,
                name: p.name,
                emoji: NEARBY_QUERIES[qi].emoji,
                type: NEARBY_QUERIES[qi].type,
                lat: p.lat,
                lng: p.lng,
                address: p.address,
              })
            })
          })
        }

        if (!alive) return
        merged.sort((a, b) => distTo(a.lat, a.lng) - distTo(b.lat, b.lng))
        setNearbySpots(merged.slice(0, 6))
      } catch {
        if (alive) setNearbySpots([])
      } finally {
        if (alive) setNearbyLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMeetup, nearbyCenterKey])

  const meetupSpots: MeetupSpot[] = useMemo(() => {
    const all = [...customSpots, ...nearbySpots, ...suggestedSpots]
    const seen = new Set<string>()
    return all.filter((s) => {
      const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [customSpots, nearbySpots, suggestedSpots])
  const selectedMeetup = selectedMeetupId
    ? meetupSpots.find((s) => s.id === selectedMeetupId) || null
    : null

  // Distance label for a meetup spot: from my live GPS when sharing.
  const meetupDist = (s: MeetupSpot): string => {
    const me = myLiveCoords
    if (me) {
      const m = haversineMeters(me.lat, me.lng, s.lat, s.lng)
      if (m < 60) return "You are here"
      return formatDistance(m)
    }
    return formatDistance(haversineMeters(mapAnchor.lat, mapAnchor.lng, s.lat, s.lng))
  }

  const chooseMeetup = (s: MeetupSpot) => {
    setSelectedMeetupId(s.id)
    setShowMeetup(false)
    setMeetupNotice(`📌 Meetup: ${s.name} — tap Open in Maps for directions`)
  }

  const addCustomMeetup = (place: PlaceSearchResult) => {
    const spot: MeetupSpot = {
      id: `custom:${place.lat.toFixed(5)},${place.lng.toFixed(5)}:${Date.now()}`,
      name: place.name,
      emoji: "📌",
      type: "Custom",
      lat: place.lat,
      lng: place.lng,
      address: place.address,
    }
    setCustomSpots((prev) => [spot, ...prev].slice(0, 10))
    setSelectedMeetupId(spot.id)
    setShowPlacePicker(false)
    setMeetupNotice(`📌 Meetup: ${place.name} — tap Open in Maps for directions`)
  }

  // Render the selected meetup star on the real map.
  const renderMeetupMarker = () => {
    const map = mapInstanceRef.current
    if (!map || !mapLoadedRef.current) return
    meetupMarkerRef.current?.remove()
    meetupMarkerRef.current = null
    if (!selectedMeetup) return
    if (!Number.isFinite(selectedMeetup.lat) || !Number.isFinite(selectedMeetup.lng)) return
    meetupMarkerRef.current = new mapboxgl.Marker({
      element: createMeetupMarkerEl(),
      anchor: "center",
    })
      .setLngLat([selectedMeetup.lng, selectedMeetup.lat])
      .addTo(map)
  }

  // Render crew markers on the real map.
  const renderCrewMarkers = () => {
    const map = mapInstanceRef.current
    if (!map || !mapLoadedRef.current) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    const list = pinsRef.current.filter((p) => !p.isPending)
    for (const p of list) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
      const isSel = selectedKeyRef.current === p.key
      const el = createCrewMarkerEl(p, isSel)
      el.addEventListener("click", (e) => {
        e.stopPropagation()
        setSelectedKey(isSel ? null : p.key)
        map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 13), duration: 800 })
      })
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([p.lng, p.lat])
        .addTo(map)
      markersRef.current.push(marker)
    }
  }

  // Init the real Mapbox map once.
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return
    if (!configureMapbox()) return
    const c = pinsRef.current.find((p) => p.live) ?? pinsRef.current[0]
    const center: [number, number] = c
      ? [c.lng, c.lat]
      : [mapAnchor.lng, mapAnchor.lat]
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAPBOX_STYLES.trypo,
      center,
      zoom: 12,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right")
    map.on("load", () => {
      mapLoadedRef.current = true
      map.resize()
      try {
        applyMapTheme(map, "trypo")
      } catch {
        // cosmetic only
      }
      renderCrewMarkers()
      renderMeetupMarker()
      const b = crewBounds(pinsRef.current)
      if (b) map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 0 })
      else map.setCenter(center)
    })
    mapInstanceRef.current = map
    const t1 = window.setTimeout(() => map.resize(), 100)
    const t2 = window.setTimeout(() => map.resize(), 400)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      meetupMarkerRef.current?.remove()
      meetupMarkerRef.current = null
      map.remove()
      mapInstanceRef.current = null
      mapLoadedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-centre when the trip destination changes (before pins load).
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !mapLoadedRef.current) return
    if (pinsRef.current.some((p) => p.live)) return
    map.flyTo({ center: [mapAnchor.lng, mapAnchor.lat], zoom: 12, duration: 800 })
  }, [mapAnchor])

  // Refresh markers + frame the crew whenever pins/selection change.
  useEffect(() => {
    renderCrewMarkers()
    renderMeetupMarker()
    const map = mapInstanceRef.current
    if (!map || !mapLoadedRef.current) return
    const b = crewBounds(pins)
    if (b) {
      try {
        map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 800 })
      } catch {
        // map mid-transition — markers already updated
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, selectedKey, selectedMeetupId])

  const mePin = pins.find((p) => p.isMe)

  const liveCount = pins.filter((p) => p.live).length
  const crewCount = pins.filter((p) => !p.isPending).length

  const selected = selectedKey ? pins.find((p) => p.key === selectedKey) || null : null

  const ping = (name: string) => {
    setSentPing((p) => [...p, name])
    setTimeout(() => setSentPing((p) => p.filter((n) => n !== name)), 3000)
  }

  const shortLoc = (p: CrewPin) => {
    if (p.locationName) return p.locationName
    if (p.live) return `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`
    return "Waiting for GPS…"
  }

  const distanceToMe = (p: CrewPin): number | null => {
    if (!mePin || mePin.awaiting) return null
    if (p.isPending) return null
    return haversineMeters(mePin.lat, mePin.lng, p.lat, p.lng)
  }

  const showDistance = Boolean(mePin && !mePin.awaiting)

  const renderSpotButton = (spot: MeetupSpot) => {
    const isSel = selectedMeetupId === spot.id
    return (
      <button
        key={spot.id}
        onClick={() => chooseMeetup(spot)}
        className="flex items-center gap-3 p-4 rounded-2xl text-left w-full"
        style={{
          background: isSel ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.06)",
          border: isSel
            ? "1px solid rgba(124,58,237,0.5)"
            : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: "rgba(59,65,200,0.2)" }}
        >
          {spot.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-[13px] truncate">{spot.name}</p>
          <p className="text-white/40 text-[11px] truncate">
            {spot.type} · {meetupDist(spot)}
          </p>
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" opacity="0.3" className="flex-shrink-0">
          <path
            d="M5 3l4 4-4 4"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    )
  }

  return (
    <div
      className="min-h-full flex flex-col"
      style={{
        background:
          "linear-gradient(170deg, #0a0c2e 0%, #0e1545 40%, #081428 100%)",
      }}
    >
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-4">
        <button
          onClick={() => goBack("collaborative")}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M11 14L6 9l5-5"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 className="text-white font-black text-[20px]">Find My Crew 📍</h1>
          <p className="text-white/40 text-[12px] truncate">
            {trip?.title || "Live crew tracker"} · {liveCount} live · {crewCount} crew
          </p>
        </div>
        <button
          onClick={() => setShowMeetup(true)}
          className="ml-auto px-3 py-1.5 rounded-full text-[11px] font-black flex-shrink-0"
          style={{ background: "rgba(6,196,212,0.2)", color: "#06C4D4" }}
        >
          📌 Meetup
        </button>
      </div>

      {/* Share my location — works in browser + APK (native GPS bridge) */}
      <div className="px-5 md:px-8 mb-4">
        <button
          onClick={() => {
            if (!tripId && !shareOn) return
            setShareOn((v) => !v)
          }}
          disabled={!tripId}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl text-[13px] font-black transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          style={{
            minHeight: "48px",
            padding: "12px 16px",
            background: myLoc.sharing
              ? "rgba(16,185,129,0.18)"
              : "rgba(255,255,255,0.07)",
            border: `1px solid ${myLoc.sharing ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.12)"}`,
            color: myLoc.sharing ? "#4ade80" : "white",
          }}
        >
          {!tripId ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-white/40" /> 📍 No active trip yet
            </span>
          ) : myLoc.starting && !myLoc.sharing ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Starting GPS…
            </span>
          ) : myLoc.sharing ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400" /> ● Sharing my location — tap to stop
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-white/40" /> 📍 Share my location
            </span>
          )}
        </button>
        {!tripId && (
          <p className="text-white/40 text-[11px] mt-2 text-center">
            Create or open a trip first — your live position is shared with that crew.
          </p>
        )}
      </div>

      {myLoc.error && (
        <div className="px-5 md:px-8 mb-3">
          <p className="text-[10px] font-bold text-amber-300/90 bg-amber-400/10 border border-amber-400/20 rounded-xl px-3 py-2">
            {myLoc.error}
          </p>
        </div>
      )}

      {/* Live map — real Mapbox streets (same engine as Globe & Itinéraire) */}
      <div className="px-5 md:px-8 mb-4">
        <div
          className="relative rounded-[26px] overflow-hidden"
          style={{
            height: isDesktop ? "520px" : "300px",
            background: "#F1F4FB",
            boxShadow:
              "0 16px 48px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
          {!hasMapboxToken() && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/95 p-6 text-center">
              <p className="text-slate-500 text-[12px] font-semibold">
                Clé Mapbox manquante. Ajoutez VITE_MAPBOX_ACCESS_TOKEN dans .env.local
                puis redémarrez.
              </p>
            </div>
          )}

          {/* Live badge */}
          <div
            className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{
              background: liveCount > 0 ? "rgba(16,185,129,0.2)" : "rgba(10,12,46,0.55)",
              border: `1px solid ${liveCount > 0 ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.25)"}`,
              backdropFilter: "blur(8px)",
            }}
          >
            {liveCount > 0 ? (
              <div
                className="w-2 h-2 rounded-full bg-green-400 animate-pulse"
                style={{ boxShadow: "0 0 6px #4ade80" }}
              />
            ) : (
              <div className="w-2 h-2 rounded-full bg-slate-400" />
            )}
            <span className={`text-[10px] font-black ${liveCount > 0 ? "text-green-400" : "text-slate-300"}`}>
              {liveCount > 0 ? `${liveCount} LIVE` : "LIVE"}
            </span>
          </div>

          {/* Recenter */}
          <button
            type="button"
            onClick={() => {
              const map = mapInstanceRef.current
              if (!map) return
              const b = crewBounds(pins)
              if (b) map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 800 })
              else map.flyTo({ center: [mapAnchor.lng, mapAnchor.lat], zoom: 12, duration: 800 })
            }}
            className="absolute top-3 left-3 rounded-2xl bg-white/95 text-navy px-2.5 py-1.5 text-[10px] font-black backdrop-blur-md border border-slate-100 flex items-center gap-1 transition-all active:scale-95"
            style={{ boxShadow: "0 4px 16px rgba(13,15,46,0.12)" }}
          >
            <span>🎯</span>
            <span>Recenter</span>
          </button>

          {/* Bottom label */}
          <div
            className="absolute bottom-3 left-3 rounded-2xl bg-white/95 backdrop-blur-md px-3 py-1.5 text-[10px] font-bold text-navy border border-slate-100"
            style={{ boxShadow: "0 4px 16px rgba(13,15,46,0.12)" }}
          >
            📍 {mapAnchor.lat.toFixed(3)}, {mapAnchor.lng.toFixed(3)}
          </div>
        </div>
      </div>

      {/* Crew list */}
      <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 mb-4" : "px-5 flex flex-col gap-2 mb-4"}>
        {pins.length === 0 && (
          <div
            className="bg-white/5 rounded-2xl p-4 text-center"
            style={{ border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-white/50 text-[12px]">
              Invite friends from the Trip Crew screen — they will appear here live.
            </p>
          </div>
        )}

        {pins.map((p) => {
          const isSelected = selectedKey === p.key
          const dist = distanceToMe(p)
          return (
            <button
              key={p.key}
              onClick={() => setSelectedKey(isSelected ? null : p.key)}
              className="w-full bg-white/5 rounded-2xl p-3 flex items-center gap-3 text-left"
              style={{
                border: isSelected
                  ? `1px solid ${p.color}50`
                  : "1px solid rgba(255,255,255,0.06)",
                background: isSelected ? `${p.color}12` : "rgba(255,255,255,0.04)",
              }}
            >
              <div className="relative flex-shrink-0">
                <img
                  src={p.avatar}
                  className="w-10 h-10 rounded-full object-cover"
                  alt=""
                  style={{ border: `2px solid ${p.color}` }}
                />
                {p.isPending ? (
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-slate-400"
                    style={{ border: "1.5px solid #0a0c2e" }}
                  />
                ) : p.live ? (
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 animate-pulse"
                    style={{ border: "1.5px solid #0a0c2e", boxShadow: "0 0 6px #4ade80" }}
                  />
                ) : (
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400"
                    style={{ border: "1.5px solid #0a0c2e" }}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-white font-bold text-[13px] truncate">{p.name}</p>
                  {p.isMe && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: `${p.color}25`, color: p.color }}>
                      You
                    </span>
                  )}
                  {p.live && <span className="text-[8px] font-black text-green-400">●</span>}
                </div>
                <p className="text-white/40 text-[10px] truncate">
                  {p.isPending
                    ? `Invitation sent · ${p.email || "not joined yet"}`
                    : p.live
                      ? `📍 ${shortLoc(p)} · updated ${timeAgo(p.updatedAt, now)}`
                      : "Waiting for first location…"}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {p.isPending ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300">
                    Invited
                  </span>
                ) : p.isMe ? (
                  <>
                    <span className="text-[10px] font-bold" style={{ color: p.color }}>
                      You
                    </span>
                    <span className="text-[9px] text-white/40">
                      {p.live ? `updated ${timeAgo(p.updatedAt, now)}` : "no fix yet"}
                    </span>
                  </>
                ) : p.live ? (
                  <>
                    <span className="text-[11px] font-black" style={{ color: p.color }}>
                      {dist != null ? formatDistance(dist) : "—"}
                    </span>
                    <span className="text-[9px] text-white/40">
                      {dist != null ? formatEta(dist) : shortLoc(p)}
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] font-bold text-white/30">No fix</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Selected member — live details + open in maps */}
      {selected && !selected.isPending && (
        <div className="px-5 md:px-8 mb-4">
          <div
            className="rounded-[22px] p-4"
            style={{
              background: `${selected.color}15`,
              border: `1px solid ${selected.color}30`,
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <img
                src={selected.avatar}
                className="w-11 h-11 rounded-full object-cover"
                alt=""
                style={{ border: `2px solid ${selected.color}` }}
              />
              <div className="min-w-0">
                <p className="text-white font-black text-[15px]">
                  Get to {selected.name.split(" ")[0]}
                </p>
                <p className="text-white/40 text-[11px]">
{distanceToMe(selected) != null && showDistance
                      ? `${formatDistance(distanceToMe(selected)!)} · ${formatEta(distanceToMe(selected)!)}`
                      : selected.live
                        ? "Live GPS tracking"
                        : "Waiting for location"}
                </p>
              </div>
              <button
                onClick={() => ping(selected.name)}
                className="ml-auto px-3 py-1.5 rounded-full text-[11px] font-black flex-shrink-0"
                style={{
                  background: sentPing.includes(selected.name)
                    ? "rgba(16,185,129,0.2)"
                    : `${selected.color}30`,
                  color: sentPing.includes(selected.name) ? "#4ade80" : selected.color,
                }}
              >
                {sentPing.includes(selected.name) ? "✓ Pinged!" : "📳 Ping"}
              </button>
            </div>

            <div className="flex flex-col gap-2 mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[12px]"
                  style={{ background: `${selected.color}30` }}
                >
                  📍
                </div>
                <p className="text-white/70 text-[12px] leading-snug">
                  {selected.live
                    ? `Live position ${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`
                    : `Last known near ${mapAnchor.lat.toFixed(3)}, ${mapAnchor.lng.toFixed(3)}`}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[12px]"
                  style={{ background: `${selected.color}30` }}
                >
                  ⏱
                </div>
                <p className="text-white/70 text-[12px] leading-snug">
{selected.live
                      ? `Updated ${timeAgo(selected.updatedAt, now)}${selected.accuracy ? ` · ±${Math.round(selected.accuracy)} m` : ""}`
                      : "Pin goes live as soon as this member shares their location"}
                </p>
              </div>
            </div>

            {selected.live && (
              <div className="flex items-center gap-1.5 mb-3 rounded-xl px-3 py-2 bg-green-400/10 border border-green-400/20">
                <div className="w-2 h-2 rounded-full bg-green-400" style={{ boxShadow: "0 0 6px #4ade80" }} />
                <span className="text-green-300 text-[10px] font-bold">
                  Live location — pin moves as {selected.name.split(" ")[0]} moves
                </span>
              </div>
            )}

            <button
              onClick={() => openInMaps(selected.lat, selected.lng, selected.name)}
              className="w-full py-3 rounded-xl text-white font-black text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-transform cursor-pointer"
              style={{
                background: `linear-gradient(135deg, ${selected.color}, #06C4D4)`,
                boxShadow: `0 8px 24px ${selected.color}30`,
              }}
            >
              <span>🗺</span>
              <span>Open in Maps →</span>
            </button>
          </div>
        </div>
      )}

      {/* Selected pending member */}
      {selected?.isPending && (
        <div className="px-5 md:px-8 mb-4">
          <div
            className="rounded-[22px] p-4"
            style={{ background: "rgba(148,163,184,0.12)", border: "1px solid rgba(148,163,184,0.25)" }}
          >
            <p className="text-white font-black text-[15px] mb-1">
              {selected.name} is not in the crew yet
            </p>
            <p className="text-white/40 text-[11px] mb-3">
              {selected.email
                ? `We sent the invite to ${selected.email}. Once they join the trip, their live location appears here.`
                : "This invite has not been accepted yet. Their live location will appear as soon as they join."}
            </p>
            <button
              onClick={() => openInMaps(mapAnchor.lat, mapAnchor.lng, trip?.title || "Trip")}
              className="w-full py-3 rounded-xl bg-white/10 text-white font-black text-[13px] active:scale-95 transition-transform cursor-pointer"
            >
              Where is the trip? Open in Maps →
            </button>
          </div>
        </div>
      )}

      {/* Chosen meetup — directions for the whole crew */}
      {selectedMeetup && (
        <div className="px-5 md:px-8 mb-4">
          <div
            className="rounded-[22px] p-4"
            style={{
              background: "rgba(124,58,237,0.14)",
              border: "1px solid rgba(124,58,237,0.35)",
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: "rgba(124,58,237,0.25)" }}
              >
                {selectedMeetup.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-black text-[15px] truncate">
                  📌 {selectedMeetup.name}
                </p>
                <p className="text-white/40 text-[11px] truncate">
                  {selectedMeetup.type} · {meetupDist(selectedMeetup)}
                  {selectedMeetup.address ? ` · ${selectedMeetup.address}` : ""}
                </p>
              </div>
              <button
                onClick={() => setSelectedMeetupId(null)}
                className="text-white/30 text-xl leading-none flex-shrink-0 px-1"
              >
                ×
              </button>
            </div>
            <button
              onClick={() => openInMaps(selectedMeetup.lat, selectedMeetup.lng, selectedMeetup.name)}
              className="w-full py-3 rounded-xl text-white font-black text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-transform cursor-pointer"
              style={{
                background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                boxShadow: "0 8px 24px rgba(124,58,237,0.3)",
              }}
            >
              <span>🗺</span>
              <span>Meet here — Open in Maps →</span>
            </button>
          </div>
        </div>
      )}

      {meetupNotice && !selectedMeetup && (
        <div className="px-5 md:px-8 mb-4">
          <p className="text-[10px] font-bold text-purple-300/90 bg-purple-400/10 border border-purple-400/20 rounded-xl px-3 py-2">
            {meetupNotice}
          </p>
        </div>
      )}

      {/* Meetup modal — live spots from where the crew is */}
      {showMeetup && !showPlacePicker && (
        <div
          className="absolute inset-0 flex items-end"
          style={{
            zIndex: 100,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="w-full rounded-t-[32px] p-6 pb-10 max-h-[85%] overflow-y-auto" style={{ background: "#0e1545" }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-black text-[18px]">Set Meetup Spot 📌</h3>
              <button onClick={() => setShowMeetup(false)} className="text-white/30 text-2xl leading-none">
                ×
              </button>
            </div>
            <p className="text-white/40 text-[12px] mb-4">
              {myLiveCoords
                ? "Places near your live position + this trip's stays. Everyone gets directions to the spot you pick."
                : "Share your location to get places near you — showing the trip area for now."}
            </p>
            {customSpots.length > 0 && (
              <div className="flex flex-col gap-2 mb-5">
                {customSpots.map(renderSpotButton)}
              </div>
            )}
            <p className="text-white/50 text-[10px] font-black uppercase tracking-wider mb-2">
              {myLiveCoords ? "📍 Near you · within 2 km" : "📍 Near trip area · within 2 km"}
            </p>
            <div className="flex flex-col gap-2 mb-5">
              {nearbyLoading && nearbySpots.length === 0 && (
                <p className="text-white/40 text-[12px] text-center py-3 animate-pulse">
                  Searching places near you…
                </p>
              )}
              {!nearbyLoading && nearbySpots.length === 0 && (
                <p className="text-white/40 text-[12px] text-center py-3">
                  No nearby places found — try a custom location below.
                </p>
              )}
              {nearbySpots.map(renderSpotButton)}
            </div>
            <p className="text-white/50 text-[10px] font-black uppercase tracking-wider mb-2">
              🧳 Trip places · nearest first
            </p>
            <div className="flex flex-col gap-2 mb-5">
              {suggestedSpots.length === 0 && (
                <p className="text-white/40 text-[12px] text-center py-3">
                  No trip places yet.
                </p>
              )}
              {suggestedSpots.map(renderSpotButton)}
            </div>
            <button
              onClick={() => setShowPlacePicker(true)}
              className="w-full py-3.5 rounded-2xl text-white font-black text-[14px] active:scale-95 transition-transform cursor-pointer"
              style={{
                background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
              }}
            >
              + Custom Location
            </button>
          </div>
        </div>
      )}

      {/* Custom location picker — real search + tap-the-map */}
      {showPlacePicker && (
        <div
          className="absolute inset-0 flex items-end"
          style={{
            zIndex: 200,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="w-full max-h-[92%] overflow-y-auto rounded-t-[32px] p-4 pb-8" style={{ background: "#0e1545" }}>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-white font-black text-[16px]">Pick a meetup place 📌</h3>
              <button onClick={() => setShowPlacePicker(false)} className="text-white/30 text-2xl leading-none px-1">
                ×
              </button>
            </div>
            <GoogleMapsPlacePicker
              cityContext={String(trip?.trip_destinations?.[0]?.city || "Paris")}
              initialCenter={myLiveCoords ?? undefined}
              initialQuery={myLiveCoords ? "café" : undefined}
              placeType="place"
              simple
              onSelectPlace={addCustomMeetup}
              onClose={() => setShowPlacePicker(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}