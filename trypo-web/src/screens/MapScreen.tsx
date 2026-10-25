import { useEffect, useState, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import type { Screen } from "../App"
import { getDestinationStayDays, getTripDetails } from "../lib/trips"
import {
  resolveKnownCoords,
  resolveCityCoordsLive,
  type KnownCoords,
} from "../lib/geocode"
import {
  configureMapbox,
  hasMapboxToken,
  MAPBOX_STYLES,
  applyMapTheme,
  type MapboxStyleKey,
} from "../lib/mapbox"
import { openInMaps } from "../lib/crewLocations"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

type Stop = {
  id: string
  index: number
  city: string
  country: string
  dates: string
  nights: number
  emoji: string
  color: string
  lat: number
  lng: number
  highlights: string[]
}

type SavedPlace = {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  dates: string
}

const ROUTE_COLOR = "#3B41C8"

/* Mockup shadow / glass tokens (not part of the Tailwind theme). */
const SUBTLE_SHADOW = "0 2px 10px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)"
const FLOAT_SHADOW = "0 12px 32px -4px rgba(15, 23, 42, 0.12), 0 4px 12px -2px rgba(15, 23, 42, 0.06)"
const GLOW_SHADOW = "0 0 20px -3px rgba(59, 130, 246, 0.5)"
const GLASS_SURFACE = {
  background: "rgba(255, 255, 255, 0.88)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
}

/** Tunis fallback used only when a city can't be resolved at all (offline). */
const LAST_RESORT: KnownCoords = {
  lat: 36.8065,
  lng: 10.1815,
  country: "Europe 🌍",
  emoji: "📍",
}

function resolveCoordinates(city: string, index: number): { lat: number; lng: number; country: string; emoji: string; isFallback: boolean } {
  const cleanCity = (city || "").trim()
  if (!cleanCity) return { ...LAST_RESORT, isFallback: true }
  // Shared resolver: exact + alias + safe forward match. Never Paris by
  // accident — unknown cities are live-geocoded (see enhanceStopsWithGeocode).
  const known = resolveKnownCoords(cleanCity)
  if (known) return { ...known, isFallback: false }
  // Try the part before any ", Country" suffix ("Madrid, Espagne" -> Madrid).
  const firstToken = cleanCity.split(",")[0].trim()
  if (firstToken && firstToken !== cleanCity) {
    const knownToken = resolveKnownCoords(firstToken)
    if (knownToken) return { ...knownToken, isFallback: false }
  }
  return { ...LAST_RESORT, isFallback: true }
}

/** True when a pin is sitting on the generic fallback (needs live geocode). */
function isFallbackPin(lat: number, lng: number): boolean {
  return Math.abs(lat - LAST_RESORT.lat) < 0.001 && Math.abs(lng - LAST_RESORT.lng) < 0.001
}

/** Finite-number guard so NaN/0/undefined never become a pin position. */
function finiteOr(value: unknown, fallback: number): number {
  const n = typeof value === "string" && value.trim() === "" ? NaN : Number(value)
  return Number.isFinite(n) && n !== 0 ? n : fallback
}

/**
 * Live-geocode stops that aren't in the built-in list (any city worldwide)
 * plus any stop currently sitting on the generic fallback pin. Each stop is
 * resolved INDEPENDENTLY (own query, own cache key) so a 2-stop trip like
 * Barcelone → Madrid can never inherit the first stop's coordinates.
 * Mutates nothing server-side — just corrects pin positions in state.
 * Returns the enhanced stops, or null when nothing changed.
 */
export async function enhanceStopsWithGeocode(current: Stop[]): Promise<Stop[] | null> {
  let changed = false
  const next = await Promise.all(
    current.map(async (stop) => {
      const known = resolveKnownCoords(stop.city)
      const onFallback = isFallbackPin(stop.lat, stop.lng)
      // Known city already pinned at its real coords → nothing to do.
      // But a stale wrong pin (Pai→Indonesia, >100km from Pai, Thailand)
      // is corrected immediately without network.
      if (known && !onFallback) {
        try {
          const dist = calculateDistanceKm(stop.lat, stop.lng, known.lat, known.lng)
          if (Number.isFinite(dist) && dist > 100) {
            changed = true
            return { ...stop, lat: known.lat, lng: known.lng, country: stop.country && stop.country !== "Destination" ? stop.country : known.country }
          }
        } catch {
          /* fall through to live */
        }
        return stop
      }
      // Try the part before any ", Country" suffix first — Open-Meteo
      // returns nothing for "Madrid, Espagne" but Madrid alone works.
      // Universal resolver: Mapbox first, Open-Meteo best-pick second —
      // works for every city/ville worldwide, not just the built-in list.
      const firstToken = String(stop.city || "").split(",")[0].trim()
      const queries = firstToken && firstToken !== stop.city
        ? [firstToken, stop.city]
        : [stop.city]
      for (const q of queries) {
        const live = await resolveCityCoordsLive(q)
        if (live && Number.isFinite(live.lat) && Number.isFinite(live.lng)) {
          changed = true
          return {
            ...stop,
            lat: live.lat,
            lng: live.lng,
            country: live.country ? live.country : stop.country,
          }
        }
      }
      return stop
    }),
  )
  return changed ? next : null
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

const buildRouteStops = (route: any[] = []): Stop[] => {
  const safeRoute = Array.isArray(route) ? route : []
  if (safeRoute.length === 0) return []

  return safeRoute.map((stop, index) => {
    const cityName = String(stop.city || `Stop ${index + 1}`).trim()
    const resolved = resolveCoordinates(cityName, index)
    const nightsVal = getDestinationStayDays(stop)
    // Real GPS from trip creation wins — but only when it is a real finite
    // number. NaN/0/"" fall back to name resolution so a missing second
    // stop never inherits (0,0) or the first stop's pin.
    let lat = finiteOr(stop.lat, resolved.lat)
    let lng = finiteOr(stop.lng, resolved.lng)
    // Self-heal stale wrong GPS (e.g. "Pai" stored as Pai, Indonesia before
    // the homonym fix): when the stored pin is >100km from the known city,
    // trust the known coords so Bangkok → Pai stays inside Thailand.
    if (!resolved.isFallback && Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng))) {
      try {
        const dist = calculateDistanceKm(Number(stop.lat), Number(stop.lng), resolved.lat, resolved.lng)
        if (Number.isFinite(dist) && dist > 100) {
          lat = resolved.lat
          lng = resolved.lng
        }
      } catch {
        /* keep stored */
      }
    }

    return {
      id: String(stop.id ?? `stop-${index + 1}`),
      index: index + 1,
      city: cityName,
      country: stop.country && stop.country !== "Destination" ? stop.country : resolved.country,
      dates: stop.dates && stop.dates !== "Dates TBD" ? stop.dates : `Jour ${index + 1}`,
      nights: Number.isFinite(nightsVal) && nightsVal > 0 ? nightsVal : 1,
      emoji: stop.emoji || resolved.emoji,
      color: ROUTE_COLOR,
      lat,
      lng,
      highlights: Array.isArray(stop.highlights) && stop.highlights.length > 0
        ? stop.highlights
        : ["Étape planifiée", "Itinéraire Trypo", "Lieu d'intérêt"],
    }
  })
}

