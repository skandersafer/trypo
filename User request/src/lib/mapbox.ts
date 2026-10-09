import mapboxgl from "mapbox-gl"

export const MAPBOX_TOKEN =
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim() || ""

export function getMapboxToken(): string {
  return MAPBOX_TOKEN
}

export function hasMapboxToken(): boolean {
  return MAPBOX_TOKEN.length > 10
}

// Mapbox v3 styles — `trypo` is Trypo's signature look (light-v11 base +
// full custom paint below). `streets` stays on the Standard basemap for a
// more 3D/modern feel and is themed via setConfigProperty.
export const MAPBOX_STYLES = {
  trypo: "mapbox://styles/mapbox/light-v11",
  streets: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/standard-satellite",
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
} as const

export type MapboxStyleKey = keyof typeof MAPBOX_STYLES

/** Trypo Light v2 — fresh signature palette: pearl canvas, powder-blue water, mint parks. */
export const TRYPO_LIGHT_MAP = {
  canvas: "#F1F4FB",
  water: "#A9D1EF",
  waterDeep: "#9CC6EA",
  park: "#CDE9D6",
  wood: "#D3EBD8",
  grass: "#DFF0E3",
  scrub: "#E2EFE3",
  building: "#DCE2F1",
  buildingLine: "#C7D0E8",
  roadCasing: "#D4DBEE",
  roadMajor: "#FFFFFF",
  roadMinor: "#FFFFFF",
  roadMotorway: "#FFF6D9",
  tunnel: "#E8ECF6",
  bridgeCasing: "#CBD4EC",
  admin: "#B9C4DE",
  labelCity: "#0D0F2E",
  labelRoad: "#7A86A8",
  labelWater: "#4A7FB5",
  fog: "#E8EEFB",
} as const

function safePaint(
  map: mapboxgl.Map,
  layer: string,
  prop: string,
  value: unknown,
): void {
  try {
    if (map.getLayer(layer)) (map as any).setPaintProperty(layer, prop, value)
  } catch {
    // Layer absent in this style version — skip silently.
  }
}

function safeLayout(
  map: mapboxgl.Map,
  layer: string,
  prop: string,
  value: unknown,
): void {
  try {
    if (map.getLayer(layer)) (map as any).setLayoutProperty(layer, prop, value)
  } catch {
    // ignore
  }
}

/**
 * Trypo Light v2 theme — pearl canvas, powder-blue water, mint parks, crisp
 * white roads, navy labels. Every tweak is guarded so unknown style versions
 * keep their defaults. Call after `load` / `style.load` when a light-based
 * style (trypo / light) is active.
 */
