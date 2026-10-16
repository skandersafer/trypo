import { CURATED_HIDDEN_GEMS } from "./hiddenGemsData"
import { hasMapboxToken, getMapboxToken } from "./mapbox"

export type TravelSearchItem = {
  city: string
  country: string
  region: string
  note: string
  image: string
  tags: string[]
  lat: number
  lng: number
}

export type WeatherSnapshot = {
  city: string
  country: string
  date: string
  icon: string
  condition: string
  temp: number
  feels: number
  humidity: number
  rain: number
  wind: number
  forecast: Array<{ day: string; icon: string; high: number; low: number }>
}

export type PlaceSearchResult = {
  name: string
  address: string
  lat: number
  lng: number
}

const fallbackCatalog: TravelSearchItem[] = [
  {
    city: "Tunis",
    country: "Tunisia",
    region: "North Africa",
    note: "Medina, Carthage coast, and vibrant old city energy.",
    image:
      "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&h=600&fit=crop&auto=format",
    tags: ["city", "culture", "beach"],
    lat: 36.8065,
    lng: 10.1815,
  },
  {
    city: "Sousse",
    country: "Tunisia",
    region: "North Africa",
    note: "Seaside promenade, medina charm, and relaxed coastal days.",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop&auto=format",
    tags: ["beach", "city", "relax"],
    lat: 35.8256,
    lng: 10.636,
  },
  {
    city: "Sfax",
    country: "Tunisia",
    region: "North Africa",
    note: "Historic harbor, market streets, and southern charm.",
    image:
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=800&h=600&fit=crop&auto=format",
    tags: ["city", "culture", "harbor"],
    lat: 34.7406,
    lng: 10.7603,
  },
  {
    city: "Cairo",
    country: "Egypt",
    region: "North Africa",
    note: "Pyramids, desert landscapes, and unforgettable history.",
    image:
      "https://images.unsplash.com/photo-1589739900243-4b52a6f3c3b8?w=800&h=600&fit=crop&auto=format",
    tags: ["history", "culture", "adventure"],
    lat: 30.0444,
    lng: 31.2357,
  },
  {
    city: "Casablanca",
    country: "Morocco",
    region: "North Africa",
    note: "Modern energy, coastal views, and lively local culture.",
    image:
      "https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?w=800&h=600&fit=crop&auto=format",
    tags: ["city", "culture", "food"],
    lat: 33.5731,
    lng: -7.5898,
  },
  {
    city: "Marrakech",
    country: "Morocco",
    region: "North Africa",
    note: "Markets, riads, and desert-side discovery for a vivid stay.",
    image:
      "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=800&h=600&fit=crop&auto=format",
    tags: ["culture", "market", "adventure"],
    lat: 31.6295,
    lng: -7.9811,
  },
]

export const destinationCatalog = fallbackCatalog

const knownCountryCities: Record<string, string[]> = {
  tunisia: ["Tunis", "Sousse", "Sfax"],
  morocco: ["Casablanca", "Marrakech", "Rabat"],
  egypt: ["Cairo", "Alexandria", "Luxor"],
  algeria: ["Algiers", "Oran", "Constantine"],
  libya: ["Tripoli", "Benghazi", "Misrata"],
}

function weatherCodeToMeta(code: number) {
  const map: Record<number, { icon: string; condition: string }> = {
    0: { icon: "☀️", condition: "Clear" },
    1: { icon: "🌤", condition: "Mostly clear" },
    2: { icon: "⛅", condition: "Partly cloudy" },
    3: { icon: "☁️", condition: "Cloudy" },
    45: { icon: "🌫", condition: "Fog" },
    48: { icon: "🌫", condition: "Fog" },
    51: { icon: "🌦", condition: "Light drizzle" },
    53: { icon: "🌦", condition: "Drizzle" },
    55: { icon: "🌧", condition: "Drizzle" },
    56: { icon: "🌧", condition: "Freezing drizzle" },
    57: { icon: "🌧", condition: "Freezing drizzle" },
    61: { icon: "🌧", condition: "Rain" },
    63: { icon: "🌧", condition: "Rain" },
    65: { icon: "🌧", condition: "Heavy rain" },
    66: { icon: "🌧", condition: "Freezing rain" },
    67: { icon: "🌧", condition: "Freezing rain" },
    71: { icon: "❄️", condition: "Snow" },
    73: { icon: "❄️", condition: "Snow" },
    75: { icon: "❄️", condition: "Heavy snow" },
    80: { icon: "🌦", condition: "Rain showers" },
    81: { icon: "🌧", condition: "Heavy showers" },
    82: { icon: "🌧", condition: "Heavy showers" },
    85: { icon: "🌨", condition: "Snow showers" },
    86: { icon: "🌨", condition: "Snow showers" },
    95: { icon: "⛈", condition: "Thunderstorm" },
    96: { icon: "⛈", condition: "Thunderstorm" },
    99: { icon: "⛈", condition: "Thunderstorm" },
  }
  return map[code] ?? { icon: "🌤", condition: "Mixed" }
}

function getCityImage(city: string, country: string) {
  const map: Record<string, string> = {
    Tunis:
      "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&h=600&fit=crop&auto=format",
    Sousse:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop&auto=format",
    Sfax:
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=800&h=600&fit=crop&auto=format",
    Cairo:
      "https://images.unsplash.com/photo-1589739900243-4b52a6f3c3b8?w=800&h=600&fit=crop&auto=format",
    Casablanca:
      "https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?w=800&h=600&fit=crop&auto=format",
    Marrakech:
      "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=800&h=600&fit=crop&auto=format",
  }

  return map[city] ?? `https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=600&fit=crop&auto=format`
}

