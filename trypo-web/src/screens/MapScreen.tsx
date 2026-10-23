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

export default function MapScreen({ navigate, goBack }: Props) {
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
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right")

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

  // Calculate total route distance in km
  const totalDistanceKm = stops.reduce((total, stop, i) => {
    if (i === 0) return 0
    const prev = stops[i - 1]
    return total + calculateDistanceKm(prev.lat, prev.lng, stop.lat, stop.lng)
  }, 0)

  return (
    <div
      className="min-h-full flex flex-col select-none"
      style={{
        background: "linear-gradient(180deg, #E7EBFF 0%, #F4F6FF 45%, #FFFFFF 100%)",
      }}
    >
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goBack("trip-overview")}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white text-navy transition-all"
            style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.12)" }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M11 14L6 9l5-5"
                stroke="#0D0F2E"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-navy font-black text-[20px] flex items-center gap-2">
              <span>Globe & Itinéraire</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-bold">
                Live GPS
              </span>
            </h1>
            <p className="text-slate-500 text-[12px]">
              {stops.length} étapes • Vue mondiale interactive
            </p>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="px-5 md:px-8 mb-4 flex gap-2.5">
        {[
          { val: String(stops.length), lbl: "Étapes", color: "#3B41C8" },
          { val: totalDistanceKm > 0 ? `${totalDistanceKm} km` : "720 km", lbl: "Distance", color: "#7C3AED" },
          { val: "Actif", lbl: "Statut", color: "#16A34A" },
        ].map((s) => (
          <div
            key={s.lbl}
            className="flex-1 rounded-2xl py-2.5 flex flex-col items-center bg-white border border-slate-100"
            style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.07)" }}
          >
            <span className="font-black text-[14px]" style={{ color: s.color }}>
              {s.val}
            </span>
            <span className="text-slate-400 text-[10px] font-semibold">{s.lbl}</span>
          </div>
        ))}
      </div>

      {/* Real Interactive Mapbox World Map Container */}
      <div className="px-5 md:px-8 mb-4">
        <div
          className="relative w-full rounded-[28px] overflow-hidden bg-[#F1F4FB]"
          style={{
            height: isDesktop ? "520px" : "350px",
            border: "1.5px solid rgba(255,255,255,0.9)",
            boxShadow: "0 16px 40px rgba(59,65,200,0.16), 0 2px 8px rgba(59,65,200,0.08)",
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

          {/* In-Map Bottom Legend */}
          <div
            className="absolute bottom-3 left-3 z-10 rounded-2xl bg-white/95 backdrop-blur-md px-3 py-1.5 text-[10px] font-bold text-navy border border-slate-100 flex items-center gap-2"
            style={{ boxShadow: "0 4px 16px rgba(13,15,46,0.12)" }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {stops.length > 0 ? `${stops[0].city} ➔ ${stops[stops.length - 1].city}` : "Itinéraire mondial"}
            </span>
          </div>
        </div>
      </div>

      {/* Selected Stop Card */}
      {selected && (
        <div className="px-5 md:px-8 mb-3">
          <div
            className="rounded-[24px] p-4 transition-all bg-white"
            style={{
              border: `1.5px solid ${selected.color}35`,
              boxShadow: "0 12px 32px rgba(59,65,200,0.12)",
            }}
          >
            <div className="flex items-start justify-between mb-2.5">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                  style={{
                    background: `${selected.color}14`,
                    boxShadow: `inset 0 0 0 1px ${selected.color}22`,
                  }}
                >
                  {selected.emoji}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-black text-white"
                      style={{ background: selected.color }}
                    >
                      Étape {selected.index}
                    </span>
                    <h3 className="text-navy font-black text-[17px]">
                      {selected.city}
                    </h3>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    {selected.country} • {selected.dates}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span
                  className="font-black text-[22px] leading-none block text-brand"
                >
                  {selected.nights}
                </span>
                <p className="text-slate-400 text-[10px] font-bold mt-0.5">
                  nuit{selected.nights > 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* GPS coordinates & action button */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
              <span className="text-slate-400 text-[10px] font-mono">
                📍 {selected.lat.toFixed(2)}°N, {selected.lng.toFixed(2)}°E
              </span>
              <button
                type="button"
                onClick={() => openInMaps(selected.lat, selected.lng, selected.city)}
                className="text-[11px] font-bold px-3 py-1.5 rounded-xl text-brand transition-all active:scale-95"
                style={{ background: "rgba(59,65,200,0.08)" }}
              >
                Ouvrir dans Maps 🗺️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Horizontal Stop Navigation Dots */}
      <div className="flex justify-center items-center gap-2 pb-6 px-5 md:px-8">
        {stops.map((s) => {
          const isSel = selected?.id === s.id
          return (
            <button
              key={s.id}
              onClick={() => {
                setSelected(s)
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.flyTo({ center: [s.lng, s.lat], zoom: 12, duration: 1200 })
                }
              }}
              className="rounded-full transition-all duration-300 flex items-center justify-center"
              style={{
                width: isSel ? "32px" : "10px",
                height: "10px",
                background: isSel
                  ? "linear-gradient(90deg, #3B41C8, #06C4D4)"
                  : "rgba(59,65,200,0.18)",
              }}
              title={s.city}
            />
          )
        })}
      </div>
    </div>
  )
}