export function applyTrypoLightTheme(map: mapboxgl.Map): void {
  try {
    // — Land & water —
    safePaint(map, "background", "background-color", TRYPO_LIGHT_MAP.canvas)
    safePaint(map, "land", "background-color", TRYPO_LIGHT_MAP.canvas)
    safePaint(map, "water", "fill-color", TRYPO_LIGHT_MAP.water)
    safePaint(map, "waterway-river-canal", "line-color", TRYPO_LIGHT_MAP.water)
    safePaint(map, "water-depth", "fill-color", TRYPO_LIGHT_MAP.waterDeep)
    safePaint(map, "waterway", "fill-color", TRYPO_LIGHT_MAP.water)
    // — Parks & vegetation —
    safePaint(map, "national-park", "fill-color", TRYPO_LIGHT_MAP.park)
    safePaint(map, "landcover-wood", "fill-color", TRYPO_LIGHT_MAP.wood)
    safePaint(map, "landcover-grass", "fill-color", TRYPO_LIGHT_MAP.grass)
    safePaint(map, "landcover-scrub", "fill-color", TRYPO_LIGHT_MAP.scrub)
    safePaint(map, "landuse-park", "fill-color", TRYPO_LIGHT_MAP.park)
    safePaint(map, "park", "fill-color", TRYPO_LIGHT_MAP.park)
    safePaint(map, "garden", "fill-color", TRYPO_LIGHT_MAP.park)
    // — Buildings —
    safePaint(map, "building", "fill-color", TRYPO_LIGHT_MAP.building)
    safePaint(map, "building", "fill-outline-color", TRYPO_LIGHT_MAP.buildingLine)
    // — Roads: white carriageways, soft lavender casings —
    safePaint(map, "road-motorway-trunk-casing", "line-color", TRYPO_LIGHT_MAP.roadCasing)
    safePaint(map, "road-primary-casing", "line-color", TRYPO_LIGHT_MAP.roadCasing)
    safePaint(map, "road-secondary-tertiary-casing", "line-color", TRYPO_LIGHT_MAP.roadCasing)
    safePaint(map, "road-street-casing", "line-color", "#E0E6F5")
    safePaint(map, "road-motorway-trunk", "line-color", TRYPO_LIGHT_MAP.roadMotorway)
    safePaint(map, "road-primary", "line-color", TRYPO_LIGHT_MAP.roadMajor)
    safePaint(map, "road-secondary-tertiary", "line-color", TRYPO_LIGHT_MAP.roadMajor)
    safePaint(map, "road-street", "line-color", TRYPO_LIGHT_MAP.roadMinor)
    safePaint(map, "road-minor", "line-color", TRYPO_LIGHT_MAP.roadMinor)
    safePaint(map, "road-path", "line-color", "#CBD5E1")
    safePaint(map, "tunnel-motorway-trunk", "line-color", TRYPO_LIGHT_MAP.tunnel)
    safePaint(map, "tunnel-primary", "line-color", TRYPO_LIGHT_MAP.tunnel)
    safePaint(map, "bridge-motorway-trunk-casing", "line-color", TRYPO_LIGHT_MAP.bridgeCasing)
    safePaint(map, "bridge-primary-casing", "line-color", TRYPO_LIGHT_MAP.bridgeCasing)
    // — Borders: faint lavender —
    safePaint(map, "admin-0-boundary", "line-color", TRYPO_LIGHT_MAP.admin)
    safePaint(map, "admin-1-boundary", "line-color", "#CBD3E8")
    // — Labels: navy cities, slate roads, blue water —
    safePaint(map, "settlement-major-label", "text-color", TRYPO_LIGHT_MAP.labelCity)
    safePaint(map, "settlement-minor-label", "text-color", "#2B3355")
    safePaint(map, "settlement-subdivision-label", "text-color", "#3B4566")
    safePaint(map, "road-label", "text-color", TRYPO_LIGHT_MAP.labelRoad)
    safePaint(map, "water-point-label", "text-color", TRYPO_LIGHT_MAP.labelWater)
    safePaint(map, "water-line-label", "text-color", TRYPO_LIGHT_MAP.labelWater)
    safePaint(map, "natural-point-label", "text-color", "#5B7A5E")
    safePaint(map, "poi-label", "text-color", "#3B4566")
    safeLayout(map, "settlement-major-label", "text-field", ["get", "name"])
    // Light airy atmosphere (also beautifies the globe view).
    try {
      map.setFog({
        color: TRYPO_LIGHT_MAP.fog,
        "high-color": "#CBD8F6",
        "horizon-blend": 0.14,
        "space-color": "#D9E3FC",
        "star-intensity": 0,
      } as any)
    } catch {
      // Fog unsupported — ignore.
    }
  } catch {
    // Theme is cosmetic — never break the map.
  }
}

/**
 * Theme for the Mapbox Standard basemap (`streets`): soft day light, Inter
 * font, subtle 3D objects off for a cleaner travel look. Guarded — older
 * runtimes keep defaults.
 */
export function applyTrypoStandardTheme(map: mapboxgl.Map): void {
  try {
    const cfg = (map as any).setConfigProperty
    if (typeof cfg === "function") {
      try {
        cfg.call(map, "basemap", "lightPreset", "day")
        cfg.call(map, "basemap", "font", "Inter")
        cfg.call(map, "basemap", "showTransitLabels", true)
        cfg.call(map, "basemap", "showPlaceLabels", true)
        cfg.call(map, "basemap", "showRoadLabels", true)
      } catch {
        // config keys differ per style version — ignore
      }
    }
    try {
      map.setFog({
        color: "#E8EEFB",
        "high-color": "#CBD8F6",
        "horizon-blend": 0.14,
        "space-color": "#D9E3FC",
        "star-intensity": 0,
      } as any)
    } catch {
      // ignore
    }
  } catch {
    // cosmetic only
  }
}