export async function searchDestinations(query: string): Promise<TravelSearchItem[]> {
  const value = query.trim()
  if (!value) return []

  // 1. Primary: Mapbox Geocoding (global coverage, lightning-fast, high precision)
  if (hasMapboxToken()) {
    try {
      const params = new URLSearchParams({
        access_token: getMapboxToken(),
        limit: "8",
        language: "fr,en",
        types: "place,locality,region,country",
      })
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?${params.toString()}`
      )
      if (res.ok) {
        const data = await res.json()
        const features = (data.features ?? []) as any[]
        if (features.length > 0) {
          return features
            .filter((f) => Array.isArray(f.center) && f.center.length >= 2)
            .map((f) => {
              const countryContext = f.context?.find((c: any) => c.id?.startsWith("country"))
              const country = countryContext?.text || (f.place_type?.includes("country") ? f.text : "")
              const city = f.text || f.place_name?.split(",")[0] || value
              return {
                city,
                country: country || f.place_name?.split(",").slice(1).join(",").trim() || "Monde",
                region: f.place_name || city,
                note: country ? `Destination en ${country}.` : "Destination de voyage.",
                image: getCityImage(city, country),
                tags: ["destination", (country || "").toLowerCase()].filter(Boolean),
                lat: Number(f.center[1]),
                lng: Number(f.center[0]),
              }
            })
        }
      }
    } catch (err) {
      console.warn("Mapbox destination search failed, using fallback:", err)
    }
  }

  // 2. Open-Meteo Geocoding fallback
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(value)}&count=8&language=en&format=json`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    )

    if (!response.ok) throw new Error("Geocoding request failed")

    const data = await response.json()
    const results = (data.results ?? []) as Array<any>

    // Same homonym trap as geocodeCity: Open-Meteo returns Pai, Indonesia
    // before Pai, Thailand. Rank exact name + populated places first so the
    // suggestion the user taps (and the [0] fallback) is the real city.
    const normQuery = value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
    const ranked = results.slice().sort((a, b) => {
      const an = String(a?.name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
      const bn = String(b?.name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
      const aExact = an === normQuery ? 1 : 0
      const bExact = bn === normQuery ? 1 : 0
      if (aExact !== bExact) return bExact - aExact
      const ap = Number(a?.population) || 0
      const bp = Number(b?.population) || 0
      if (ap !== bp) return bp - ap
      return 0
    })

    const mapped = ranked
      .filter((item) => item.name && item.country)
      .map((item) => ({
        city: item.name,
        country: item.country,
        region: item.admin1 || item.country,
        note: `Popular destination in ${item.country}.`,
        image: getCityImage(item.name, item.country),
        tags: ["destination", item.country.toLowerCase()],
        lat: Number(item.latitude),
        lng: Number(item.longitude),
      }))

    if (mapped.length > 0) return mapped
  } catch (error) {
    console.warn("Destination geocoding failed, using fallback catalog:", error)
  }

  const lower = value.toLowerCase()
  return destinationCatalog
    .filter((item) => {
      const haystack = [
        item.city,
        item.country,
        item.region,
        item.note,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(lower)
    })
    .slice(0, 8)
}

export async function searchPlaces(
  query: string,
  cityContext?: string,
): Promise<PlaceSearchResult[]> {
  const value = query.trim()
  if (!value) return []

  const isGenericTerm = /^(hotel|hotels|hostel|hostels|restaurant|cafe|bar|stay|residence|bnb|monument|museum|airport|gare|station)$/i.test(value)
  const searchQuery = isGenericTerm && cityContext
    ? `${value}, ${cityContext.trim()}`
    : value

  // 1. Primary: Mapbox Places Geocoding
  if (hasMapboxToken()) {
    try {
      const params = new URLSearchParams({
        access_token: getMapboxToken(),
        limit: "8",
        language: "fr,en",
        types: "poi,address,neighborhood,locality,place",
      })
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?${params.toString()}`
      )
      if (res.ok) {
        const data = await res.json()
        const features = (data.features ?? []) as any[]
        if (features.length > 0) {
          return features
            .filter((f) => Array.isArray(f.center) && f.center.length >= 2)
            .map((f) => ({
              name: String(f.text || f.place_name?.split(",")[0] || value).trim(),
              address: String(f.place_name || value),
              lat: Number(f.center[1]),
              lng: Number(f.center[0]),
            }))
        }
      }
    } catch (err) {
      console.warn("Mapbox place search fallback to Nominatim:", err)
    }
  }

  // 2. Nominatim fallback
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=jsonv2&addressdetails=1&limit=10`,
      { headers: { Accept: "application/json", "Accept-Language": "fr,en;q=0.8" } },
    )
    if (!response.ok) throw new Error("Place search failed")

    const results = (await response.json()) as Array<any>
    if (results.length > 0) {
      return results
        .filter((item) => item.display_name && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
        .map((item) => {
          const addr = item.address || {}
          const name =
            item.name ||
            addr.hotel ||
            addr.tourism ||
            addr.building ||
            addr.amenity ||
            addr.shop ||
            addr.road ||
            addr.city ||
            addr.town ||
            addr.village ||
            item.display_name.split(",")[0]
          return {
            name: String(name).trim(),
            address: item.display_name,
            lat: Number(item.lat),
            lng: Number(item.lon),
          }
        })
    }
  } catch (err) {
    console.warn("Place search failed:", err)
  }

  // Never return a fake Paris pin for an unknown worldwide query — callers
  // would draw the place in Paris. Empty lets the UI say "no results".
  return []
}

export async function reverseGeocode(lat: number, lng: number): Promise<PlaceSearchResult | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1`,
      { headers: { Accept: "application/json", "Accept-Language": "fr,en;q=0.8" } },
    )
    if (!response.ok) return null
    const item = await response.json()
    if (!item || !item.display_name) return null
    const addr = item.address || {}
    const name =
      item.name ||
      addr.hotel ||
      addr.tourism ||
      addr.building ||
      addr.amenity ||
      addr.shop ||
      addr.road ||
      addr.city ||
      item.display_name.split(",")[0]
    return {
      name: String(name).trim(),
      address: item.display_name,
      lat,
      lng,
    }
  } catch (err) {
    console.warn("Reverse geocode failed:", err)
    return null
  }
}

export async function getSuggestedCitiesForCountry(country: string): Promise<string[]> {
  const value = country.trim()
  if (!value) return []

  try {
    const results = await searchDestinations(value)
    const matches = results.filter(
      (item) =>
        item.country.toLowerCase() === value.toLowerCase() ||
        item.city.toLowerCase() === value.toLowerCase(),
    )

    if (matches.length > 0) {
      return [...new Set(matches.map((item) => item.city))].slice(0, 6)
    }
  } catch (error) {
    console.warn("Country suggestion lookup failed:", error)
  }

  const direct = knownCountryCities[value.toLowerCase()]
  if (direct && direct.length > 0) return direct

  const fallback = destinationCatalog.filter((item) =>
    item.country.toLowerCase().includes(value.toLowerCase()),
  )
  return [...new Set(fallback.map((item) => item.city))].slice(0, 6)
}

export async function getWeatherByCity(city: string): Promise<WeatherSnapshot | null> {
  const query = city.trim()
  if (!query) return null

  try {
    const matches = await searchDestinations(query)
    const place = matches.find((item) => item.city.toLowerCase() === query.toLowerCase()) ?? matches[0]
    if (!place) return null

    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`,
      {
        headers: { Accept: "application/json" },
      },
    )

    if (!weatherResponse.ok) throw new Error("Weather request failed")

    const weather = await weatherResponse.json()
    const current = weather.current ?? {}
    const daily = weather.daily ?? {}
    const code = Number(current.weather_code ?? 0)
    const meta = weatherCodeToMeta(code)

    const dailyForecast = (daily.time ?? []).map((day: string, index: number) => {
      const forecastCode = Number(daily.weather_code?.[index] ?? 0)
      return {
        day,
        icon: weatherCodeToMeta(forecastCode).icon,
        high: Math.round(Number(daily.temperature_2m_max?.[index] ?? 0)),
        low: Math.round(Number(daily.temperature_2m_min?.[index] ?? 0)),
      }
    })

    return {
      city: place.city,
      country: place.country,
      date: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      icon: meta.icon,
      condition: meta.condition,
      temp: Math.round(Number(current.temperature_2m ?? 0)),
      feels: Math.round(Number(current.apparent_temperature ?? 0)),
      humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
      rain: Math.round(Number(current.precipitation ?? 0)),
      wind: Math.round(Number(current.wind_speed_10m ?? 0)),
      forecast: dailyForecast.map((entry) => ({
        day: new Date(entry.day).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        icon: entry.icon,
        high: entry.high,
        low: entry.low,
      })),
    }
  } catch (error) {
    console.warn("Weather fetch failed for city:", city, error)
    return null
  }
}

export type FlightOffer = {
  id: string
  airline: string
  price: number
  currency: string
  origin: string
  destination: string
  departureAt: string
  arrivalAt: string
  duration: string
  cabin: string
}

export type HotelOffer = {
  id: string
  name: string
  city: string
  country: string
  price: number
  currency: string
  rating?: number
  distanceKm?: number
  image?: string
}

export type ProviderStatus = {
  provider: string
  status: "live" | "fallback" | "missing"
  message: string
}

const fallbackFlightOffers: FlightOffer[] = [
  {
    id: "fallback-tunis-sousse",
    airline: "Tunisair",
    price: 48,
    currency: "USD",
    origin: "TUN",
    destination: "SUS",
    departureAt: "2026-09-10T08:30:00",
    arrivalAt: "2026-09-10T09:15:00",
    duration: "45m",
    cabin: "Economy",
  },
  {
    id: "fallback-sousse-sfax",
    airline: "Tunisair",
    price: 52,
    currency: "USD",
    origin: "SUS",
    destination: "SFX",
    departureAt: "2026-09-11T10:10:00",
    arrivalAt: "2026-09-11T11:05:00",
    duration: "55m",
    cabin: "Economy",
  },
  {
    id: "fallback-tunis-casablanca",
    airline: "Air Arabia",
    price: 74,
    currency: "USD",
    origin: "TUN",
    destination: "CMN",
    departureAt: "2026-09-12T15:20:00",
    arrivalAt: "2026-09-12T17:00:00",
    duration: "1h 40m",
    cabin: "Economy",
  },
]

const fallbackHotelOffers: HotelOffer[] = [
  {
    id: "fallback-tunis-medina",
    name: "Dar Tunis Medina",
    city: "Tunis",
    country: "Tunisia",
    price: 69,
    currency: "USD",
    rating: 4.8,
    distanceKm: 1.2,
    image:
      "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&h=600&fit=crop&auto=format",
  },
  {
    id: "fallback-sousse-coast",
    name: "Sousse Coast House",
    city: "Sousse",
    country: "Tunisia",
    price: 74,
    currency: "USD",
    rating: 4.7,
    distanceKm: 1.8,
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop&auto=format",
  },
  {
    id: "fallback-sfax-old-town",
    name: "Sfax Old Town Stay",
    city: "Sfax",
    country: "Tunisia",
    price: 58,
    currency: "USD",
    rating: 4.6,
    distanceKm: 1.4,
    image:
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=800&h=600&fit=crop&auto=format",
  },
  {
    id: "fallback-casablanca-morocco",
    name: "Casablanca Studio",
    city: "Casablanca",
    country: "Morocco",
    price: 81,
    currency: "USD",
    rating: 4.5,
    distanceKm: 2.1,
    image:
      "https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?w=800&h=600&fit=crop&auto=format",
  },
]

function getAmadeusConfig() {
  const key = (import.meta.env.VITE_AMADEUS_API_KEY ?? "").trim()
  const secret = (import.meta.env.VITE_AMADEUS_API_SECRET ?? "").trim()
  const baseUrl = (import.meta.env.VITE_AMADEUS_BASE_URL ?? "https://test.api.amadeus.com").replace(/\/$/, "")

  return {
    key,
    secret,
    baseUrl,
    enabled: Boolean(key && secret),
  }
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

async function getAmadeusToken(): Promise<string | null> {
  const { enabled, key, secret, baseUrl } = getAmadeusConfig()
  if (!enabled) return null

  const data = await fetchJson<{ access_token?: string }>(`${baseUrl}/v1/security/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: key,
      client_secret: secret,
    }),
  })

  return data.access_token ?? null
}

async function getCityCode(city: string): Promise<string | null> {
  const value = city.trim()
  if (!value) return null

  const { enabled, baseUrl } = getAmadeusConfig()
  if (!enabled) return null

  const token = await getAmadeusToken()
  if (!token) return null

  try {
    const data = await fetchJson<{ data?: Array<{ iataCode?: string; address?: { cityName?: string } }> }>(
      `${baseUrl}/v1/reference-data/locations?keyword=${encodeURIComponent(value)}&subType=CITY&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    const result = data.data?.[0]
    if (!result) return null

    return result.iataCode ?? null
  } catch (error) {
    console.warn("Amadeus city lookup failed:", error)
    return null
  }
}

export async function getTravelProviderStatus(): Promise<ProviderStatus[]> {
  const statuses: ProviderStatus[] = [
    {
      provider: "Open-Meteo",
      status: "live",
      message: "Live geocoding and weather data are enabled without API keys.",
    },
  ]

  const { enabled } = getAmadeusConfig()
  if (enabled) {
    statuses.push({
      provider: "Amadeus",
      status: "live",
      message: "Flights and hotels are connected via Amadeus credentials.",
    })
  } else {
    statuses.push({
      provider: "Amadeus",
      status: "missing",
      message: "Set VITE_AMADEUS_API_KEY and VITE_AMADEUS_API_SECRET to enable flight and hotel search.",
    })
  }

  return statuses
}

export async function searchFlights(options: {
  origin: string
  destination: string
  departureDate: string
  adults?: number
  maxResults?: number
}): Promise<FlightOffer[]> {
  const { origin, destination, departureDate, adults = 1, maxResults = 5 } = options
  const { enabled, baseUrl } = getAmadeusConfig()

  if (!enabled) {
    const lowerOrigin = origin.toLowerCase()
    const lowerDestination = destination.toLowerCase()
    return fallbackFlightOffers
      .filter((offer) => {
        const matchesOrigin = offer.origin.toLowerCase().includes(lowerOrigin) || lowerOrigin.includes(offer.origin.toLowerCase())
        const matchesDestination =
          offer.destination.toLowerCase().includes(lowerDestination) || lowerDestination.includes(offer.destination.toLowerCase())
        return (
          (matchesOrigin && matchesDestination) ||
          (lowerOrigin.includes("tunis") && lowerDestination.includes("sousse")) ||
          (lowerOrigin.includes("sousse") && lowerDestination.includes("sfax"))
        )
      })
      .slice(0, maxResults)
  }

  const token = await getAmadeusToken()
  if (!token) {
    const lowerOrigin = origin.toLowerCase()
    const lowerDestination = destination.toLowerCase()
    return fallbackFlightOffers
      .filter((offer) => {
        const matchesOrigin = offer.origin.toLowerCase().includes(lowerOrigin) || lowerOrigin.includes(offer.origin.toLowerCase())
        const matchesDestination =
          offer.destination.toLowerCase().includes(lowerDestination) || lowerDestination.includes(offer.destination.toLowerCase())
        return matchesOrigin && matchesDestination
      })
      .slice(0, maxResults)
  }

  const originCode = await getCityCode(origin)
  const destinationCode = await getCityCode(destination)
  if (!originCode || !destinationCode) {
    const lowerOrigin = origin.toLowerCase()
    const lowerDestination = destination.toLowerCase()
    return fallbackFlightOffers
      .filter((offer) => {
        const matchesOrigin = offer.origin.toLowerCase().includes(lowerOrigin) || lowerOrigin.includes(offer.origin.toLowerCase())
        const matchesDestination =
          offer.destination.toLowerCase().includes(lowerDestination) || lowerDestination.includes(offer.destination.toLowerCase())
        return matchesOrigin && matchesDestination
      })
      .slice(0, maxResults)
  }

  try {
    const data = await fetchJson<{
      data?: Array<{
        id?: string
        airline?: string
        itineraries?: Array<{
          duration?: string
          segments?: Array<{
            departure?: { at?: string; iataCode?: string }
            arrival?: { at?: string; iataCode?: string }
          }>
        }>
        price?: { total?: string; currency?: string }
        travelerPricings?: Array<{ fareDetailsBySegment?: Array<{ cabin?: string }> }>
      }>
    }>(
      `${baseUrl}/v2/shopping/flight-offers?originLocationCode=${originCode}&destinationLocationCode=${destinationCode}&departureDate=${encodeURIComponent(departureDate)}&adults=${adults}&max=${maxResults}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    return (data.data ?? []).map((offer, index) => {
      const itinerary = offer.itineraries?.[0]
      const segment = itinerary?.segments?.[0]
      const lastSegment = itinerary?.segments?.[itinerary.segments.length - 1]
      const cabin = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin ?? "Economy"

      return {
        id: offer.id ?? `flight-${index}`,
        airline: segment?.departure?.iataCode ?? "Airline",
        price: Number(offer.price?.total ?? 0),
        currency: offer.price?.currency ?? "USD",
        origin: segment?.departure?.iataCode ?? originCode,
        destination: lastSegment?.arrival?.iataCode ?? destinationCode,
        departureAt: segment?.departure?.at ?? departureDate,
        arrivalAt: lastSegment?.arrival?.at ?? departureDate,
        duration: itinerary?.duration ?? "N/A",
        cabin,
      }
    })
  } catch (error) {
    console.warn("Amadeus flight search failed:", error)
    return fallbackFlightOffers.slice(0, maxResults)
  }
}

export async function searchHotels(options: {
  city: string
  maxResults?: number
}): Promise<HotelOffer[]> {
  const { city, maxResults = 5 } = options
  const { enabled, baseUrl } = getAmadeusConfig()

  if (!enabled) {
    const lowerCity = city.toLowerCase()
    return fallbackHotelOffers
      .filter((hotel) => hotel.city.toLowerCase().includes(lowerCity) || lowerCity.includes(hotel.city.toLowerCase()))
      .slice(0, maxResults)
  }

  const token = await getAmadeusToken()
  if (!token) {
    const lowerCity = city.toLowerCase()
    return fallbackHotelOffers
      .filter((hotel) => hotel.city.toLowerCase().includes(lowerCity) || lowerCity.includes(hotel.city.toLowerCase()))
      .slice(0, maxResults)
  }

  const cityCode = await getCityCode(city)
  if (!cityCode) {
    const lowerCity = city.toLowerCase()
    return fallbackHotelOffers
      .filter((hotel) => hotel.city.toLowerCase().includes(lowerCity) || lowerCity.includes(hotel.city.toLowerCase()))
      .slice(0, maxResults)
  }

  try {
    const data = await fetchJson<{
      data?: Array<{
        hotel?: { hotelId?: string; name?: string }
        hotelDistance?: { distance?: number; distanceUnit?: string }
        offers?: Array<{ price?: { total?: string; currency?: string } }>
      }>
    }>(
      `${baseUrl}/v1/reference-data/locations/hotels/by-city?cityCode=${cityCode}&radius=40&radiusUnit=KM&hotelSource=ALL`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    return (data.data ?? []).slice(0, maxResults).map((hotel, index) => {
      const price = Number(hotel.offers?.[0]?.price?.total ?? 0)
      const distanceKm = hotel.hotelDistance?.distance

      return {
        id: hotel.hotel?.hotelId ?? `hotel-${index}`,
        name: hotel.hotel?.name ?? city,
        city,
        country: "Tunisia",
        price,
        currency: hotel.offers?.[0]?.price?.currency ?? "USD",
        rating: undefined,
        distanceKm: distanceKm ? Number(distanceKm) : undefined,
      }
    })
  } catch (error) {
    console.warn("Amadeus hotel search failed:", error)
    const lowerCity = city.toLowerCase()
    return fallbackHotelOffers
      .filter((hotel) => hotel.city.toLowerCase().includes(lowerCity) || lowerCity.includes(hotel.city.toLowerCase()))
      .slice(0, maxResults)
  }
}

export async function getWeatherForTripCities(cities: string[]): Promise<WeatherSnapshot[]> {
  const data = await Promise.all(
    cities.map(async (city) => getWeatherByCity(city)),
  )
  return data.filter((item): item is WeatherSnapshot => Boolean(item))
}

// ── Destination guide (keyless live data) ─────────────────────────────────────
// Combines three free, no-API-key sources (all CORS-enabled for browsers):
// - Open-Meteo geocoding → city coordinates (already used elsewhere)
// - Overpass API (OpenStreetMap) → real nearby places, hotels, activities
// - Wikipedia REST API → real city summary + photo
// This is the best keyless option: hotel-booking APIs (Amadeus, Booking.com)
// all require secret keys, so hotels come from OpenStreetMap POIs with a
// deep link out to Booking.com for actual booking.

export type GuidePoi = {
  id: string
  name: string
  kind: string
  detail: string
  lat: number
  lng: number
  mapsUrl: string
}

export type DestinationGuide = {
  coords: { lat: number; lng: number } | null
  places: GuidePoi[]
  hotels: GuidePoi[]
  activities: GuidePoi[]
  wikiExtract: string | null
  wikiImage: string | null
}

const guideCache = new Map<string, Promise<DestinationGuide>>()

export function mapsUrlFor(lat: number, lng: number, name?: string): string {
  const q = name
    ? `${encodeURIComponent(name)}@${lat},${lng}`
    : `${lat},${lng}`
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

export function bookingSearchUrl(city: string, country?: string): string {
  const ss = encodeURIComponent(country ? `${city}, ${country}` : city)
  return `https://www.booking.com/searchresults.html?ss=${ss}`
}

export function activitySearchUrl(city: string): string {
  return `https://www.getyourguide.com/s/?q=${encodeURIComponent(city)}`
}

export async function getGuideCoords(city: string, country?: string): Promise<{ lat: number; lng: number } | null> {
  const value = city.trim()
  if (!value) return null
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(value)}&count=5&language=en&format=json`,
      { headers: { Accept: "application/json" } },
    )
    if (res.ok) {
      const data = await res.json()
      const results = (data.results ?? []) as Array<any>
      const match = country
        ? results.find((r) => String(r.country || "").toLowerCase() === country.toLowerCase())
        : undefined
      const pick = match ?? results[0]
      if (pick && Number.isFinite(Number(pick.latitude)) && Number.isFinite(Number(pick.longitude))) {
        return { lat: Number(pick.latitude), lng: Number(pick.longitude) }
      }
    }
  } catch {
    // fall through to Nominatim
  }
  try {
    const q = country ? `${value}, ${country}` : value
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=1`,
      { headers: { Accept: "application/json" } },
    )
    if (res.ok) {
      const results = (await res.json()) as Array<any>
      const first = results?.[0]
      if (first && Number.isFinite(Number(first.lat)) && Number.isFinite(Number(first.lon))) {
        return { lat: Number(first.lat), lng: Number(first.lon) }
      }
    }
  } catch (err) {
    console.warn("Guide geocoding failed:", err)
  }
  return null
}

type OverpassElement = {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function poiFromElement(el: OverpassElement, fallbackKind: string): GuidePoi | null {
  const tags = el.tags || {}
  const name = (tags.name || "").trim()
  if (!name) return null
  const lat = Number(el.lat ?? el.center?.lat)
  const lng = Number(el.lon ?? el.center?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const kindRaw = tags.tourism || tags.leisure || tags.amenity || tags.historic || fallbackKind
  const kind = String(kindRaw).replace(/_/g, " ")
  const detailBits = [tags["addr:street"], tags["addr:city"]].filter(Boolean)
  return {
    id: `${el.type}/${el.id}`,
    name,
    kind: kind.charAt(0).toUpperCase() + kind.slice(1),
    detail: detailBits.join(", ") || kind.charAt(0).toUpperCase() + kind.slice(1),
    lat,
    lng,
    mapsUrl: mapsUrlFor(lat, lng, name),
  }
}

async function fetchOverpassPois(
  lat: number,
  lng: number,
  radiusM: number,
  filter: string,
  limit: number,
): Promise<GuidePoi[]> {
  const query = `[out:json][timeout:20];(nwr[${filter}](around:${radiusM},${lat},${lng}););out center ${limit * 2};`
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    })
    if (!res.ok) throw new Error(`Overpass status ${res.status}`)
    const data = await res.json()
    const elements = (data.elements ?? []) as OverpassElement[]
    const seen = new Set<string>()
    const out: GuidePoi[] = []
    // Prefer well-described POIs (website/wikipedia tag) first.
    const scored = elements
      .map((el) => {
        const poi = poiFromElement(el, "Place")
        if (!poi) return null
        const tags = el.tags || {}
        const score = (tags.wikipedia ? 2 : 0) + (tags.website ? 1 : 0)
        return { poi, score }
      })
      .filter((x): x is { poi: GuidePoi; score: number } => Boolean(x))
      .sort((a, b) => b.score - a.score)
    for (const { poi } of scored) {
      const key = poi.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(poi)
      if (out.length >= limit) break
    }
    return out
  } catch (err) {
    console.warn("Overpass POI fetch failed:", err)
    return []
  }
}

