import { useState, useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { searchPlaces, reverseGeocode, type PlaceSearchResult } from "../lib/travelApi"
import { resolveKnownCoords } from "../lib/geocode"
import {
  configureMapbox,
  hasMapboxToken,
  mapboxForwardGeocode,
  mapboxReverseGeocode,
  applyMapTheme,
  MAPBOX_STYLES,
  type MapboxStyleKey,
} from "../lib/mapbox"

interface GoogleMapsPlacePickerProps {
  cityContext?: string
  initialCenter?: { lat: number; lng: number } | null
  initialQuery?: string
  placeType?: "stay" | "activity" | "food" | "place" | "note"
  /** Minimal meetup-style UI: search + map + results + one confirm button. */
  simple?: boolean
  onSelectPlace: (place: PlaceSearchResult) => void
  onClose?: () => void
}

const STYLE_OPTIONS: { key: MapboxStyleKey; label: string }[] = [
  { key: "trypo", label: "✨ Trypo" },
  { key: "satellite", label: "🛰️ Satellite HD" },
  { key: "dark", label: "🌙 Nuit" },
]

/** Initial map center for a city: shared resolver, Madrid included. */
function cityCenter(cityContext?: string): [number, number] {
  const known = resolveKnownCoords(cityContext)
  if (known) return [known.lat, known.lng]
  return [48.8566, 2.3522]
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatM(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ""
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

const POPULAR_DESTINATIONS = [
  "Paris",
  "Lyon",
  "Marseille",
  "Nice",
  "Tunis",
  "Sousse",
  "Rome",
  "Barcelona",
  "Tokyo",
  "New York",
]

function createPinElement(emoji = "🏨", isHighlight = false): HTMLDivElement {
  const wrapper = document.createElement("div")
  wrapper.style.display = "flex"
  wrapper.style.alignItems = "center"
  wrapper.style.justifyContent = "center"
  wrapper.style.cursor = "pointer"
  wrapper.style.width = isHighlight ? "40px" : "34px"
  wrapper.style.height = isHighlight ? "40px" : "34px"

  const pin = document.createElement("div")
  pin.style.display = "flex"
  pin.style.alignItems = "center"
  pin.style.justifyContent = "center"
  pin.style.width = isHighlight ? "36px" : "30px"
  pin.style.height = isHighlight ? "36px" : "30px"
  pin.style.background = isHighlight
    ? "linear-gradient(135deg, #3B41C8 0%, #4F46E5 100%)"
    : "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)"
  pin.style.color = "white"
  pin.style.fontSize = isHighlight ? "18px" : "15px"
  pin.style.borderRadius = "50%"
  pin.style.boxShadow = isHighlight
    ? "0 0 0 3px rgba(255, 255, 255, 0.95), 0 0 0 6px rgba(59, 65, 200, 0.4), 0 6px 16px rgba(15, 23, 42, 0.3)"
    : "0 2px 8px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.08)"
  pin.style.border = "2px solid white"
  pin.style.transition = "transform 0.18s ease, box-shadow 0.18s ease"
  pin.textContent = emoji

  wrapper.appendChild(pin)
  return wrapper
}

export default function GoogleMapsPlacePicker({
  cityContext = "Paris",
  initialCenter = null,
  initialQuery = "",
  placeType = "stay",
  simple = false,
  onSelectPlace,
  onClose,
}: GoogleMapsPlacePickerProps) {
  const [query, setQuery] = useState(
    initialQuery || (initialCenter ? "café" : cityContext ? `Hôtel ${cityContext}` : "")
  );
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null)
  const [layerType, setLayerType] = useState<MapboxStyleKey>("trypo")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false)
  const [showResultsDrawer, setShowResultsDrawer] = useState(true)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const mapLoadedRef = useRef(false)

  const iconEmoji = placeType === "stay" ? "🏨" : placeType === "food" ? "🍜" : "📍"

  const placePopupHtml = (place: PlaceSearchResult) =>
    `<div style="font-family:system-ui;min-width:140px;">` +
    `<b style="color:#0D0F2E;font-size:13px;">${place.name}</b>` +
    `<p style="font-size:11px;color:#64748b;margin:4px 0 0 0;">${place.address}</p></div>`

  const setMarker = (lat: number, lng: number, emoji: string) => {
    const map = mapInstanceRef.current
    if (!map) return
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat])
      markerRef.current.getElement().replaceWith(createPinElement(emoji, true))
      // mapbox Marker element replacement: recreate marker to swap icon reliably
      markerRef.current.remove()
      markerRef.current = new mapboxgl.Marker({
        element: createPinElement(emoji, true),
        anchor: "center",
      })
        .setLngLat([lng, lat])
        .addTo(map)
    } else {
      markerRef.current = new mapboxgl.Marker({
        element: createPinElement(emoji, true),
        anchor: "center",
      })
        .setLngLat([lng, lat])
        .addTo(map)
    }
  }

  const showPopup = (place: PlaceSearchResult) => {
    if (markerRef.current) {
      markerRef.current.setPopup(
        new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(placePopupHtml(place))
      )
      markerRef.current.togglePopup()
    }
  }

  // Initialize Mapbox map once
  useEffect(() => {
    if (!mapContainerRef.current) return
    if (!configureMapbox()) return

    // Live GPS wins: centre the picker where the user actually is so the
    // first suggestions + proximity search are near them, not the city.
    const hasLiveCenter =
      initialCenter &&
      Number.isFinite(initialCenter.lat) &&
      Number.isFinite(initialCenter.lng)
    const initialCoords: [number, number] = hasLiveCenter
      ? [initialCenter.lat, initialCenter.lng]
      : cityCenter(cityContext)

    if (!mapInstanceRef.current) {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAPBOX_STYLES[layerType],
        center: [initialCoords[1], initialCoords[0]],
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
        markerRef.current = new mapboxgl.Marker({
          element: createPinElement(placeType === "stay" ? "🏨" : "📍", true),
          anchor: "center",
        })
          .setLngLat([initialCoords[1], initialCoords[0]])
          .addTo(map)
      })
      map.on("style.load", () => {
        mapLoadedRef.current = true
        try {
          const el = mapInstanceRef.current as any
          applyMapTheme(map, (el?.__trypoStyleKey as MapboxStyleKey) || layerType)
        } catch {
          // ignore
        }
      })

      // Click anywhere to drop pin & reverse geocode (Mapbox first, OSM fallback)
      map.on("click", async (e) => {
        const lng = e.lngLat.lng
        const lat = e.lngLat.lat
        setIsReverseGeocoding(true)
        setMarker(lat, lng, "📍")

        const mapboxResult = await mapboxReverseGeocode(lat, lng)
        if (mapboxResult) {
          setIsReverseGeocoding(false)
          const place = { ...mapboxResult }
          setSelectedPlace(place)
          setQuery(place.name)
          showPopup(place)
          return
        }

        const geoResult = await reverseGeocode(lat, lng)
        setIsReverseGeocoding(false)

        if (geoResult) {
          setSelectedPlace(geoResult)
          setQuery(geoResult.name)
          showPopup(geoResult)
        } else {
          const fallbackPlace: PlaceSearchResult = {
            name: `Lieu (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            address: `Coordonnées: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            lat,
            lng,
          }
          setSelectedPlace(fallbackPlace)
        }
      })

      mapInstanceRef.current = map
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      markerRef.current = null
      mapLoadedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update Mapbox style when layerType changes
  useEffect(() => {
    if (!mapInstanceRef.current) return
    ;(mapInstanceRef.current as any).__trypoStyleKey = layerType
    mapInstanceRef.current.setStyle(MAPBOX_STYLES[layerType])
  }, [layerType])

  // Invalidate map size on fullscreen toggle & auto resize observer
  useEffect(() => {
    const invalidate = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.resize()
      }
    }
    invalidate()
    const t1 = setTimeout(invalidate, 50)
    const t2 = setTimeout(invalidate, 150)
    const t3 = setTimeout(invalidate, 300)
    const t4 = setTimeout(invalidate, 600)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [isFullscreen])

  useEffect(() => {
    if (!mapContainerRef.current) return
    const resizeObserver = new ResizeObserver(() => {
      mapInstanceRef.current?.resize()
    })
    resizeObserver.observe(mapContainerRef.current)
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Initial search on mount
  useEffect(() => {
    void handleSearch(query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) return
    setLoading(true)
    setShowResultsDrawer(true)
    try {
      // Prefer Mapbox Geocoding for sharper POI results, fall back to OSM/Nominatim
      let places: PlaceSearchResult[] = []
      if (hasMapboxToken()) {
        const center = mapInstanceRef.current?.getCenter()
        places = await mapboxForwardGeocode(
          searchTerm,
          center ? { lng: center.lng, lat: center.lat } : undefined
        )
      }
      if (places.length === 0) {
        places = await searchPlaces(searchTerm, cityContext)
      }
      setResults(places)
      if (places.length > 0) {
        flyToPlace(places[0])
      }
    } catch (err) {
      console.warn("Place search failed:", err)
    } finally {
      setLoading(false)
    }
  }

  const flyToPlace = (place: PlaceSearchResult) => {
    setSelectedPlace(place)
    const map = mapInstanceRef.current
    if (!map) return

    map.flyTo({ center: [place.lng, place.lat], zoom: 14, duration: 1200 })
    setMarker(place.lat, place.lng, iconEmoji)
    // Re-show popup after marker recreation
    setTimeout(() => showPopup(place), 50)
  }

  const handleQuickDestination = (dest: string) => {
    const coords = cityCenter(dest)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo({ center: [coords[1], coords[0]], zoom: 12, duration: 1200 })
    }
    const newQuery = `Hôtel ${dest}`
    setQuery(newQuery)
    void handleSearch(newQuery)
  }

  // ── Simple mode (meetup): just search → tap a result → confirm. ──
  // No style toggles, no fullscreen, no city chips, no headers.
  if (simple) {
    const topResults = results.slice(0, 4)
    return (
      <div className="relative flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void handleSearch(query)
                }
              }}
              placeholder="Cafés, restaurants, hotels near you…"
              className="w-full rounded-2xl bg-white pl-10 pr-8 py-3 text-[13px] font-semibold text-navy outline-none border border-slate-200 shadow-sm focus:ring-2 focus:ring-brand/30"
            />
            <span className="absolute left-3.5 top-3 text-slate-400 text-[15px]">🔍</span>
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-3 text-[11px] font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleSearch(query)}
            disabled={loading || !query.trim()}
            className="rounded-2xl px-4 py-3 text-[12px] font-black text-white shadow-md disabled:opacity-50 transition-all flex-shrink-0 active:scale-95"
            style={{ background: "linear-gradient(135deg, #3B41C8, #06C4D4)" }}
          >
            {loading ? "…" : "Go"}
          </button>
        </div>

        <div className="relative w-full h-52 overflow-hidden rounded-2xl bg-slate-100 shadow-inner">
          <div ref={mapContainerRef} className="w-full h-full" />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-navy/85 backdrop-blur-xs px-3 py-1 text-[10px] font-bold text-white shadow-sm">
            👆 Tap the map to drop a pin
          </div>
          {isReverseGeocoding && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand/90 px-3 py-1 text-[10px] font-bold text-white shadow-md animate-pulse">
              Finding address…
            </div>
          )}
        </div>

        {topResults.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {topResults.map((place, idx) => {
              const isSelected =
                selectedPlace?.lat === place.lat && selectedPlace?.lng === place.lng
              const dist =
                initialCenter &&
                Number.isFinite(initialCenter.lat) &&
                Number.isFinite(initialCenter.lng)
                  ? formatM(haversineM(initialCenter.lat, initialCenter.lng, place.lat, place.lng))
                  : ""
              return (
                <button
                  key={`${place.lat}-${place.lng}-${idx}`}
                  type="button"
                  onClick={() => flyToPlace(place)}
                  className="flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all active:scale-[0.99]"
                  style={
                    isSelected
                      ? { borderColor: "#3B41C8", background: "rgba(59,65,200,0.08)" }
                      : { borderColor: "#e2e8f0", background: "#fff" }
                  }
                >
                  <span className="text-[18px] flex-shrink-0">📍</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-navy truncate">
                      {place.name}
                    </span>
                    <span className="block text-[11px] text-slate-400 truncate">
                      {place.address}
                    </span>
                  </span>
                  {dist && (
                    <span className="text-[11px] font-black text-brand flex-shrink-0">{dist}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {selectedPlace && (
          <button
            type="button"
            onClick={() => onSelectPlace(selectedPlace)}
            className="w-full py-3.5 rounded-2xl text-white font-black text-[14px] active:scale-95 transition-transform"
            style={{
              background: "linear-gradient(135deg, #7C3AED, #EC4899)",
              boxShadow: "0 8px 24px rgba(124,58,237,0.35)",
            }}
          >
            📌 Set meetup here ✓
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[100] flex flex-col bg-slate-950 overflow-hidden select-none"
          : "relative flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm border border-slate-100"
      }
      style={isFullscreen ? { borderRadius: "inherit" } : undefined}
    >
      {/* 1. PERMANENT MAP CANVAS (Never destroyed or unmounted) */}
      <div
        className={
          isFullscreen
            ? "absolute inset-0 w-full h-full z-0"
            : "relative w-full h-64 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner z-0"
        }
      >
        <div ref={mapContainerRef} className="w-full h-full z-0" />
        {!hasMapboxToken() && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/90 p-6 text-center">
            <p className="text-white/80 text-[12px] font-semibold">
              Clé Mapbox manquante. Ajoutez VITE_MAPBOX_ACCESS_TOKEN dans .env.local
              puis redémarrez.
            </p>
          </div>
        )}

        {/* Compact Mode floating overlay buttons on the map */}
        {!isFullscreen && (
          <>
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-white/95 backdrop-blur-xs rounded-xl p-1 shadow-md border border-slate-200/80">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setLayerType(opt.key)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-bold transition-all ${
                    layerType === opt.key
                      ? "bg-brand text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              className="absolute top-2 left-2 z-10 rounded-xl bg-white/95 hover:bg-white text-navy px-2.5 py-1 text-[10px] font-extrabold shadow-md border border-slate-200/80 transition-all flex items-center gap-1"
            >
              <span>⛶</span>
              <span>Plein écran</span>
            </button>

            <div className="absolute bottom-2 left-2 z-10 rounded-xl bg-navy/85 backdrop-blur-xs px-2.5 py-1 text-[10px] font-bold text-white shadow-sm flex items-center gap-1.5">
              <span>👆 Touchez la carte pour placer un repère</span>
            </div>

            {isReverseGeocoding && (
              <div className="absolute top-10 left-2 z-10 rounded-xl bg-brand/90 backdrop-blur-xs px-2.5 py-1 text-[10px] font-bold text-white shadow-md animate-pulse">
                Localisation de l'adresse...
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. FULLSCREEN FLOATING OVERLAYS */}
      {isFullscreen ? (
        <>
          {/* Top Floating Controls */}
          <div className="absolute top-0 left-0 right-0 z-20 p-3 pt-4 flex flex-col gap-2 pointer-events-none">
            {/* Header Card */}
            <div className="flex items-center justify-between pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl px-3 py-2 shadow-lg border border-slate-200/80">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  className="h-8 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 text-[11px] font-bold transition-all shadow-xs"
                  title="Réduire"
                >
                  <span>🗗</span>
                  <span>Réduire</span>
                </button>
                <div>
                  <h4 className="text-navy font-black text-[13px] leading-tight flex items-center gap-1.5">
                    Carte Plein Écran
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded-full font-bold">
                      Mapbox
                    </span>
                  </h4>
                </div>
              </div>

              {/* Layer toggles */}
              <div className="flex items-center gap-1 bg-slate-100/90 rounded-xl p-0.5">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setLayerType(opt.key)}
                    className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-all ${
                      layerType === opt.key
                        ? "bg-brand text-white shadow-xs"
                        : "text-slate-600 hover:bg-white/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex gap-1.5 pointer-events-auto shadow-lg rounded-2xl">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void handleSearch(query)
                    }
                  }}
                  placeholder="Rechercher pays, ville, hôtel, adresse..."
                  className="w-full rounded-2xl bg-white/95 backdrop-blur-md pl-9 pr-8 py-2.5 text-[13px] font-semibold text-navy outline-none border border-slate-200/80 shadow-xs focus:ring-2 focus:ring-brand/30"
                />
                <span className="absolute left-3 top-2.5 text-slate-400 text-[13px]">🔍</span>
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-2.5 text-[11px] font-bold text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleSearch(query)}
                disabled={loading || !query.trim()}
                className="rounded-2xl bg-brand px-3.5 py-2.5 text-[12px] font-bold text-white shadow-md hover:bg-brand/90 disabled:opacity-50 transition-all flex-shrink-0"
              >
                {loading ? "..." : "Chercher"}
              </button>
            </div>

            {/* Quick Destination Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar pointer-events-auto">
              {POPULAR_DESTINATIONS.map((dest) => (
                <button
                  key={dest}
                  type="button"
                  onClick={() => handleQuickDestination(dest)}
                  className="flex-shrink-0 rounded-full bg-white/95 backdrop-blur-md hover:bg-white text-navy px-2.5 py-1 text-[10px] font-extrabold shadow-sm border border-slate-200/60 transition-all hover:scale-105"
                >
                  {dest}
                </button>
              ))}
            </div>

            {/* Geocoding indicator */}
            {isReverseGeocoding && (
              <div className="self-center rounded-full bg-brand/90 backdrop-blur-md px-3 py-1 text-[11px] font-bold text-white shadow-lg animate-pulse pointer-events-none">
                📍 Localisation de l'adresse en cours...
              </div>
            )}
          </div>

          {/* Bottom Floating Overlays */}
          <div className="absolute bottom-0 left-0 right-0 z-20 p-3 pb-5 flex flex-col gap-2 pointer-events-none">
            {/* Live Search Results List Drawer */}
            {results.length > 0 && showResultsDrawer && (
              <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl p-2.5 shadow-2xl border border-slate-200/80 max-h-48 overflow-y-auto flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-1 mb-0.5">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Lieux trouvés ({results.length}) — Touchez pour centrer
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowResultsDrawer(false)}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                  >
                    Masquer
                  </button>
                </div>
                {results.map((place, idx) => {
                  const isSelected = selectedPlace?.lat === place.lat && selectedPlace?.lng === place.lng
                  return (
                    <div
                      key={`${place.lat}-${place.lng}-${idx}`}
                      onClick={() => flyToPlace(place)}
                      className={`flex items-center justify-between gap-2 p-2 rounded-xl transition-all cursor-pointer border ${
                        isSelected
                          ? "border-brand bg-indigo-50/80 shadow-xs"
                          : "border-slate-100 bg-slate-50/70 hover:bg-slate-100/90"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px]">{placeType === "stay" ? "🏨" : "📍"}</span>
                          <p className="text-[12px] font-bold text-navy truncate">{place.name}</p>
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{place.address}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectPlace(place)
                          setIsFullscreen(false)
                        }}
                        className="rounded-xl bg-brand px-3 py-1.5 text-[11px] font-black text-white hover:bg-brand/90 transition-colors shadow-xs flex-shrink-0"
                      >
                        Choisir ✓
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Collapsed results toggle */}
            {results.length > 0 && !showResultsDrawer && (
              <button
                type="button"
                onClick={() => setShowResultsDrawer(true)}
                className="pointer-events-auto self-center bg-white/90 backdrop-blur-md rounded-full px-3.5 py-1 text-[11px] font-bold text-brand shadow-md border border-slate-200/80"
              >
                Afficher les {results.length} résultats ▾
              </button>
            )}

            {/* Selected Place Confirmation Card */}
            {selectedPlace && (
              <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-emerald-300 rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-600 text-sm">📍</span>
                    <p className="text-[13px] font-black text-emerald-950 truncate">
                      {selectedPlace.name}
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {selectedPlace.address}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSelectPlace(selectedPlace)
                    setIsFullscreen(false)
                  }}
                  className="flex-shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-[12px] font-black text-white shadow-md transition-all active:scale-95"
                >
                  Sélectionner ce lieu ✓
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* 3. COMPACT INLINE VIEW CONTROLS */
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-lg text-brand">
                🗺️
              </div>
              <div>
                <h4 className="text-navy font-black text-[14px] flex items-center gap-1.5">
                  Carte Interactive & Séjours
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                    Mapbox
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Naviguez, zoomez et cliquez sur la carte pour choisir n'importe quelle adresse
                  {initialCenter && (
                    <span className="block text-emerald-600 font-bold mt-0.5">
                      📍 Centré sur ta position live — suggestions à proximité
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="text-[11px] font-bold text-brand hover:text-navy bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1 shadow-xs"
                title="Agrandir en plein écran mobile"
              >
                <span>⛶</span>
                <span>Plein écran</span>
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[12px] font-bold text-slate-400 hover:text-navy px-2 py-1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Worldwide Search bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void handleSearch(query)
                  }
                }}
                placeholder="Rechercher n'importe quel pays, ville, hôtel, monument ou adresse dans le monde..."
                className="w-full rounded-xl bg-slate-50 pl-9 pr-7 py-2.5 text-[13px] font-medium outline-none focus:ring-2 focus:ring-brand/20 border border-slate-200/70"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-[14px]">
                🔍
              </span>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-2.5 text-[11px] font-bold text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleSearch(query)}
              disabled={loading || !query.trim()}
              className="rounded-xl bg-brand px-4 py-2.5 text-[12px] font-bold text-white shadow-sm hover:bg-brand/90 disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              {loading ? "Recherche..." : "Explorer"}
            </button>
          </div>

          {/* Global Quick Destination Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <span className="text-[10px] font-black uppercase text-slate-400 flex-shrink-0">
              Villes :
            </span>
            {POPULAR_DESTINATIONS.map((dest) => (
              <button
                key={dest}
                type="button"
                onClick={() => handleQuickDestination(dest)}
                className="flex-shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-0.5 text-[11px] font-bold transition-colors"
              >
                {dest}
              </button>
            ))}
          </div>

          {/* Live Search Results List */}
          {results.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Lieux trouvés ({results.length}) — Touchez pour centrer la carte
              </p>
              {results.map((place, idx) => {
                const isSelected =
                  selectedPlace?.lat === place.lat && selectedPlace?.lng === place.lng
                return (
                  <div
                    key={`${place.lat}-${place.lng}-${idx}`}
                    onClick={() => flyToPlace(place)}
                    className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-brand bg-indigo-50/70 shadow-xs"
                        : "border-slate-100 bg-slate-50/70 hover:bg-slate-100/90"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px]">
                          {placeType === "stay" ? "🏨" : "📍"}
                        </span>
                        <p className="text-[12px] font-bold text-navy truncate">
                          {place.name}
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                        {place.address}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectPlace(place)
                        }}
                        className="rounded-xl bg-brand px-3 py-1.5 text-[11px] font-black text-white hover:bg-brand/90 transition-colors shadow-xs"
                      >
                        Choisir ✓
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Selected place footer confirmation */}
          {selectedPlace && (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
              <div className="min-w-0 flex-1 mr-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 text-[13px]">📍</span>
                  <p className="text-[12px] font-black text-emerald-900 truncate">
                    {selectedPlace.name}
                  </p>
                </div>
                <p className="text-[10px] text-emerald-700 line-clamp-1 mt-0.5">
                  {selectedPlace.address}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectPlace(selectedPlace)
                }}
                className="flex-shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-[12px] font-black text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                Sélectionner ce lieu ✓
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