const readRouteStops = async (): Promise<Stop[]> => {
  try {
    const tripData = await getTripDetails()
    const destinations = tripData?.trip_destinations || []
    if (Array.isArray(destinations) && destinations.length > 0) {
      return buildRouteStops(
        destinations
          .slice()
          .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
          .map((destination: any, index: number) => ({
            id: destination.id ?? `dest-${index + 1}`,
            city: destination.city,
            country: destination.country,
            dates: [destination.arrival_date, destination.departure_date].filter(Boolean).join(" – ") || `Jour ${index + 1}`,
            days: getDestinationStayDays(destination),
            emoji: "📍",
            // Real GPS from trip creation wins over name resolution.
            lat: Number(destination.lat),
            lng: Number(destination.lng),
          }))
      )
    }
  } catch (error) {
    console.warn("Failed to load trip destinations from Supabase", error)
  }

  if (typeof window === "undefined") return []

  try {
    const saved = window.localStorage.getItem("trypo-route-stops-v1")
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return buildRouteStops(parsed)
      }
    }
  } catch (error) {
    console.warn("Failed to read route data for map", error)
  }

  // Default fallback stops for demo if no route exists
  return buildRouteStops([
    { city: "Paris", nights: 2 },
    { city: "Lyon", nights: 1 },
    { city: "Marseille", nights: 2 },
    { city: "Nice", nights: 2 },
  ])
}