async function getWikipediaSummary(city: string): Promise<{ extract: string | null; image: string | null }> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`,
      { headers: { Accept: "application/json" } },
    )
    if (!res.ok) return { extract: null, image: null }
    const data = await res.json()
    if (data?.type === "disambiguation") return { extract: null, image: null }
    return {
      extract: typeof data?.extract === "string" ? data.extract : null,
      image: typeof data?.thumbnail?.source === "string" ? data.thumbnail.source : null,
    }
  } catch (err) {
    console.warn("Wikipedia summary failed:", err)
    return { extract: null, image: null }
  }
}

/** Live guide for a destination: best places, hotels and activities + wiki summary. Results are cached per city. */
export function getDestinationGuide(city: string, country?: string): Promise<DestinationGuide> {
  const key = `${city.trim().toLowerCase()}|${(country || "").trim().toLowerCase()}`
  const cached = guideCache.get(key)
  if (cached) return cached
  const task = (async (): Promise<DestinationGuide> => {
    const empty: DestinationGuide = {
      coords: null,
      places: [],
      hotels: [],
      activities: [],
      wikiExtract: null,
      wikiImage: null,
    }
    const coords = await getGuideCoords(city, country)
    const wiki = await getWikipediaSummary(city.trim())
    empty.wikiExtract = wiki.extract
    empty.wikiImage = wiki.image
    if (!coords) return empty
    empty.coords = coords
    const [places, hotels, activities] = await Promise.all([
      fetchOverpassPois(coords.lat, coords.lng, 25000, `"tourism"~"^(attraction|museum|viewpoint|castle|monument|memorial|artwork|gallery|zoo|aquarium)$"`, 8),
      fetchOverpassPois(coords.lat, coords.lng, 20000, `"tourism"~"^(hotel|hostel|guest_house|apartment|resort|motel)$"`, 8),
      fetchOverpassPois(coords.lat, coords.lng, 25000, `"tourism"~"^(theme_park|water_park)$"|"leisure"~"^(park|garden|stadium|water_park|miniature_golf|sports_centre|marina|beach_resort)$"`, 8),
    ])
    empty.places = places
    empty.hotels = hotels
    empty.activities = activities
    return empty
  })()
  guideCache.set(key, task)
  task.catch(() => guideCache.delete(key))
  return task
}

// ── Hidden gems (multi-source aggregator) ───────────────────────────────────
// Aggregates real, notable-but-off-beat spots from multiple respected sources:
// 1. Curated Atlas Obscura & Local Scout insider database (with traveler tips)
// 2. Wikivoyage (Wikimedia's dedicated traveler-written guide)
// 3. OpenStreetMap Overpass (secret viewpoints, secluded gardens, ruins & street art)
// 4. Wikipedia Heritage (curiosities and landmarks)

export type HiddenGemPoi = {
  id: string
  title: string
  extract: string
  description: string
  image: string | null
  lat: number
  lng: number
  distanceKm: number
  mapsUrl: string
  city: string
  source?: string
  sourceIcon?: string
  sourceBadgeColor?: string
  submittedBy?: string
  category?: "food" | "bar" | "culture" | "nature" | "activity"
  emoji?: string
  votes?: number
  tags?: string[]
}

const hiddenGemsCache = new Map<string, Promise<HiddenGemPoi[]>>()

/**
 * Fetch lesser-known spots around a destination from multiple sources:
 * - Curated Insider spots (Atlas Obscura, Local Scout, Culture Trip)
 * - Wikivoyage travel guide articles
 * - OpenStreetMap scenic viewpoints, gardens & historic ruins
 * - Wikipedia heritage curiosities
 */
export function getHiddenGemsForCity(city: string, country?: string, maxResults = 14): Promise<HiddenGemPoi[]> {
  const key = `${city.trim().toLowerCase()}|${(country || "").trim().toLowerCase()}|${maxResults}`
  const cached = hiddenGemsCache.get(key)
  if (cached) return cached

  const task = (async (): Promise<HiddenGemPoi[]> => {
    const normCity = city.trim().toLowerCase()
    const collected: HiddenGemPoi[] = []
    const seenTitles = new Set<string>()

    const addGem = (g: HiddenGemPoi) => {
      const cleanTitle = g.title.trim().toLowerCase()
      if (seenTitles.has(cleanTitle)) return
      seenTitles.add(cleanTitle)
      collected.push(g)
    }

    // 1. First, check curated handpicked insider spots
    const curatedMatches = CURATED_HIDDEN_GEMS.filter(
      (g) =>
        g.city.toLowerCase() === normCity ||
        normCity.includes(g.city.toLowerCase()) ||
        g.city.toLowerCase().includes(normCity),
    )

    for (const c of curatedMatches) {
      addGem({
        id: c.id,
        title: c.title,
        extract: c.tip,
        description: c.tags.join(" · "),
        image: c.image,
        lat: c.lat,
        lng: c.lng,
        distanceKm: 0,
        mapsUrl: c.mapsUrl || mapsUrlFor(c.lat, c.lng, c.title),
        city: c.city,
        source: c.source,
        sourceIcon: c.sourceIcon,
        sourceBadgeColor: c.sourceBadgeColor,
        submittedBy: c.submittedBy,
        category: c.category,
        emoji: c.emoji,
        votes: c.votes,
        tags: c.tags,
      })
    }

    // 2. Fetch live coordinates for geo-based sources
    const coords = await getGuideCoords(city, country)
    if (!coords) return collected

    // 3. In parallel, query Wikivoyage, OpenStreetMap Overpass, and Wikipedia
    const [wikivoyageHits, osmHits, wikipediaHits] = await Promise.all([
      // ── Source A: Wikivoyage Travel Guide ──
      (async (): Promise<HiddenGemPoi[]> => {
        try {
          const res = await fetch(
            `https://en.wikivoyage.org/w/api.php?action=query&list=geosearch&gscoord=${coords.lat}%7C${coords.lng}&gsradius=15000&gslimit=15&format=json&origin=*`,
            { headers: { Accept: "application/json" } },
          )
          if (!res.ok) return []
          const data = await res.json()
          const rawHits = ((data?.query?.geosearch ?? []) as Array<any>)
            .filter((h) => h?.title && String(h.title).toLowerCase() !== normCity)
            .slice(0, 6)

          const list = await Promise.all(
            rawHits.map(async (h): Promise<HiddenGemPoi | null> => {
              try {
                const sRes = await fetch(
                  `https://en.wikivoyage.org/api/rest_v1/page/summary/${encodeURIComponent(String(h.title))}`,
                  { headers: { Accept: "application/json" } },
                )
                if (!sRes.ok) return null
                const summary = await sRes.json()
                if (summary?.type === "disambiguation") return null
                const extract = typeof summary?.extract === "string" ? summary.extract : ""
                if (!extract || extract.length < 25) return null
                const lat = Number(h.lat) || coords.lat
                const lng = Number(h.lon) || coords.lng
                return {
                  id: `wikivoyage-${summary?.pageid ?? String(h.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                  title: String(summary?.title ?? h.title),
                  extract,
                  description: typeof summary?.description === "string" ? summary.description : "Wikivoyage guide",
                  image: typeof summary?.thumbnail?.source === "string" ? summary.thumbnail.source : null,
                  lat,
                  lng,
                  distanceKm: Number.isFinite(Number(h.dist)) ? Math.round((Number(h.dist) / 1000) * 10) / 10 : 0,
                  mapsUrl: mapsUrlFor(lat, lng, String(summary?.title ?? h.title)),
                  city: city.trim(),
                  source: "Wikivoyage",
                  sourceIcon: "✈️",
                  sourceBadgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
                  submittedBy: "Wikivoyage Travel Guide",
                }
              } catch {
                return null
              }
            }),
          )
          return list.filter((g): g is HiddenGemPoi => Boolean(g))
        } catch {
          return []
        }
      })(),

      // ── Source B: OpenStreetMap (Overpass secret spots, viewpoints, gardens) ──
      (async (): Promise<HiddenGemPoi[]> => {
        try {
          const filter = `"tourism"~"^(viewpoint|artwork|gallery)$"|"historic"~"^(ruins|monument|memorial|castle|archaeological_site)$"|"leisure"~"^(garden|nature_reserve)$"`
          const pois = await fetchOverpassPois(coords.lat, coords.lng, 12000, filter, 6)
          return pois.map((p) => ({
            id: `osm-${p.id}`,
            title: p.name,
            extract: `${p.kind} in ${city.trim()}. A scenic, lesser-known local spot away from major crowds.`,
            description: p.detail,
            image: null,
            lat: p.lat,
            lng: p.lng,
            distanceKm: 0,
            mapsUrl: p.mapsUrl,
            city: city.trim(),
            source: "OpenStreetMap",
            sourceIcon: "📍",
            sourceBadgeColor: "bg-sky-50 text-sky-700 border-sky-200",
            submittedBy: "OpenStreetMap Explorer",
          }))
        } catch {
          return []
        }
      })(),

      // ── Source C: Wikipedia Heritage & Curiosities ──
      (async (): Promise<HiddenGemPoi[]> => {
        try {
          const res = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${coords.lat}%7C${coords.lng}&gsradius=10000&gslimit=20&format=json&origin=*`,
            { headers: { Accept: "application/json" } },
          )
          if (!res.ok) return []
          const data = await res.json()
          const rawHits = ((data?.query?.geosearch ?? []) as Array<any>)
            .filter((h) => h?.title && String(h.title).toLowerCase() !== normCity)
            .slice(0, 6)

          const list = await Promise.all(
            rawHits.map(async (h): Promise<HiddenGemPoi | null> => {
              try {
                const sRes = await fetch(
                  `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(h.title))}`,
                  { headers: { Accept: "application/json" } },
                )
                if (!sRes.ok) return null
                const summary = await sRes.json()
                if (summary?.type === "disambiguation") return null
                const extract = typeof summary?.extract === "string" ? summary.extract : ""
                if (!extract || extract.length < 25) return null
                const lat = Number(h.lat) || coords.lat
                const lng = Number(h.lon) || coords.lng
                return {
                  id: `wiki-${summary?.pageid ?? String(h.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                  title: String(summary?.title ?? h.title),
                  extract,
                  description: typeof summary?.description === "string" ? summary.description : "Historical curiosity",
                  image: typeof summary?.thumbnail?.source === "string" ? summary.thumbnail.source : null,
                  lat,
                  lng,
                  distanceKm: Number.isFinite(Number(h.dist)) ? Math.round((Number(h.dist) / 1000) * 10) / 10 : 0,
                  mapsUrl: mapsUrlFor(lat, lng, String(summary?.title ?? h.title)),
                  city: city.trim(),
                  source: "Wikipedia",
                  sourceIcon: "🏛️",
                  sourceBadgeColor: "bg-slate-100 text-slate-700 border-slate-200",
                  submittedBy: "Wikipedia Heritage",
                }
              } catch {
                return null
              }
            }),
          )
          return list.filter((g): g is HiddenGemPoi => Boolean(g))
        } catch {
          return []
        }
      })(),
    ])

    // Interleave results from all external sources so the user sees a diverse mix
    const maxExternal = Math.max(wikivoyageHits.length, osmHits.length, wikipediaHits.length)
    for (let i = 0; i < maxExternal; i++) {
      if (wikivoyageHits[i]) addGem(wikivoyageHits[i])
      if (osmHits[i]) addGem(osmHits[i])
      if (wikipediaHits[i]) addGem(wikipediaHits[i])
    }

    return collected.slice(0, maxResults)
  })()

  hiddenGemsCache.set(key, task)
  task.catch(() => hiddenGemsCache.delete(key))
  return task
}
