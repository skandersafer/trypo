/**
 * Shared city geocoding for maps (MapScreen, Find Crew, place picker).
 *
 * Previously every screen kept its own hardcoded city list with a fragile
 * bidirectional substring matcher whose first entry was Paris — so any
 * unknown/empty spelling (e.g. "Barcelone") landed on Paris. This module is
 * the single source of truth:
 *  1. accent-insensitive exact match (with French/alt-name aliases),
 *  2. safe forward-includes on long keys only (never reverse),
 *  3. live Open-Meteo geocoding (keyless) with a local cache,
 *  4. null when nothing matches (callers decide their own fallback).
 */

export type KnownCoords = {
  lat: number
  lng: number
  country: string
  emoji: string
}

const KNOWN: Record<string, KnownCoords> = {
  Paris: { lat: 48.8566, lng: 2.3522, country: "France 🇫🇷", emoji: "🗼" },
  Lyon: { lat: 45.764, lng: 4.8357, country: "France 🇫🇷", emoji: "🦁" },
  Marseille: { lat: 43.2965, lng: 5.3698, country: "France 🇫🇷", emoji: "⚓" },
  Nice: { lat: 43.7102, lng: 7.262, country: "France 🇫🇷", emoji: "🏖️" },
  Monpezat: { lat: 44.2078, lng: 1.4797, country: "France 🇫🇷", emoji: "🏰" },
  Bordeaux: { lat: 44.8378, lng: -0.5792, country: "France 🇫🇷", emoji: "🍷" },
  Toulouse: { lat: 43.6047, lng: 1.4442, country: "France 🇫🇷", emoji: "🚀" },
  Strasbourg: { lat: 48.5734, lng: 7.7521, country: "France 🇫🇷", emoji: "🥨" },
  Lille: { lat: 50.6292, lng: 3.0573, country: "France 🇫🇷", emoji: "🏰" },
  Nantes: { lat: 47.2184, lng: -1.5536, country: "France 🇫🇷", emoji: "⚓" },
  Tunis: { lat: 36.8065, lng: 10.1815, country: "Tunisie 🇹🇳", emoji: "🏛️" },
  Sousse: { lat: 35.8256, lng: 10.6369, country: "Tunisie 🇹🇳", emoji: "🌴" },
  Sfax: { lat: 34.7406, lng: 10.769, country: "Tunisie 🇹🇳", emoji: "🌊" },
  Djerba: { lat: 33.8764, lng: 10.8582, country: "Tunisie 🇹🇳", emoji: "🏝️" },
  Hammamet: { lat: 36.4, lng: 10.6133, country: "Tunisie 🇹🇳", emoji: "🏖️" },
  Rome: { lat: 41.9028, lng: 12.4964, country: "Italie 🇮🇹", emoji: "🍕" },
  Florence: { lat: 43.7696, lng: 11.2558, country: "Italie 🇮🇹", emoji: "🎨" },
  Venice: { lat: 45.4408, lng: 12.3155, country: "Italie 🇮🇹", emoji: "🎭" },
  Milan: { lat: 45.4642, lng: 9.19, country: "Italie 🇮🇹", emoji: "👗" },
  Naples: { lat: 40.8518, lng: 14.2681, country: "Italie 🇮🇹", emoji: "🍕" },
  Barcelona: { lat: 41.3851, lng: 2.1734, country: "Espagne 🇪🇸", emoji: "☀️" },
  Madrid: { lat: 40.4168, lng: -3.7038, country: "Espagne 🇪🇸", emoji: "🥘" },
  Seville: { lat: 37.3891, lng: -5.9845, country: "Espagne 🇪🇸", emoji: "💃" },
  Valencia: { lat: 39.4699, lng: -0.3763, country: "Espagne 🇪🇸", emoji: "🍊" },
  Lisbon: { lat: 38.7223, lng: -9.1393, country: "Portugal 🇵🇹", emoji: "🚋" },
  Porto: { lat: 41.1579, lng: -8.6291, country: "Portugal 🇵🇹", emoji: "🍷" },
  London: { lat: 51.5074, lng: -0.1278, country: "Royaume-Uni 🇬🇧", emoji: "💂" },
  Amsterdam: { lat: 52.3676, lng: 4.9041, country: "Pays-Bas 🇳🇱", emoji: "🚲" },
  Berlin: { lat: 52.52, lng: 13.405, country: "Allemagne 🇩🇪", emoji: "🍺" },
  Prague: { lat: 50.0755, lng: 14.4378, country: "Tchéquie 🇨🇿", emoji: "🏰" },
  Vienna: { lat: 48.2082, lng: 16.3738, country: "Autriche 🇦🇹", emoji: "🎻" },
  Budapest: { lat: 47.4979, lng: 19.0402, country: "Hongrie 🇭🇺", emoji: "♨️" },
  Athens: { lat: 37.9838, lng: 23.7275, country: "Grèce 🇬🇷", emoji: "🏛️" },
  Istanbul: { lat: 41.0082, lng: 28.9784, country: "Turquie 🇹🇷", emoji: "🕌" },
  Cairo: { lat: 30.0444, lng: 31.2357, country: "Égypte 🇪🇬", emoji: "🔺" },
  Marrakech: { lat: 31.6295, lng: -7.9811, country: "Maroc 🇲🇦", emoji: "🕌" },
  Casablanca: { lat: 33.5731, lng: -7.5898, country: "Maroc 🇲🇦", emoji: "🌊" },
  Algiers: { lat: 36.7538, lng: 3.0588, country: "Algérie 🇩🇿", emoji: "🏛️" },
  Dubai: { lat: 25.2048, lng: 55.2708, country: "Émirats Arabes Unis 🇦🇪", emoji: "✨" },
  Tokyo: { lat: 35.6762, lng: 139.6503, country: "Japon 🇯🇵", emoji: "🍣" },
  Kyoto: { lat: 35.0116, lng: 135.7681, country: "Japon 🇯🇵", emoji: "⛩️" },
  Osaka: { lat: 34.6937, lng: 135.5023, country: "Japon 🇯🇵", emoji: "🏯" },
  Bangkok: { lat: 13.7563, lng: 100.5018, country: "Thaïlande 🇹🇭", emoji: "🛕" },
  Bali: { lat: -8.3405, lng: 115.092, country: "Indonésie 🇮🇩", emoji: "🏝️" },
  "New York": { lat: 40.7128, lng: -74.006, country: "États-Unis 🇺🇸", emoji: "🗽" },
  Montreal: { lat: 45.5017, lng: -73.5673, country: "Canada 🇨🇦", emoji: "🍁" },
}