const readSavedPlaces = async (): Promise<SavedPlace[]> => {
  try {
    const tripData = await getTripDetails()
    return (tripData?.itinerary_items || [])
      .filter((item: any) => item.item_type === "stay" && item.location_name)
      .map((item: any) => {
        const match = String(item.location_name).match(/\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/)
        if (!match) return null
        return {
          id: item.id,
          name: item.title,
          address: String(item.location_name).replace(/\s*\[.*\]$/, ""),
          lat: Number(match[1]),
          lng: Number(match[2]),
          dates: item.starts_at ? new Date(item.starts_at).toLocaleDateString() : "Séjour prévu",
        }
      })
      .filter(Boolean) as SavedPlace[]
  } catch {
    return []
  }
}

function createPinElement(stop: Stop, isSelected: boolean): HTMLDivElement {
  // 1. Outer wrapper container: Mapbox manages its transform/translate positioning
  const wrapper = document.createElement("div")
  wrapper.className = "trypo-map-marker-wrapper"
  wrapper.style.display = "flex"
  wrapper.style.alignItems = "center"
  wrapper.style.justifyContent = "center"
  wrapper.style.cursor = "pointer"
  wrapper.style.zIndex = isSelected ? "20" : "5"
  wrapper.style.width = isSelected ? "36px" : "30px"
  wrapper.style.height = isSelected ? "36px" : "30px"

  // 2. Inner circular badge: safely handles all hover scaling, shadows, and styling
  const pin = document.createElement("div")
  pin.className = "trypo-map-pin"
  pin.style.display = "flex"
  pin.style.alignItems = "center"
  pin.style.justifyContent = "center"
  pin.style.width = isSelected ? "32px" : "26px"
  pin.style.height = isSelected ? "32px" : "26px"
  pin.style.borderRadius = "50%"
  pin.style.background = isSelected
    ? "linear-gradient(135deg, #3B41C8 0%, #06C4D4 100%)"
    : "linear-gradient(135deg, #3B41C8 0%, #06C4D4 100%)"
  pin.style.color = "#FFFFFF"
  pin.style.fontFamily = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
  pin.style.fontWeight = "700"
  pin.style.fontSize = isSelected ? "13px" : "11.5px"
  pin.style.lineHeight = "1"
  pin.style.border = "2.5px solid #FFFFFF"
  pin.style.boxShadow = isSelected
    ? "0 0 0 3px rgba(255, 255, 255, 0.95), 0 0 0 6px rgba(6, 196, 212, 0.45), 0 10px 22px rgba(59, 65, 200, 0.4)"
    : "0 4px 12px rgba(59, 65, 200, 0.35), 0 0 0 1px rgba(59, 65, 200, 0.12)"
  pin.style.transition = "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease"
  pin.style.userSelect = "none"
  pin.textContent = String(stop.index)

  wrapper.onmouseenter = () => {
    pin.style.transform = isSelected ? "scale(1.08)" : "scale(1.18)"
    pin.style.boxShadow = isSelected
      ? "0 0 0 3px rgba(255, 255, 255, 0.95), 0 0 0 7px rgba(6, 196, 212, 0.55), 0 12px 26px rgba(59, 65, 200, 0.45)"
      : "0 6px 14px rgba(59, 65, 200, 0.45), 0 0 0 2px rgba(6, 196, 212, 0.35)"
    wrapper.style.zIndex = "30"
  }
  wrapper.onmouseleave = () => {
    pin.style.transform = "scale(1)"
    pin.style.boxShadow = isSelected
      ? "0 0 0 3px rgba(255, 255, 255, 0.95), 0 0 0 6px rgba(6, 196, 212, 0.45), 0 10px 22px rgba(59, 65, 200, 0.4)"
      : "0 4px 12px rgba(59, 65, 200, 0.35), 0 0 0 1px rgba(59, 65, 200, 0.12)"
    wrapper.style.zIndex = isSelected ? "20" : "5"
  }

  wrapper.appendChild(pin)
  return wrapper
}