/** Single entry-point: pick the right cosmetic theme for the active style key. */
export function applyMapTheme(map: mapboxgl.Map, key: MapboxStyleKey): void {
  if (key === "trypo" || key === "light" || key === "outdoors") {
    applyTrypoLightTheme(map)
    return
  }
  if (key === "streets" || key === "satellite") {
    applyTrypoStandardTheme(map)
    return
  }
  // dark: keep Mapbox defaults (pins/routes already glow on it)
}

/** Switch between a flat route map and a 3D-ish globe (mapbox-gl ≥ 2.9). */
export function setGlobeProjection(map: mapboxgl.Map, globe: boolean): void {
  try {
    ;(map as any).setProjection({ name: globe ? "globe" : "mercator" })
  } catch {
    // Older runtime — keep the default projection.
  }
}

export function configureMapbox(): boolean {
  if (!hasMapboxToken()) {
    console.warn(
      "Mapbox token missing. Set VITE_MAPBOX_ACCESS_TOKEN in .env.local"
    )
    return false
  }
  mapboxgl.accessToken = MAPBOX_TOKEN
  return true
}

export type MapboxPlace = {
  name: string
  address: string
  lat: number
  lng: number
}

export type MapboxGeocodeOptions = {
  /** Max results (default 8). */
  limit?: number
  /** Geocode types filter (default places + poi). */
  types?: string
  /** Strict bounding box [minLng, minLat, maxLng, maxLat] — results outside are excluded. */
  bbox?: [number, number, number, number]
}

/** Forward geocoding via Mapbox, with Nominatim fallback handled by caller. */
export async function mapboxForwardGeocode(
  query: string,
  proximity?: { lng: number; lat: number },
  opts?: MapboxGeocodeOptions,
): Promise<MapboxPlace[]> {
  if (!hasMapboxToken() || !query.trim()) return []
  try {
    const params = new URLSearchParams({
      access_token: MAPBOX_TOKEN,
      limit: String(opts?.limit ?? 8),
      language: "fr,en",
      types: opts?.types ?? "place,locality,neighborhood,address,poi",
    })
    if (proximity) {
      params.set("proximity", `${proximity.lng},${proximity.lat}`)
    }
    // bbox strictly limits results to the box — proximity alone only biases.
    if (opts?.bbox) {
      params.set("bbox", opts.bbox.join(","))
    }
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        query.trim()
      )}.json?${params.toString()}`
    )
    if (!res.ok) return []
    const data = await res.json()
    return ((data.features ?? []) as any[])
      .filter(
        (f) =>
          Array.isArray(f.center) &&
          Number.isFinite(Number(f.center[0])) &&
          Number.isFinite(Number(f.center[1]))
      )
      .map((f) => ({
        name: String(f.text || f.place_name?.split(",")[0] || query),
        address: String(f.place_name || ""),
        lng: Number(f.center[0]),
        lat: Number(f.center[1]),
      }))
  } catch (err) {
    console.warn("Mapbox forward geocode failed:", err)
    return []
  }
}

/** Reverse geocoding via Mapbox. */
export async function mapboxReverseGeocode(
  lat: number,
  lng: number
): Promise<MapboxPlace | null> {
  if (!hasMapboxToken()) return null
  try {
    const params = new URLSearchParams({
      access_token: MAPBOX_TOKEN,
      limit: "1",
      language: "fr,en",
    })
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`
    )
    if (!res.ok) return null
    const data = await res.json()
    const f = (data.features ?? [])[0]
    if (!f || !Array.isArray(f.center)) return null
    return {
      name: String(f.text || f.place_name?.split(",")[0] || "Lieu"),
      address: String(f.place_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`),
      lng: Number(f.center[0]),
      lat: Number(f.center[1]),
    }
  } catch (err) {
    console.warn("Mapbox reverse geocode failed:", err)
    return null
  }
}