/** French / alternate spellings mapped to the canonical key above. */
const ALIASES: Record<string, string> = {
  Barcelone: "Barcelona",
  Londres: "London",
  Séville: "Seville",
  Seville: "Seville",
  Valence: "Valencia",
  Valencia: "Valencia",
  Lisbonne: "Lisbon",
  Lisbone: "Lisbon",
  Venise: "Venice",
  Milan: "Milan",
  Naples: "Naples",
  Athenes: "Athens",
  Athènes: "Athens",
  Marseille: "Marseille",
  Madrid: "Madrid",
  Tunis: "Tunis",
  Sousse: "Sousse",
  Djerba: "Djerba",
  NewYork: "New York",
  "New-York": "New York",
  "New York": "New York",
}

export function normalizeCityName(city: string | null | undefined): string {
  return (city || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
}

/**
 * Resolve a city name against the built-in list. Returns null when unknown —
 * callers should fall back to `geocodeCity()` (live) instead of Paris.
 *
 * Handles "City, Country" style values (takes the part before the comma) so
 * a destination saved as "Madrid, Espagne" still resolves to Madrid instead
 * of a fallback pin.
 */
export function resolveKnownCoords(city: string | null | undefined): KnownCoords | null {
  const raw = (city || "").trim()
  if (!raw) return null
  // Strip any ", Country" suffix first ("Madrid, Espagne" -> "Madrid").
  const firstToken = raw.split(",")[0].trim()
  const candidates = firstToken !== raw ? [raw, firstToken] : [raw]
  for (const candidate of candidates) {
    const found = resolveKnownCoordsExact(candidate)
    if (found) return found
  }
  return null
}

function resolveKnownCoordsExact(city: string | null | undefined): KnownCoords | null {
  const norm = normalizeCityName(city)
  if (!norm) return null

  const entries = Object.entries(KNOWN)
  // 1. Exact match (accent-insensitive).
  for (const [key, value] of entries) {
    if (normalizeCityName(key) === norm) return value
  }
  // 2. Alias match.
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (normalizeCityName(alias) === norm && KNOWN[target]) return KNOWN[target]
  }
  // 3. Safe forward-includes on long keys only, longest key first.
  //    Never the reverse direction ("Paris".includes("") === true bug).
  const byLength = entries.slice().sort((a, b) => b[0].length - a[0].length)
  for (const [key, value] of byLength) {
    const normKey = normalizeCityName(key)
    if (normKey.length >= 5 && norm.includes(normKey)) return value
  }
  return null
}

type LiveResult = { lat: number; lng: number; country: string | null }

const memoryCache = new Map<string, LiveResult>()
const CACHE_KEY = "trypo_geocode_cache_v1"

function readCache(): Record<string, LiveResult> {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(CACHE_KEY) : null
    return raw ? (JSON.parse(raw) as Record<string, LiveResult>) : {}
  } catch {
    return {}
  }
}

function writeCache(key: string, value: LiveResult): void {
  try {
    if (typeof window === "undefined") return
    const all = readCache()
    all[key] = value
    const keys = Object.keys(all)
    if (keys.length > 200) {
      for (const k of keys.slice(0, keys.length - 200)) delete all[k]
    }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

/**
 * Live-geocode any city worldwide via Open-Meteo (no API key needed).
 * Results are cached in-memory + localStorage.
 */
export async function geocodeCity(city: string | null | undefined): Promise<LiveResult | null> {
  const norm = normalizeCityName(city)
  if (!norm) return null

  const cached = memoryCache.get(norm)
  if (cached) return cached
  const disk = readCache()[norm]
  if (disk && Number.isFinite(disk.lat) && Number.isFinite(disk.lng)) {
    memoryCache.set(norm, disk)
    return disk
  }

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent((city || "").trim())}&count=1&language=en&format=json`,
      { headers: { Accept: "application/json" } },
    )
    if (!res.ok) return null
    const data = await res.json()
    const first = (data?.results ?? [])[0]
    if (!first || !Number.isFinite(Number(first.latitude))) return null
    const result: LiveResult = {
      lat: Number(first.latitude),
      lng: Number(first.longitude),
      country: first.country ? String(first.country) : null,
    }
    memoryCache.set(norm, result)
    writeCache(norm, result)
    return result
  } catch {
    return null
  }
}

/**
 * Best-effort coordinates for any city: built-in list first, live geocode
 * second. Returns null only when offline/unknown.
 */
export async function resolveCityCoordsLive(
  city: string | null | undefined,
): Promise<{ lat: number; lng: number; country: string | null } | null> {
  const known = resolveKnownCoords(city)
  if (known) return { lat: known.lat, lng: known.lng, country: known.country }
  return geocodeCity(city)
}