function routeBounds(stops: Stop[]): [[number, number], [number, number]] | null {
  if (stops.length === 0) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const s of stops) {
    if (s.lng < minLng) minLng = s.lng
    if (s.lat < minLat) minLat = s.lat
    if (s.lng > maxLng) maxLng = s.lng
    if (s.lat > maxLat) maxLat = s.lat
  }
  // Pad single-point routes so fitBounds doesn't over-zoom
  if (minLng === maxLng && minLat === maxLat) {
    return [
      [minLng - 0.5, minLat - 0.5],
      [maxLng + 0.5, maxLat + 0.5],
    ]
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

export default function MapScreen({ goBack }: Props) {
  const isDesktop = useIsDesktop()
  const [stops, setStops] = useState<Stop[]>([])
  const [selected, setSelected] = useState<Stop | null>(null)
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([])
  const [layerType, setLayerType] = useState<MapboxStyleKey>("trypo")

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const selectedRef = useRef<Stop | null>(null)
  const stopsRef = useRef<Stop[]>([])
  const mapLoadedRef = useRef(false)
  const layerTypeRef = useRef<MapboxStyleKey>("trypo")
  const touchStartX = useRef(0)
  layerTypeRef.current = layerType

  selectedRef.current = selected
  stopsRef.current = stops

  // Load stops & places on mount and sync
  useEffect(() => {
    let alive = true
    const sync = async () => {
      const s = await readRouteStops()
      if (!alive) return
      setStops(s)
      if (s.length > 0) setSelected(s[0])
      const places = await readSavedPlaces()
      if (!alive) return
      setSavedPlaces(places)
      // Correct pins for cities outside the built-in list (worldwide).
      const enhanced = await enhanceStopsWithGeocode(s)
      if (!alive || !enhanced) return
      setStops(enhanced)
      setSelected((prev) => enhanced.find((st) => st.id === prev?.id) ?? enhanced[0] ?? null)
    }

    void sync()

    const handleRouteSync = () => {
      void sync()
    }

    window.addEventListener("trypo-route-sync", handleRouteSync)
    window.addEventListener("storage", handleRouteSync)

    return () => {
      alive = false
      window.removeEventListener("trypo-route-sync", handleRouteSync)
      window.removeEventListener("storage", handleRouteSync)
    }
  }, [])

  const ensureRouteLayers = (map: mapboxgl.Map, currentStops: Stop[]) => {
    const coords = currentStops.map((s) => [s.lng, s.lat])
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features:
        coords.length >= 2
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: coords },
              },
            ]
          : [],
    }
    const source = map.getSource("trypo-route") as mapboxgl.GeoJSONSource | undefined
    if (source) {
      source.setData(geojson)
      return
    }
    map.addSource("trypo-route", { type: "geojson", data: geojson })
    map.addLayer({
      id: "trypo-route-glow",
      type: "line",
      source: "trypo-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#06C4D4", "line-width": 10, "line-opacity": 0.22 },
    })
    // Crisp white casing so the route pops on the light basemap.
    map.addLayer({
      id: "trypo-route-casing",
      type: "line",
      source: "trypo-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.95 },
    })
    map.addLayer({
      id: "trypo-route-main",
      type: "line",
      source: "trypo-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#464DE0",
        "line-width": 4,
        "line-opacity": 1,
      },
    })
  }

  const renderMarkers = () => {
    const map = mapInstanceRef.current
    if (!map || !mapLoadedRef.current) return
    const currentStops = stopsRef.current
    const currentSelected = selectedRef.current

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    currentStops.forEach((stop) => {
      const isSel = currentSelected?.id === stop.id
      const el = createPinElement(stop, isSel)
      el.addEventListener("click", (e) => {
        e.stopPropagation()
        setSelected(stop)
        map.flyTo({ center: [stop.lng, stop.lat], zoom: 13, duration: 1200 })
      })
      const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:130px;padding:3px 2px;">` +
          `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">` +
          `<span style="font-size:15px;">${stop.emoji}</span>` +
          `<b style="color:#0D0F2E;font-size:13px;font-weight:700;">${stop.city}</b></div>` +
          `<p style="font-size:11px;color:#64748b;margin:0 0 5px 0;">${stop.country} • ${stop.nights} nuit${stop.nights > 1 ? "s" : ""}</p>` +
          `<div style="display:flex;align-items:center;gap:5px;">` +
          `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#3B41C8;color:white;font-size:10px;font-weight:700;">${stop.index}</span>` +
          `<span style="font-size:11px;font-weight:700;color:#3B41C8;">Étape ${stop.index}</span>` +
          `</div></div>`
      )
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([stop.lng, stop.lat])
        .setPopup(popup)
        .addTo(map)
      markersRef.current.push(marker)
    })
  }

  // Initialize Mapbox map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return
    if (!configureMapbox()) return

    const initial =
      stopsRef.current.length > 0
        ? stopsRef.current[0]
        : { lng: 2.3522, lat: 48.8566 }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAPBOX_STYLES[layerType],
      center: [initial.lng, initial.lat],
      zoom: 5,
      attributionControl: false,
    })
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right"
    )

    map.on("load", () => {
      mapLoadedRef.current = true
      map.resize()
      applyMapTheme(map, layerTypeRef.current)
      ensureRouteLayers(map, stopsRef.current)
      renderMarkers()
      const b = routeBounds(stopsRef.current)
      if (b) map.fitBounds(b, { padding: 50, maxZoom: 14, duration: 0 })
    })

    // Re-apply route source after style switches (setStyle drops custom sources)
    map.on("style.load", () => {
      mapLoadedRef.current = true
      applyMapTheme(map, layerTypeRef.current)
      ensureRouteLayers(map, stopsRef.current)
      renderMarkers()
    })

    mapInstanceRef.current = map

    const t1 = setTimeout(() => map.resize(), 100)
    const t2 = setTimeout(() => map.resize(), 300)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      map.remove()
      mapInstanceRef.current = null
      mapLoadedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update Mapbox style on layerType switch
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    map.setStyle(MAPBOX_STYLES[layerType])
  }, [layerType])

  // Update markers & route when stops or selected changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !mapLoadedRef.current) return
    try {
      ensureRouteLayers(map, stops)
    } catch {
      // style may still be loading — style.load handler will re-apply
    }
    renderMarkers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, selected, savedPlaces])

  // Helper to format dates cleanly (e.g. 20 – 23 déc. 2026 instead of 2026-12-20 – 2026-12-23)
  const formatStopDates = (dates: string): string => {
    if (!dates || dates.startsWith("Jour")) return dates || ""
    const dateMatches = dates.match(/\d{4}-\d{2}-\d{2}/g)
    if (dateMatches && dateMatches.length >= 2) {
      try {
        const d1 = new Date(dateMatches[0])
        const d2 = new Date(dateMatches[1])
        const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
        if (d1.getFullYear() === d2.getFullYear()) {
          if (d1.getMonth() === d2.getMonth()) {
            return `${d1.getDate()} – ${d2.getDate()} ${months[d1.getMonth()]} ${d1.getFullYear()}`
          }
          return `${d1.getDate()} ${months[d1.getMonth()]} – ${d2.getDate()} ${months[d2.getMonth()]} ${d1.getFullYear()}`
        }
        return `${d1.getDate()} ${months[d1.getMonth()]} ${d1.getFullYear()} – ${d2.getDate()} ${months[d2.getMonth()]} ${d2.getFullYear()}`
      } catch {
        return dates
      }
    }
    return dates
  }

  const splitCountryAndCode = (countryStr: string): { name: string; code: string | null } => {
    if (!countryStr) return { name: "", code: null }
    const match = countryStr.match(/^(.*?)(?:\s+([A-Z]{2}))?$/)
    if (match) {
      return {
        name: match[1]?.trim() || countryStr,
        code: match[2]?.trim() || null,
      }
    }
    return { name: countryStr, code: null }
  }

  const goToStop = (idx: number) => {
    if (idx < 0 || idx >= stops.length) return
    const nxt = stops[idx]
    setSelected(nxt)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo({ center: [nxt.lng, nxt.lat], zoom: 12, duration: 1200 })
    }
  }

  const nextStop = () => {
    if (stops.length < 2) return
    const currentIdx = stops.findIndex((s) => s.id === selected?.id)
    const nextIdx = (currentIdx + 1) % stops.length
    goToStop(nextIdx)
  }

  const prevStop = () => {
    if (stops.length < 2) return
    const currentIdx = stops.findIndex((s) => s.id === selected?.id)
    const prevIdx = (currentIdx - 1 + stops.length) % stops.length
    goToStop(prevIdx)
  }

  const centerOnAll = () => {
    if (mapInstanceRef.current && stops.length > 0) {
      const b = routeBounds(stops)
      if (b) mapInstanceRef.current.fitBounds(b, { padding: 50, maxZoom: 14, duration: 1000 })
    }
  }

  const centerOnSelected = () => {
    if (mapInstanceRef.current && selected) {
      mapInstanceRef.current.flyTo({ center: [selected.lng, selected.lat], zoom: 13, duration: 1000 })
    }
  }

  const resetNorth = () => {
    mapInstanceRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 500 })
  }

  const zoomIn = () => mapInstanceRef.current?.zoomIn()
  const zoomOut = () => mapInstanceRef.current?.zoomOut()

  return (
    <div
      className="min-h-full flex flex-col select-none pb-1"
      style={{
        background: "#F8FAFC",
      }}
    >
      {/* Subheader / screen title */}
      <section className="px-5 md:px-8 pt-1.5 pb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goBack("trip-overview")}
            aria-label="Retour au niveau supérieur"
            className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-slate-700 border border-slate-200/80 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer flex-shrink-0"
            style={{ boxShadow: SUBTLE_SHADOW }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15.75 19.5 8.25 12l7.5-7.5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div>
            <h1 className="text-[18px] font-bold text-slate-900 tracking-tight leading-none mb-1">
              Globe & Itinéraire
            </h1>
            <div className="flex items-center gap-1.5 text-[0.72rem] font-medium text-slate-500">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span className="font-semibold text-blue-700">{stops.length} étapes</span>
              <span className="text-slate-300">•</span>
              <span>Vue interactive</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={resetNorth}
            className="w-9 h-9 rounded-2xl bg-white text-amber-500 border border-slate-200/80 hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            style={{ boxShadow: SUBTLE_SHADOW }}
            title="Boussole"
            aria-label="Boussole"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="m15.5 8.5-2.2 5.3-5.3 2.2 2.2-5.3 5.3-2.2Z" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setLayerType((prev) => (prev === "trypo" ? "satellite" : "trypo"))}
            className="w-9 h-9 rounded-2xl bg-white text-slate-500 border border-slate-200/80 hover:text-slate-800 hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            style={{ boxShadow: SUBTLE_SHADOW }}
            title="Changer de vue (Satellite / Plan)"
            aria-label="Mode satellite"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="m12 3 9 5-9 5-9-5 9-5Z" strokeLinejoin="round" />
              <path d="m3 13 9 5 9-5" strokeLinejoin="round" />
              <path d="m3 17 9 5 9-5" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </section>

      {/* Interactive Mapbox World Map Container */}
      <main className="relative flex-1 px-4 md:px-8 pb-2 min-h-0 flex flex-col">
        <div
          className="relative w-full rounded-[28px] overflow-hidden bg-[#E2ECF5] transition-all"
          style={{
            height: isDesktop ? 520 : "clamp(300px, calc(100dvh - 430px), 560px)",
            border: "1px solid rgba(226, 232, 240, 0.9)",
            boxShadow: "inset 0 2px 6px rgba(15, 23, 42, 0.04)",
          }}
        >
          {/* Map canvas */}
          <div ref={mapContainerRef} className="w-full h-full z-0" />
          {!hasMapboxToken() && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/95 p-6 text-center">
              <p className="text-slate-500 text-[12px] font-semibold">
                Clé Mapbox manquante. Ajoutez VITE_MAPBOX_ACCESS_TOKEN dans .env.local
                puis redémarrez.
              </p>
            </div>
          )}

          {/* Floating journey badge (top-left) */}
          <div className="absolute top-3 left-3 z-10">
            <div
              className="rounded-full border border-white/70 px-3 py-1.5 flex items-center gap-2"
              style={{ ...GLASS_SURFACE, boxShadow: FLOAT_SHADOW }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-bold text-slate-800 tracking-tight truncate max-w-[200px] sm:max-w-none">
                {stops.length > 0 ? `${stops[0].city} → ${stops[stops.length - 1].city}` : "Itinéraire mondial"}
              </span>
            </div>
          </div>

          {/* Floating zoom + recenter controls (right) */}
          <div className="absolute right-3 bottom-14 z-10 flex flex-col items-center gap-2">
            <div
              className="rounded-2xl border border-white/70 p-1 flex flex-col gap-0.5"
              style={{ ...GLASS_SURFACE, boxShadow: FLOAT_SHADOW }}
            >
              <button
                type="button"
                onClick={zoomIn}
                aria-label="Zoom avant"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100/60 active:scale-90 transition-all font-bold text-lg leading-none cursor-pointer"
              >
                +
              </button>
              <div className="h-px w-5 mx-auto bg-slate-200" />
              <button
                type="button"
                onClick={zoomOut}
                aria-label="Zoom arrière"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100/60 active:scale-90 transition-all font-bold text-lg leading-none cursor-pointer"
              >
                −
              </button>
            </div>
            <button
              type="button"
              onClick={centerOnAll}
              aria-label="Recentrer l'itinéraire"
              className="w-9 h-9 rounded-2xl border border-white/70 flex items-center justify-center text-slate-700 hover:bg-slate-100/60 active:scale-90 transition-all cursor-pointer"
              style={{ ...GLASS_SURFACE, boxShadow: FLOAT_SHADOW }}
            >
              <svg className="w-4 h-4 text-slate-800" fill="currentColor" viewBox="0 0 24 24">
                <path
                  clipRule="evenodd"
                  fillRule="evenodd"
                  d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z"
                />
              </svg>
            </button>
          </div>

          {/* Floating hint pill (bottom-left) */}
          <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
            <div
              className="px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10 shadow-lg"
              style={{ background: "rgba(15, 23, 42, 0.78)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            >
              <div className="w-3.5 h-3.5 rounded-full border border-white/80 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>
              <p className="text-[0.68rem] font-medium text-white/90 tracking-wide">
                Touchez un repère pour voyager
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Destination details card */}
      {selected && (() => {
        const countryInfo = splitCountryAndCode(selected.country)
        return (
          <section
            className="px-4 md:px-8 pb-3 pt-1 z-30 flex-shrink-0"
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
            onTouchEnd={(e) => {
              if (!touchStartX.current || stops.length < 2) return
              const diff = touchStartX.current - e.changedTouches[0].clientX
              touchStartX.current = 0
              if (Math.abs(diff) < 50) return
              if (diff > 0) nextStop()
              else prevStop()
            }}
          >
            <div
              className="w-full bg-white rounded-[30px] border border-slate-200/90 p-4 transition-all"
              style={{ boxShadow: FLOAT_SHADOW }}
            >
              {/* Header row: step badge + country + step arrows */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold tracking-wider uppercase bg-blue-50 text-blue-700 border border-blue-200/60">
                    Étape {selected.index} / {stops.length}
                  </span>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <span className="text-sm">📍</span>
                    <span>{countryInfo.name}</span>
                    {countryInfo.code && (
                      <span className="text-[0.65rem] font-bold text-slate-400 bg-slate-100 px-1 py-0.5 rounded uppercase">
                        {countryInfo.code}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={prevStop}
                    aria-label="Étape précédente"
                    className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer flex-shrink-0"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M15.75 19.5 8.25 12l7.5-7.5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={nextStop}
                    aria-label="Étape suivante"
                    className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer flex-shrink-0"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M8.25 4.5l7.5 7.5-7.5 7.5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Destination identity + stay duration */}
              <div className="flex items-center justify-between gap-3 mb-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center shadow-sm flex-shrink-0">
                    <span className="text-xl">📍</span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-extrabold text-slate-950 tracking-tight leading-tight truncate">
                      {selected.city}
                    </h2>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mt-0.5">
                      <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span className="truncate">{formatStopDates(selected.dates)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center min-w-[62px] h-[58px] rounded-2xl bg-blue-50/70 border border-blue-100/80 px-2 flex-shrink-0">
                  <span className="text-xl font-black text-blue-700 leading-none">{selected.nights}</span>
                  <span className="text-[0.62rem] font-extrabold text-blue-500 uppercase tracking-widest mt-1">
                    nuit{selected.nights > 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Coordinates + Maps CTA */}
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={centerOnSelected}
                  className="flex items-center gap-2 pl-1 text-left cursor-pointer group"
                  title="Centrer la carte sur cette étape"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                  <div className="font-mono text-[0.7rem] font-semibold text-slate-500 tracking-tight leading-snug group-hover:text-blue-600 transition-colors">
                    <div>{selected.lat.toFixed(2)}°N,</div>
                    <div>{selected.lng.toFixed(2)}°E</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => openInMaps(selected.lat, selected.lng, selected.city)}
                  className="relative group overflow-hidden flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                  style={{ boxShadow: GLOW_SHADOW }}
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                  <span className="tracking-wide">Ouvrir dans Maps</span>
                  <span className="text-sm font-semibold group-hover:translate-x-0.5 transition-transform">→</span>
                </button>
              </div>
            </div>
          </section>
        )
      })()}

      {/* Home indicator */}
      <div className="w-full flex justify-center pb-2 flex-shrink-0 md:hidden">
        <div className="w-32 h-1 bg-slate-300 rounded-full" />
      </div>
    </div>
  )
}
