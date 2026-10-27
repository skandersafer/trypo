import { useState, useRef, useEffect, useMemo } from "react"
import type { Screen } from "../App"
import ShareSheet from "../components/ShareSheet"
import SyncStatusBadge from "../components/SyncStatusBadge"
import DestinationHubModal, { type DestinationHubTarget } from "../components/DestinationHubModal"
import GoogleMapsPlacePicker from "../components/GoogleMapsPlacePicker"
import { useAuth } from "../lib/auth"
import { searchDestinations, type TravelSearchItem } from "../lib/travelApi"
import { hasMapboxToken } from "../lib/mapbox"
import { TransportIcon, MapIcon, ToolIcon } from "../components/icons"
import { addBooking, addItineraryItem, updateBooking, updateItineraryItem, deleteBooking, deleteItineraryItem, claimMissingServerMembership, generateTripInviteCode, getActiveTripId, getDestinationStayDays, getMyTrips, getTripDetails, getUserTripPermission, setActiveTripId, syncTripDestinations, deleteTrip, generateUuid, updateTripDates } from "../lib/trips"
import { getMyTripMembership, setTripVisibility } from "../lib/communityLive"
import { getStoredRates, fetchLiveRates, getRelativeRate } from "../lib/currencyApi"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

type Stop = {
  id: string
  city: string
  dates: string
  days: number
  emoji: string
  startDate?: string
  endDate?: string
  /** Real GPS from the search suggestion (Mapbox worldwide) — saved so the
   * map never has to re-guess "Pai" vs homonyms later. */
  lat?: number
  lng?: number
  country?: string
}

type TransportLeg = {
  icon: string
  label: string
  detail: string
  duration: string
  price: string
  distanceKm?: string
  reference?: string
  departureDate?: string
  departureTime?: string
  arrivalTime?: string
  operator?: string
}

type CurrencyCode = "EUR" | "USD" | "GBP" | "TND"

const currencySymbols: Record<CurrencyCode, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  TND: "د.ت",
}

const normalizeDuration = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return "—"
  if (/^\d+(?:[.,]\d+)?$/.test(trimmed)) return `${trimmed}h`
  if (/^\d+(?:[.,]\d+)?\s*(hours?|hrs?)$/i.test(trimmed)) {
    return `${trimmed.replace(/\s*(hours?|hrs?)$/i, "")}h`
  }
  return trimmed
}

const durationToMinutes = (value: string) => {
  const hours = Number(value.match(/(\d+(?:[.,]\d+)?)\s*h/i)?.[1]?.replace(",", ".") || 0)
  const minutes = Number(value.match(/(\d+)\s*m/i)?.[1] || 0)
  return Math.round(hours * 60 + minutes)
}

const formatClockTime = (date: Date) =>
  date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })

const cityCoordinates: Record<string, { lat: number; lng: number }> = {
  lyon: { lat: 45.764, lng: 4.835 },
  marseille: { lat: 43.296, lng: 5.369 },
  nice: { lat: 43.710, lng: 7.262 },
  paris: { lat: 48.8566, lng: 2.3522 },
  tunis: { lat: 36.8065, lng: 10.1815 },
  sousse: { lat: 35.8256, lng: 10.636 },
  sfax: { lat: 34.7406, lng: 10.7603 },
  rome: { lat: 41.9028, lng: 12.4964 },
  barcelona: { lat: 41.3851, lng: 2.1734 },
  madrid: { lat: 40.4168, lng: -3.7038 },
  london: { lat: 51.5072, lng: -0.1276 },
  berlin: { lat: 52.52, lng: 13.405 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
  pai: { lat: 19.36168, lng: 98.43973 },
  chiangmai: { lat: 18.7883, lng: 98.9853 },
  "chiang mai": { lat: 18.7883, lng: 98.9853 },
  "mae hong son": { lat: 19.302, lng: 97.9654 },
  maehongson: { lat: 19.302, lng: 97.9654 },
  phuket: { lat: 7.8804, lng: 98.3923 },
  krabi: { lat: 8.0863, lng: 98.9063 },
  pattaya: { lat: 12.9236, lng: 100.8825 },
}

const toLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

const parseIsoDate = (date: string) => {
  if (!date) return null
  // A date-only ISO string is a calendar date, not a UTC instant. Parsing it
  // with `new Date("YYYY-MM-DD")` shifts the day in most timezones.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00`)
    : new Date(date)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const getDaysBetweenDates = (start: string, end: string) => {
  if (!start || !end) return 1
  const startDate = parseIsoDate(start)
  const endDate = parseIsoDate(end)
  if (!startDate || !endDate) return 1

  const diffMs = endDate.getTime() - startDate.getTime()
  const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  return diffDays
}

const addDays = (isoDate: string | null | undefined, amount: number) => {
  if (!isoDate) {
    const base = new Date()
    base.setHours(0, 0, 0, 0)
    base.setDate(base.getDate() + amount)
    return toLocalIsoDate(base)
  }

  const parsed = parseIsoDate(isoDate)
  if (!parsed) return isoDate

  const next = new Date(parsed)
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() + amount)
  return toLocalIsoDate(next)
}

const formatShortDate = (isoDate: string | null | undefined) => {
  if (!isoDate) return "Dates TBD"
  const parsed = parseIsoDate(isoDate)
  if (!parsed) return isoDate

  return `${MONTH_NAMES[parsed.getMonth()].slice(0, 3)} ${parsed.getDate()}`
}

const formatDateRange = (startDate: string | null | undefined, endDate: string | null | undefined) => {
  if (!startDate && !endDate) return "Dates TBD"
  if (!startDate || !endDate) return `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`
  if (startDate === endDate) return formatShortDate(startDate)

  const start = parseIsoDate(startDate)
  const end = parseIsoDate(endDate)
  if (!start || !end) return "Dates TBD"

  return `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`
}

const normalizeStopDates = (route: Stop[], tripStartDate?: string) => {
  if (!route.length) return route

  const baseDate = tripStartDate || route[0]?.startDate || toLocalIsoDate(new Date())
  let cursor = parseIsoDate(baseDate) ?? new Date()
  cursor.setHours(0, 0, 0, 0)

  // departure_date is the checkout day (exclusive): a 1-day stop is
  // Jun 12 → Jun 13, and the next stop checks in on Jun 13 — contiguous,
  // no gap day. The old code added an extra +1 day between stops, which
  // inflated every trip's total day count.
  return route.map((stop) => {
    const stayDays = Math.max(1, Number(stop.days) || 1)
    const start = new Date(cursor)
    const end = new Date(cursor)
    end.setDate(end.getDate() + stayDays)

    const startIso = toLocalIsoDate(start)
    const endIso = toLocalIsoDate(end)
    const nextStop = {
      ...stop,
      days: stayDays,
      startDate: startIso,
      endDate: endIso,
      dates: formatDateRange(startIso, endIso),
    }

    cursor = new Date(end)

    return nextStop
  })
}

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number | null => {
  if (!Number.isFinite(a?.lat) || !Number.isFinite(a?.lng) || !Number.isFinite(b?.lat) || !Number.isFinite(b?.lng)) return null
  const toRadians = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

const formatKmFr = (km: number): string => `${Math.round(km).toLocaleString("fr-FR")} km`

const stopCoord = (s: any): { lat: number; lng: number } | null => {
  const lat = Number(s?.lat)
  const lng = Number(s?.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 ? { lat, lng } : null
}

const getDistanceBetweenCities = (
  from: string,
  to: string,
  fromCoord?: { lat: number; lng: number } | null,
  toCoord?: { lat: number; lng: number } | null,
) => {
  // Universal first: real GPS carried by the stops (works for every
  // city/ville worldwide — Phuket, Chiang Mai, Pai — no hardcoded list).
  const liveKm = fromCoord && toCoord ? haversineKm(fromCoord, toCoord) : null
  if (liveKm !== null && Number.isFinite(liveKm)) return formatKmFr(liveKm)

  const a = (from || "").trim().toLowerCase()
  const b = (to || "").trim().toLowerCase()
  if (!a || !b || a === b) return "Distance à définir"

  const fromHard = cityCoordinates[a] || cityCoordinates[a.replace(/\s+/g, "")]
  const toHard = cityCoordinates[b] || cityCoordinates[b.replace(/\s+/g, "")]

  if (fromHard && toHard) {
    const km = haversineKm(fromHard, toHard)
    if (km !== null) return formatKmFr(km)
  }

  const knownPairs: Record<string, string> = {
    "lyon-marseille": "316 km",
    "lyon-nice": "292 km",
    "marseille-nice": "164 km",
    "paris-lyon": "465 km",
    "paris-marseille": "661 km",
    "tunis-sousse": "140 km",
    "sousse-sfax": "220 km",
    "tunis-sfax": "270 km",
  }

  return knownPairs[`${a}-${b}`] || knownPairs[`${b}-${a}`] || "Distance à définir"
}

const defaultLeg: TransportLeg = {
  icon: "➕",
  label: "Add transport",
  detail: "Tap to plan how you get there",
  duration: "",
  price: "",
}

const transportOptions = [
  { icon: "✈️", label: "Flight" },
  { icon: "🚆", label: "Train" },
  { icon: "🚌", label: "Bus" },
  { icon: "⛴", label: "Ferry" },
  { icon: "🚕", label: "Taxi / Grab" },
  { icon: "🏍", label: "Motorbike" },
]

function formatLegPrice(amount: any, currency?: string): string {
  const n = Number(amount)
  if (!Number.isFinite(n) || n === 0) return ""
  const sym =
    currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "TND" ? "د.ت" : "€"
  return `${n} ${sym}`
}

/**
 * Map a synced transport/flight booking back onto a route leg key
 * (`${fromStopId}→${toStopId}`). Route-leg saves embed the stop ids in the
 * booking notes; older/transport-tab rows are matched by city against
 * consecutive stops via the linked itinerary title ("Flight: A → B").
 */
function legKeyForBooking(b: any, itemsById: Map<string, any>, stops: Stop[]): string | null {
  if (b?.booking_type !== "transport" && b?.booking_type !== "flight") return null
  const notes = String(b?.notes || "")
  const idsPart = notes.split(" · ")[0] || ""
  const idBits = idsPart.split(" → ").map((x) => (x || "").trim())
  if (
    idBits.length >= 2 &&
    stops.some((s) => s.id === idBits[0]) &&
    stops.some((s) => s.id === idBits[1])
  ) {
    return `${idBits[0]}→${idBits[1]}`
  }
  const linked = b?.itinerary_item_id ? itemsById.get(b.itinerary_item_id) : null
  const title = String(linked?.title || "")
  const body = title.includes(":") ? title.slice(title.indexOf(":") + 1) : title
  const cityBits = body.split("→").map((x) => (x || "").trim())
  if (cityBits.length >= 2) {
    const sFrom = stops.find((s) => s.city.toLowerCase() === cityBits[0].toLowerCase())
    const sTo = stops.find((s) => s.city.toLowerCase() === cityBits[1].toLowerCase())
    if (sFrom && sTo) {
      const idx = stops.findIndex((s) => s.id === sFrom.id)
      if (idx >= 0 && stops[idx + 1]?.id === sTo.id) return `${sFrom.id}→${sTo.id}`
    }
  }
  return null
}

function legFromBooking(b: any, linked: any): TransportLeg {
  const title = String(linked?.title || "")
  const rawLabel = title.includes(":") ? title.slice(0, title.indexOf(":")).trim() : ""
  const opt = transportOptions.find((t) => t.label.toLowerCase() === rawLabel.toLowerCase())
  const label = opt ? opt.label : b.booking_type === "flight" ? "Flight" : "Transport"
  const icon = opt ? opt.icon : b.booking_type === "flight" ? "✈️" : "🚆"
  const details = String(linked?.details || "")
  const segs = details
    .split(" · ")
    .map((s) => s.trim())
    .filter(Boolean)
  const isMeta = (s: string) =>
    /^ref\s*:/i.test(s) ||
    /^\d[\d.,]*\s*h/i.test(s) ||
    /^\d+\s*min/i.test(s) ||
    /^duration tbd$/i.test(s)
  const core = segs.filter((s) => !isMeta(s))
  const detail = core.join(" · ") || String(b.provider || title || "Planned transport")
  const durSeg = segs.find((s) => !/^ref\s*:/i.test(s) && /^\d/i.test(s)) || ""
  const toISODate = (v: any) => (v ? String(v).slice(0, 10) : undefined)
  const toHM = (v: any) => (v && String(v).length >= 16 ? String(v).slice(11, 16) : undefined)
  return {
    icon,
    label,
    detail,
    duration: durSeg,
    price: formatLegPrice(b.amount, b.currency),
    reference: b.confirmation_code || undefined,
    departureDate: toISODate(b.starts_at),
    departureTime: toHM(b.starts_at),
    arrivalTime: toHM(b.ends_at),
    operator: b.provider || undefined,
  }
}

/**
 * Rebuild route legs from synced bookings so a transport added on one
 * account renders on the route of every other account. The visual leg card
 * used to live in per-device localStorage only, which is exactly why one
 * phone showed "Flight" legs while the other showed "Add transport".
 */
function hydrateLegsFromBookings(
  bookings: Array<any>,
  itineraryItems: Array<any>,
  stops: Stop[],
): Record<string, TransportLeg> {
  const out: Record<string, TransportLeg> = {}
  const itemsById = new Map<string, any>()
  for (const it of itineraryItems || []) if (it?.id) itemsById.set(it.id, it)
  for (const b of bookings || []) {
    const key = legKeyForBooking(b, itemsById, stops)
    if (!key || out[key]) continue
    const linked = b?.itinerary_item_id ? itemsById.get(b.itinerary_item_id) : null
    out[key] = legFromBooking(b, linked)
  }
  return out
}

function findLegBookingLink(
  bookings: Array<any>,
  itineraryItems: Array<any>,
  legKey: string,
  stops: Stop[],
): { booking: any; item: any } | null {
  const itemsById = new Map<string, any>()
  for (const it of itineraryItems || []) if (it?.id) itemsById.set(it.id, it)
  const booking = (bookings || []).find(
    (b) =>
      (b?.booking_type === "transport" || b?.booking_type === "flight") &&
      legKeyForBooking(b, itemsById, stops) === legKey,
  )
  if (!booking) return null
  const item = booking?.itinerary_item_id ? itemsById.get(booking.itinerary_item_id) : null
  return { booking, item: item || null }
}

type StopDetail = {
  stay: { name: string; type: string; price: string; emoji: string }
  activities: { time: string; title: string; emoji: string; cost: string }[]
}

const stopDetails: Record<string, StopDetail> = {}

const initialRoute: Stop[] = []

type DestinationSuggestion = {
  city: string
  emoji?: string
  dates?: string
  days?: number
  country?: string
  /** Real GPS from searchDestinations (Mapbox worldwide). Carried through
   * addStop -> persistStops so every ville/city pins exactly. */
  lat?: number
  lng?: number
}

function getSmartSuggestedDestinations(
  currentStops: Stop[],
  tripDestinations?: string[],
): DestinationSuggestion[] {
  const allKnown = [
    ...(tripDestinations || []),
    ...currentStops.map((s) => s.city),
  ].map((c) => String(c).toLowerCase().trim())

  const isTunisia = allKnown.some((c) =>
    ["tunis", "sousse", "sfax", "djerba", "hammamet", "monastir", "bizerte", "tunisie", "tozeur"].some((t) => c.includes(t))
  )
  const isItaly = allKnown.some((c) =>
    ["rome", "roma", "florence", "firenze", "venice", "venise", "milan", "naples", "napoli", "italie", "italy"].some((t) => c.includes(t))
  )
  const isJapan = allKnown.some((c) =>
    ["tokyo", "kyoto", "osaka", "hiroshima", "nara", "japon", "japan"].some((t) => c.includes(t))
  )
  const isSpain = allKnown.some((c) =>
    ["barcelona", "barcelone", "madrid", "seville", "séville", "valencia", "valence", "espagne", "spain"].some((t) => c.includes(t))
  )
  const isFrance = allKnown.some((c) =>
    ["paris", "lyon", "marseille", "nice", "bordeaux", "france"].some((t) => c.includes(t))
  )

  let candidates: DestinationSuggestion[] = []

  if (isTunisia) {
    candidates = [
      { city: "Sousse", emoji: "🌴", country: "Tunisia", days: 2 },
      { city: "Djerba", emoji: "🏝️", country: "Tunisia", days: 3 },
      { city: "Sidi Bou Saïd", emoji: "🏛️", country: "Tunisia", days: 1 },
      { city: "Hammamet", emoji: "🏖️", country: "Tunisia", days: 2 },
      { city: "Tozeur", emoji: "🏜️", country: "Tunisia", days: 2 },
    ]
  } else if (isItaly) {
    candidates = [
      { city: "Florence", emoji: "🎨", country: "Italy", days: 2 },
      { city: "Rome", emoji: "🍕", country: "Italy", days: 3 },
      { city: "Venise", emoji: "🎭", country: "Italy", days: 2 },
      { city: "Milan", emoji: "🏛️", country: "Italy", days: 2 },
      { city: "Naples", emoji: "🌋", country: "Italy", days: 2 },
    ]
  } else if (isJapan) {
    candidates = [
      { city: "Kyoto", emoji: "⛩️", country: "Japan", days: 3 },
      { city: "Tokyo", emoji: "🍣", country: "Japan", days: 3 },
      { city: "Osaka", emoji: "🏯", country: "Japan", days: 2 },
      { city: "Nara", emoji: "🦌", country: "Japan", days: 1 },
    ]
  } else if (isSpain) {
    candidates = [
      { city: "Barcelone", emoji: "☀️", country: "Spain", days: 3 },
      { city: "Madrid", emoji: "🥘", country: "Spain", days: 3 },
      { city: "Séville", emoji: "💃", country: "Spain", days: 2 },
      { city: "Valence", emoji: "🍊", country: "Spain", days: 2 },
    ]
  } else if (isFrance) {
    candidates = [
      { city: "Paris", emoji: "🗼", country: "France", days: 3 },
      { city: "Nice", emoji: "🏖️", country: "France", days: 2 },
      { city: "Lyon", emoji: "🦁", country: "France", days: 2 },
      { city: "Bordeaux", emoji: "🍷", country: "France", days: 2 },
    ]
  } else {
    candidates = [
      { city: "Rome", emoji: "🍕", country: "Italy", days: 3 },
      { city: "Tokyo", emoji: "🍣", country: "Japan", days: 4 },
      { city: "Barcelone", emoji: "☀️", country: "Spain", days: 3 },
      { city: "Tunis", emoji: "🏛️", country: "Tunisia", days: 2 },
      { city: "New York", emoji: "🗽", country: "United States", days: 4 },
      { city: "Amsterdam", emoji: "🚲", country: "Netherlands", days: 2 },
      { city: "Marrakech", emoji: "🌴", country: "Morocco", days: 3 },
      { city: "Paris", emoji: "🗼", country: "France", days: 3 },
    ]
  }

  return candidates.filter(
    (c) => !allKnown.includes(c.city.toLowerCase().trim())
  ).slice(0, 5)
}

const ITEM_HEIGHT = 80

// ── Operator catalog per transport type ──────────────────────────────────────
type OperatorOption = {
  name: string
  detail: string
  duration: string
  price: string
  priceNum: number
  badge?: string
  bookUrl: string
  logo: string
}

const operatorCatalog: Record<string, OperatorOption[]> = {
  Flight: [
    {
      name: "Tunisair",
      detail: "TU-201 · Non-stop",
      duration: "1h 20m",
      price: "$89",
      priceNum: 89,
      badge: "Best value",
      bookUrl: "https://www.tunisair.com",
      logo: "✈️",
    },
    {
      name: "Nouvelair",
      detail: "BJ-412 · Regional route",
      duration: "1h 10m",
      price: "$98",
      priceNum: 98,
      bookUrl: "https://www.nouvelair.com",
      logo: "✈️",
    },
    {
      name: "Aero Tunisia",
      detail: "AT-305 · Flexible fare",
      duration: "1h 35m",
      price: "$76",
      priceNum: 76,
      badge: "Cheapest",
      bookUrl: "https://www.aerotunisia.com",
      logo: "✈️",
    },
  ],
  Train: [
    {
      name: "SNCFT · Intercity",
      detail: "AC coach · Direct",
      duration: "1h 50m",
      price: "$26",
      priceNum: 26,
      badge: "Most popular",
      bookUrl: "https://www.sncft.com.tn",
      logo: "🚆",
    },
    {
      name: "SNCFT · Express",
      detail: "Comfort class",
      duration: "2h 10m",
      price: "$34",
      priceNum: 34,
      bookUrl: "https://www.sncft.com.tn",
      logo: "🚆",
    },
    {
      name: "SNCFT · Regional",
      detail: "Day service",
      duration: "2h 45m",
      price: "$18",
      priceNum: 18,
      badge: "Budget",
      bookUrl: "https://www.sncft.com.tn",
      logo: "🚆",
    },
  ],
  Bus: [
    {
      name: "Tunisia Shuttle",
      detail: "VIP coach · Direct",
      duration: "1h 50m",
      price: "$34",
      priceNum: 34,
      badge: "Most comfortable",
      bookUrl: "https://www.tunisiashuttle.tn",
      logo: "🚌",
    },
    {
      name: "Coastal Coach",
      detail: "Standard AC · Via stops",
      duration: "2h 15m",
      price: "$22",
      priceNum: 22,
      bookUrl: "https://www.coastalcoach.tn",
      logo: "🚌",
    },
    {
      name: "Route Express",
      detail: "Economy coach",
      duration: "2h 35m",
      price: "$16",
      priceNum: 16,
      badge: "Budget",
      bookUrl: "https://www.routeexpress.tn",
      logo: "🚌",
    },
  ],
  Ferry: [
    {
      name: "Mediterranean Ferries",
      detail: "Fast crossing · Coastal route",
      duration: "1h 30m",
      price: "$22",
      priceNum: 22,
      badge: "Fastest",
      bookUrl: "https://www.mediterraneanferries.tn",
      logo: "⛴",
    },
    {
      name: "Harbor Line",
      detail: "Shared crossing",
      duration: "2h",
      price: "$16",
      priceNum: 16,
      badge: "Popular",
      bookUrl: "https://www.harborline.tn",
      logo: "⛴",
    },
    {
      name: "Coast Link",
      detail: "Car + passenger service",
      duration: "3h",
      price: "$10",
      priceNum: 10,
      badge: "Budget",
      bookUrl: "https://www.coastlink.tn",
      logo: "⛴",
    },
  ],
  "Taxi / Grab": [
    {
      name: "Taxi Tunis",
      detail: "Private car · Local booking",
      duration: "45m",
      price: "$18",
      priceNum: 18,
      badge: "Recommended",
      bookUrl: "https://www.taxitunis.tn",
      logo: "🚕",
    },
    {
      name: "Ride Coast",
      detail: "Private transfer",
      duration: "50m",
      price: "$15",
      priceNum: 15,
      bookUrl: "https://www.ridecoast.tn",
      logo: "🚕",
    },
    {
      name: "City Cab",
      detail: "Negotiate fare",
      duration: "1h",
      price: "$12",
      priceNum: 12,
      badge: "Cheapest",
      bookUrl: "https://www.citycab.tn",
      logo: "🚕",
    },
  ],
  Motorbike: [
    {
      name: "Ride & Go",
      detail: "125cc scooter · Daily rental",
      duration: "Self",
      price: "$8/d",
      priceNum: 8,
      badge: "Most free",
      bookUrl: "#",
      logo: "🏍",
    },
    {
      name: "Tunisia Scooters",
      detail: "250cc · Local pickup",
      duration: "Self",
      price: "$15/d",
      priceNum: 15,
      bookUrl: "#",
      logo: "🏍",
    },
  ],
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

function MiniCalendar({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (d: string) => void
}) {
  const today = new Date()
  const initYear = selected
    ? parseInt(selected.split("-")[0])
    : today.getFullYear()
  const initMonth = selected
    ? parseInt(selected.split("-")[1]) - 1
    : today.getMonth()
  const [viewYear, setViewYear] = useState(initYear)
  const [viewMonth, setViewMonth] = useState(initMonth)

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const selParts = selected ? selected.split("-").map(Number) : []
  const isSelected = (d: number) =>
    selParts.length === 3 &&
    selParts[0] === viewYear &&
    selParts[1] - 1 === viewMonth &&
    selParts[2] === d
  const isToday = (d: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === d
  const isPast = (d: number) =>
    new Date(viewYear, viewMonth, d) <
    new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const prev = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else setViewMonth((m) => m - 1)
  }
  const next = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else setViewMonth((m) => m + 1)
  }

  const pick = (d: number) => {
    const mm = String(viewMonth + 1).padStart(2, "0")
    const dd = String(d).padStart(2, "0")
    onSelect(`${viewYear}-${mm}-${dd}`)
  }

  const fmt = (iso: string) => {
    if (!iso) return ""
    const [y, m, d] = iso.split("-").map(Number)
    return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}, ${y}`
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        border: "1.5px solid rgba(59,65,200,0.15)",
        background: "white",
      }}
    >
      {/* Month nav */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(59,65,200,0.05)" }}
      >
        <button
          onClick={prev}
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: "rgba(59,65,200,0.1)" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M8 10L4 6l4-4"
              stroke="#3B41C8"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="text-navy font-black text-[14px]">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={next}
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: "rgba(59,65,200,0.1)" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M4 10l4-4-4-4"
              stroke="#3B41C8"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 px-3 pt-2 pb-1">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-black uppercase tracking-wider"
            style={{ color: "#94a3b8" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 px-3 pb-3 gap-y-1">
        {cells.map((d, i) => (
          <div
            key={i}
            className="flex items-center justify-center"
            style={{ height: "32px" }}
          >
            {d ? (
              <button
                onClick={() => !isPast(d) && pick(d)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold transition-all"
                style={{
                  background: isSelected(d)
                    ? "linear-gradient(135deg, #3B41C8, #06C4D4)"
                    : isToday(d)
                      ? "rgba(59,65,200,0.1)"
                      : "transparent",
                  color: isSelected(d)
                    ? "white"
                    : isPast(d)
                      ? "#cbd5e1"
                      : isToday(d)
                        ? "#3B41C8"
                        : "#0D0F2E",
                  cursor: isPast(d) ? "default" : "pointer",
                  fontWeight: isSelected(d) || isToday(d) ? "900" : "600",
                }}
              >
                {d}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Selected date display */}
      {selected && (
        <div
          className="mx-3 mb-3 py-2 px-3 rounded-xl flex items-center gap-2"
          style={{ background: "rgba(59,65,200,0.07)" }}
        >
          <span className="text-navy font-black text-[13px]">
            {fmt(selected)}
          </span>
        </div>
      )}
    </div>
  )
}

const TIME_SLOTS = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
  "23:00",
]

function TransportLegModal({
  legKey,
  stops,
  initialType,
  initialLeg,
  defaultDate,
  onClose,
  onSave,
  onDelete,
}: {
  legKey: string
  stops: Stop[]
  initialType: string
  initialLeg?: TransportLeg
  defaultDate?: string
  onClose: () => void
  onSave: (leg: TransportLeg) => void
  onDelete?: () => void
}) {
  const [step, setStep] = useState<"type" | "options" | "manual">(
    initialLeg ? "manual" : "type",
  )
  const [selectedType, setSelectedType] = useState(initialLeg?.label || initialType)
  const [selectedOperator, setSelectedOperator] =
    useState<OperatorOption | null>(null)
  const [manualDate, setManualDate] = useState(initialLeg?.departureDate || defaultDate || "")
  const [manualTime, setManualTime] = useState("")
  const [manualRef, setManualRef] = useState("")
  const [manualPrice, setManualPrice] = useState(
    initialLeg?.price.replace(/[^\d.,]/g, "").replace(",", ".") || "",
  )
  const [manualCurrency, setManualCurrency] = useState<CurrencyCode>(
    initialLeg?.price.includes("$")
      ? "USD"
      : initialLeg?.price.includes("£")
        ? "GBP"
        : initialLeg?.price.includes("د.ت")
          ? "TND"
          : "EUR",
  )
  const [manualDuration, setManualDuration] = useState(initialLeg?.duration || "")
  const [sortBy, setSortBy] = useState<"price" | "duration">("price")

  const fromId = legKey.split("→")[0]
  const toId = legKey.split("→")[1]
  const fromStop = stops.find((s) => s.id === fromId)
  const toStop = stops.find((s) => s.id === toId)
  const fromCity = fromStop?.city ?? fromId
  const toCity = toStop?.city ?? toId

  const operators = (operatorCatalog[selectedType] ?? [])
    .slice()
    .sort((a, b) =>
      sortBy === "price"
        ? a.priceNum - b.priceNum
        : a.duration.localeCompare(b.duration),
    )

  const chosenIcon =
    transportOptions.find((t) => t.label === selectedType)?.icon ?? "🚌"

  const confirmOperator = (op: OperatorOption) => {
    const distance = getDistanceBetweenCities(fromCity, toCity, stopCoord(fromStop), stopCoord(toStop))
    const departureTime = manualTime || "12:00"
    const departure = defaultDate ? new Date(`${defaultDate}T${departureTime}:00`) : null
    const arrival = departure
      ? new Date(departure.getTime() + durationToMinutes(normalizeDuration(op.duration)) * 60000)
      : null
    onSave({
      icon: chosenIcon,
      label: selectedType,
      detail: `${op.name}${distance !== "Distance à définir" ? ` · ${distance}` : ""}`,
      duration: op.duration,
      price: op.price,
      distanceKm: distance,
      operator: op.name,
      departureDate: defaultDate,
      departureTime: defaultDate ? departureTime : undefined,
      arrivalTime: arrival ? formatClockTime(arrival) : undefined,
    })
  }

  const confirmManual = () => {
    const distance = getDistanceBetweenCities(fromCity, toCity, stopCoord(fromStop), stopCoord(toStop))
    const duration = normalizeDuration(manualDuration)
    const departure = manualDate && manualTime ? new Date(`${manualDate}T${manualTime}:00`) : null
    const arrival = departure ? new Date(departure.getTime() + durationToMinutes(duration) * 60000) : null
    onSave({
      icon: chosenIcon,
      label: selectedType,
      detail: `${manualRef ? `Ref: ${manualRef}` : "My ticket"}${distance !== "Distance à définir" ? ` · ${distance}` : ""}`,
      duration,
      price: manualPrice ? `${manualPrice} ${currencySymbols[manualCurrency]}` : "—",
      distanceKm: distance,
      reference: manualRef || undefined,
      departureDate: manualDate || undefined,
      departureTime: manualTime || undefined,
      arrivalTime: arrival ? formatClockTime(arrival) : undefined,
      operator: selectedType,
    })
  }

  return (
    <div
      className="fixed inset-0 flex items-end"
      style={{
        zIndex: 110,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(6px)",
        width: "min(390px, 100vw)",
        height: "min(844px, 100vh)",
        left: "50%",
        top: "50%",
        right: "auto",
        bottom: "auto",
        transform: "translate(-50%, -50%)",
      }}
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-[32px] overflow-hidden flex flex-col"
        style={{
          height: "min(520px, calc(100vh - 32px))",
          maxHeight: "calc(100vh - 32px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-4" />
          <div className="flex items-center gap-3">
            {step !== "type" && (
              <button
                onClick={() => setStep("type")}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(59,65,200,0.08)" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M9 11L5 7l4-4"
                    stroke="#3B41C8"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            <div className="flex-1">
              <h3 className="text-navy font-black text-[17px]">
                {step === "type"
                  ? "How are you getting there?"
                  : step === "options"
                    ? `${selectedType} options`
                    : "Add your ticket"}
              </h3>
              <p className="text-slate-400 text-[11px]">
                {fromCity} → {toCity}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-300 text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <div
          className="overflow-y-auto overscroll-contain flex-1 min-h-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Step 1 — pick type */}
          {step === "type" && (
            <div className="p-5">
              <div className="grid grid-cols-3 gap-2.5 mb-5">
                {transportOptions.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => {
                      setSelectedType(t.label)
                    }}
                    className="flex flex-col items-center gap-2 py-4 rounded-2xl transition-all"
                    style={{
                      background:
                        selectedType === t.label
                          ? "rgba(59,65,200,0.08)"
                          : "#f8fafc",
                      outline:
                        selectedType === t.label
                          ? "2px solid #3B41C8"
                          : "2px solid transparent",
                    }}
                  >
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center text-[13px] font-black text-brand" style={{ background: "rgba(59,65,200,0.08)" }}><TransportIcon type={t.label} size={20} /></span>
                    <span
                      className="text-[11px] font-bold"
                      style={{
                        color: selectedType === t.label ? "#3B41C8" : "#94a3b8",
                      }}
                    >
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep("options")}
                  className="flex-1 py-4 rounded-2xl text-white font-black text-[14px] flex items-center justify-center gap-2"
                  style={{
                    background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                    boxShadow: "0 8px 24px rgba(59,65,200,0.3)",
                  }}
                >
                  Book options / prices
                </button>
                <button
                  type="button"
                  onClick={() => setStep("manual")}
                  className="px-4 py-4 rounded-2xl font-bold text-[13px]"
                  style={{
                    background: "rgba(59,65,200,0.07)",
                    color: "#3B41C8",
                  }}
                >
                  I add it myself
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — compare operators */}
          {step === "options" && (
            <div className="pb-6">
              {/* Sorting bar */}
              <div className="flex gap-2 px-5 py-3 border-b border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 mr-1 self-center">
                  Sort:
                </span>
                {(["price", "duration"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold capitalize"
                    style={{
                      background:
                        sortBy === s ? "#3B41C8" : "rgba(59,65,200,0.07)",
                      color: sortBy === s ? "white" : "#3B41C8",
                    }}
                  >
                    {s === "price" ? "Cheapest" : "Fastest"}
                  </button>
                ))}
              </div>

              {/* Operator cards */}
              <div className="px-5 pt-4 flex flex-col gap-3">
                {operators.map((op, i) => (
                  <div
                    key={i}
                    className="rounded-2xl overflow-hidden"
                    style={{
                      border:
                        selectedOperator?.name === op.name
                          ? "2px solid #3B41C8"
                          : "1.5px solid #f1f5f9",
                      boxShadow: "0 2px 12px rgba(59,65,200,0.06)",
                    }}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-[12px] font-black text-brand"
                            style={{ background: "rgba(59,65,200,0.07)" }}
                          >
                            <TransportIcon type={selectedType} size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-navy font-black text-[13px]">
                                {op.name}
                              </p>
                              {op.badge && (
                                <span
                                  className="px-2 py-0.5 rounded-full text-[9px] font-black"
                                  style={{
                                    background: "rgba(6,196,212,0.12)",
                                    color: "#06C4D4",
                                  }}
                                >
                                  {op.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-400 text-[11px]">
                              {op.detail}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-navy font-black text-[18px]">
                            {op.price}
                          </p>
                          <p className="text-slate-400 text-[10px]">
                            {op.duration}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-slate-50">
                        <button
                          onClick={() => setSelectedOperator(op)}
                          className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                          style={{
                            background:
                              selectedOperator?.name === op.name
                                ? "rgba(59,65,200,0.1)"
                                : "#f8fafc",
                            color:
                              selectedOperator?.name === op.name
                                ? "#3B41C8"
                                : "#64748b",
                            outline:
                              selectedOperator?.name === op.name
                                ? "1.5px solid #3B41C8"
                                : "none",
                          }}
                        >
                          {selectedOperator?.name === op.name
                            ? "✓ Selected"
                            : "Select"}
                        </button>
                        <a
                          href={op.bookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1"
                          style={{
                            background: "rgba(59,65,200,0.07)",
                            color: "#3B41C8",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Book ↗
                        </a>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setStep("manual")}
                  className="w-full py-3 rounded-2xl text-[12px] font-bold flex items-center justify-center gap-2"
                  style={{
                    border: "1.5px dashed rgba(59,65,200,0.25)",
                    color: "#3B41C8",
                  }}
                >
                  Already have a ticket? Add it manually
                </button>
              </div>

              {/* Confirm footer */}
              {selectedOperator && (
                <div
                  className="sticky bottom-0 px-5 pt-3 pb-6 bg-white"
                  style={{ borderTop: "1px solid #f1f5f9" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-navy font-black text-[14px]">
                        {selectedOperator.name}
                      </p>
                      <p className="text-slate-400 text-[11px]">
                        {selectedOperator.detail} · {selectedOperator.duration}
                      </p>
                    </div>
                    <p className="text-navy font-black text-[20px]">
                      {selectedOperator.price}
                    </p>
                  </div>
                  <button
                    onClick={() => confirmOperator(selectedOperator)}
                    className="w-full py-4 rounded-2xl text-white font-black text-[15px]"
                    style={{
                      background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                      boxShadow: "0 8px 24px rgba(59,65,200,0.3)",
                    }}
                  >
                    Add to trip plan
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3 — manual ticket entry */}
          {step === "manual" && (
            <div className="p-5 pb-8">
              <div
                className="rounded-2xl p-4 mb-5 flex items-center gap-3"
                style={{
                  background: "rgba(59,65,200,0.06)",
                  border: "1px solid rgba(59,65,200,0.12)",
                }}
              >
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-[14px] font-black text-brand flex-shrink-0" style={{ background: "rgba(59,65,200,0.08)" }}><TransportIcon type={selectedType} size={22} /></span>
                <div>
                  <p className="text-navy font-bold text-[13px]">
                    {fromCity} → {toCity}
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    Enter your {selectedType.toLowerCase()} details
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    Date of Departure
                  </p>
                  <MiniCalendar
                    selected={manualDate}
                    onSelect={setManualDate}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    Departure Time
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TIME_SLOTS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setManualTime(t)}
                        className="px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all"
                        style={{
                          background:
                            manualTime === t
                              ? "linear-gradient(135deg, #3B41C8, #06C4D4)"
                              : "rgba(59,65,200,0.06)",
                          color: manualTime === t ? "white" : "#3B41C8",
                          border:
                            manualTime === t
                              ? "none"
                              : "1px solid rgba(59,65,200,0.15)",
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <input
                    type="time"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    className="mt-2 w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold text-navy outline-none"
                    style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0" }}
                  />
                </div>
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                  {manualDate && manualTime && manualDuration
                    ? `Arrival will be calculated: ${formatClockTime(new Date(new Date(`${manualDate}T${manualTime}:00`).getTime() + durationToMinutes(normalizeDuration(manualDuration)) * 60000))}`
                    : "Add date, departure time and duration to calculate arrival."}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                    Booking Reference / Confirmation #
                  </p>
                  <input
                    type="text"
                    placeholder="e.g. TU8F3K or PG-101"
                    value={manualRef}
                    onChange={(e) => setManualRef(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-[13px] font-semibold text-navy outline-none font-mono"
                    style={{
                      background: "#f8fafc",
                      border: "1.5px solid #e2e8f0",
                    }}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                    Price Paid
                  </p>
                  <div className="flex gap-2">
                    <input
                     type="number"
                     min="0"
                     step="0.01"
                     placeholder="50"
                     value={manualPrice}
                     onChange={(e) => setManualPrice(e.target.value)}
                     className="min-w-0 flex-1 rounded-xl px-4 py-3 text-[13px] font-semibold text-navy outline-none"
                     style={{
                       background: "#f8fafc",
                       border: "1.5px solid #e2e8f0",
                     }}
                    />
                    <select
                     value={manualCurrency}
                     onChange={(e) => setManualCurrency(e.target.value as CurrencyCode)}
                     className="w-24 rounded-xl px-2 py-3 text-[13px] font-bold text-navy outline-none"
                     style={{
                       background: "#f8fafc",
                       border: "1.5px solid #e2e8f0",
                     }}
                    >
                     {Object.keys(currencySymbols).map((code) => (
                       <option key={code} value={code}>
                         {code}
                       </option>
                     ))}
                    </select>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                    Duration
                  </p>
                  <input
                    type="text"
                    placeholder="e.g. 2h 15m"
                    value={manualDuration}
                    onChange={(e) => setManualDuration(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-[13px] font-semibold text-navy outline-none"
                    style={{
                     background: "#f8fafc",
                     border: "1.5px solid #e2e8f0",
                    }}
                  />
                </div>
              </div>

              <button
                onClick={confirmManual}
                className="w-full mt-5 py-4 rounded-2xl text-white font-black text-[15px]"
                style={{
                  background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                  boxShadow: "0 8px 24px rgba(59,65,200,0.3)",
                }}
              >
                Save ticket
              </button>

              {initialLeg && onDelete && (
                <button
                  onClick={() => {
                    if (window.confirm("Supprimer ce transport ?")) {
                      onDelete()
                    }
                  }}
                  className="w-full mt-3 py-3.5 rounded-2xl font-bold text-[13px] transition-all hover:bg-red-100"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    color: "#ef4444",
                    border: "1.5px solid rgba(239,68,68,0.2)",
                  }}
                >
                  Delete ticket
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TripOverviewScreen({ navigate }: Props) {
  const { configured, user } = useAuth()
  const [showShare, setShowShare] = useState(false)
  const [trip, setTrip] = useState<any>(null)

  // Share-to-Community state (same toggle as Trip Crew sharing)
  const [communityPublic, setCommunityPublic] = useState(false)
  const [communityBusy, setCommunityBusy] = useState(false)
  const [communityError, setCommunityError] = useState<string | null>(null)

  const handleToggleCommunity = async () => {
    if (!trip?.id || communityBusy) return
    setCommunityBusy(true)
    setCommunityError(null)
    try {
      const res = await setTripVisibility(trip.id, !communityPublic)
      if (res.ok) {
        setCommunityPublic(!communityPublic)
        setTrip((prev: any) => (prev ? { ...prev, visibility: !communityPublic ? "public" : "private" } : prev))
      } else {
        setCommunityError(res.error || "Could not update visibility.")
      }
    } catch {
      setCommunityError("Could not update visibility.")
    } finally {
      setCommunityBusy(false)
    }
  }
  const [stops, setStops] = useState<Stop[]>([])
  const [loading, setLoading] = useState(true)
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set())
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({})
  const [swipeSnapping, setSwipeSnapping] = useState<Record<string, boolean>>(
    {},
  )
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [destinationQuery, setDestinationQuery] = useState("")
  const [destinationResults, setDestinationResults] = useState<DestinationSuggestion[]>([])
  const [isSearchingDestinations, setIsSearchingDestinations] = useState(false)
  const [expandedStop, setExpandedStop] = useState<string | null>(null)
  const [selectedHubDestination, setSelectedHubDestination] = useState<DestinationHubTarget | null>(null)
  const isSyncingRef = useRef(false)
  const [liveRates, setLiveRates] = useState<Record<string, number>>(() => getStoredRates().rates)
  const [userRole, setUserRole] = useState<string>("owner")
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeletingTrip, setIsDeletingTrip] = useState(false)
  const [showDatesModal, setShowDatesModal] = useState(false)
  const [editStartDate, setEditStartDate] = useState("")
  const [editEndDate, setEditEndDate] = useState("")
  const [savingDates, setSavingDates] = useState(false)
  const [datesError, setDatesError] = useState<string | null>(null)
  // "I left this trip" gate: a signed-in account that neither owns nor is a
  // member of the trip must not see the full trip editor as if it were still
  // part of the crew.
  const [notAMember, setNotAMember] = useState(false)
  const [memberChecked, setMemberChecked] = useState(false)

  const handleDeleteTrip = async () => {
    if (!trip?.id) return
    try {
      setIsDeletingTrip(true)
      await deleteTrip(trip.id)
      navigate("trips")
    } catch (err) {
      console.error("Delete trip error:", err)
    } finally {
      setIsDeletingTrip(false)
      setShowDeleteModal(false)
    }
  }

  useEffect(() => {
    void fetchLiveRates().then((data) => {
      if (data?.rates) setLiveRates(data.rates)
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    const runSearch = async () => {
      const query = destinationQuery.trim()
      if (!query) {
        setDestinationResults([])
        setIsSearchingDestinations(false)
        return
      }

      setIsSearchingDestinations(true)
      try {
        const matches: TravelSearchItem[] = await searchDestinations(query)
        if (cancelled) return

        setDestinationResults(
          matches.slice(0, 8).map((item) => ({
            city: item.city,
            country: item.country,
            emoji: "📍",
            dates: "Dates TBD",
            days: 1,
            lat: Number(item.lat),
            lng: Number(item.lng),
          })),
        )
      } catch {
        if (!cancelled) setDestinationResults([])
      } finally {
        if (!cancelled) setIsSearchingDestinations(false)
      }
    }

    runSearch()

    return () => {
      cancelled = true
    }
  }, [destinationQuery])

  const loadTrip = () => {
    const activeId = getActiveTripId()
    getTripDetails(activeId)
      .then(async (tripData) => {
        if (!tripData) {
          // The local store is empty for this account. Hydrate from the server
          // (covers a freshly joined member before the store write, and any
          // account whose store was wiped) before showing the empty state.
          console.info("[trypo] getTripDetails null for", activeId, "- hydrating via getMyTrips")
          const hydrated = await getMyTrips()
          const fallback = hydrated.find((t) => t.id === activeId) || hydrated[0]
          if (fallback) {
            tripData = fallback
            if (activeId) setActiveTripId(fallback.id)
          }
        }
        if (!tripData) {
          setTrip(null)
          setStops([])
          return
        }
        setTrip(tripData)
        setCommunityPublic((tripData as any)?.visibility === "public")
        let rawDestinations: any[] = tripData.trip_destinations || []
        // Sort by persisted position FIRST so a drag-reorder survives a
        // reload / map visit. Supabase returns rows unordered, which used to
        // reset the route to its old order on every remount.
        rawDestinations = rawDestinations.slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        if ((!rawDestinations || rawDestinations.length === 0) && Array.isArray((tripData as any).destinations) && (tripData as any).destinations.length > 0) {
          rawDestinations = (tripData as any).destinations.map((city: string, i: number) => ({
            id: generateUuid(),
            city,
            country: "Destination",
            nights: 1,
            position: i,
          }))
        }
        const liveStops: Stop[] = rawDestinations.map((d: any) => ({
          id: d.id || generateUuid(),
          city: d.city,
          dates: [d.arrival_date, d.departure_date].filter(Boolean).join("–") || "Dates TBD",
          // trip_destinations has no nights/days column on the server — derive
          // the stepper value from arrival/departure so a "+ days" tap on one
          // account reappears on the other instead of resetting to 1.
          days: getDestinationStayDays(d),
          emoji: "📍",
          startDate: d.arrival_date || undefined,
          endDate: d.departure_date || undefined,
          lat: Number.isFinite(Number(d.lat)) ? Number(d.lat) : undefined,
          lng: Number.isFinite(Number(d.lng)) ? Number(d.lng) : undefined,
          country: typeof d.country === "string" ? d.country : undefined,
        }))
        const normalizedStops = normalizeStopDates(liveStops, tripData.start_date ?? undefined)
        setStops(normalizedStops)

        // Route legs from synced bookings: a transport saved on another
        // account arrives here as itinerary/booking rows — render them as
        // leg cards so every account sees the same route. Entries already
        // set on this device win over the hydrated copy. Legs whose linked
        // booking rows are GONE (e.g. deleted from the Transport screen) are
        // pruned: without this the localStorage copy kept resurrecting a
        // deleted leg forever. Pruning is safe — any leg with booking rows
        // re-hydrates from them on the next load.
        const hydratedLegs = hydrateLegsFromBookings(
          (tripData as any).bookings,
          (tripData as any).itinerary_items,
          normalizedStops,
        )
        setTransportLegs((prev) => {
          const merged = { ...hydratedLegs, ...prev }
          const itemsById = new Map<string, any>()
          for (const it of (tripData as any).itinerary_items || []) if (it?.id) itemsById.set(it.id, it)
          const bookings = (tripData as any).bookings || []
          const pruned: Record<string, TransportLeg> = {}
          for (const [key, leg] of Object.entries(merged)) {
            if (!leg || leg.icon === "➕") continue
            const linked = bookings.some(
              (b: any) =>
                (b?.booking_type === "transport" || b?.booking_type === "flight") &&
                legKeyForBooking(b, itemsById, normalizedStops) === key,
            )
            if (linked) pruned[key] = leg
          }
          return pruned
        })

        void getUserTripPermission(activeId ?? undefined, user?.id || user?.email).then((perm) => {
          setUserRole(perm.role)
        })

        // Membership gate: signed-in accounts that don't own the trip and have
        // no server membership get a "you're not in this trip" screen instead
        // of the editing UI (this is what makes a left trip actually disappear).
        // NOTE: a fresh invite-code join lands in the LOCAL members roster
        // first (and the server read can lag/fail right after the RPC), so a
        // missing server row alone must not lock a just-joined user out.
        void (async () => {
          const tripId = String(tripData?.id || activeId || "")
          const isOwnerHere = Boolean(
            tripData?.owner_id && user?.id && tripData.owner_id === user.id,
          )
          if (!configured || !user?.id || isOwnerHere) {
            setNotAMember(false)
            setMemberChecked(true)
            return
          }
          const mem = tripId ? await getMyTripMembership(tripId) : null
          if (mem?.isMember) {
            setNotAMember(false)
            setMemberChecked(true)
            return
          }
          const uid = user?.id
          const emailLower = user?.email?.toLowerCase()
          const localMembers: Array<any> = (tripData as any)?.members || []
          const inLocalRoster =
            localMembers.length === 0 ||
            localMembers.some(
              (m) =>
                (uid && m?.user_id === uid) ||
                (emailLower && m?.email && String(m.email).toLowerCase() === emailLower),
            )
          if (inLocalRoster) {
            // Joined locally but unknown to the server (incomplete join):
            // without a real membership no write ever reaches the other
            // account. Claim it now so stays/transport/destinations sync.
            setNotAMember(false)
            setMemberChecked(true)
            void claimMissingServerMembership(tripData).then((claimed) => {
              if (claimed) loadTrip()
            })
            return
          }
          setNotAMember(true)
          setMemberChecked(true)
        })()
      })
      .catch(() => {
        setTrip(null)
        setStops([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    loadTrip()

    const onDbChange = () => {
      if (isSyncingRef.current) return
      loadTrip()
    }
    window.addEventListener("trypo:db_changed", onDbChange)
    return () => window.removeEventListener("trypo:db_changed", onDbChange)
  }, [])

  const persistStops = (nextStopsIn: Stop[], currentTrip: any) => {
    const targetId = currentTrip?.id || getActiveTripId()
    if (!targetId) return

    // New stops are created with real UUIDs. Legacy stops (id like
    // "stop-1756…", created before uuid ids) are not valid Postgres uuids and
    // would make the server upsert fail silently, so re-key them once here.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const idMap: Record<string, string> = {}
    let rekeyed = false
    const nextStops: Stop[] = nextStopsIn.map((stop) => {
      if (uuidRe.test(stop.id)) return stop
      rekeyed = true
      const newId = idMap[stop.id] || generateUuid()
      idMap[stop.id] = newId
      return { ...stop, id: newId }
    })
    if (rekeyed) {
      setStops(nextStops)
      setTransportLegs((prev) => {
        const rekeyedLegs: Record<string, TransportLeg> = {}
        for (const [key, leg] of Object.entries(prev)) {
          const [fromId, toId] = key.split("→")
          rekeyedLegs[`${idMap[fromId] || fromId}→${idMap[toId] || toId}`] = leg
        }
        return rekeyedLegs
      })
    } else {
      setStops(nextStops)
    }

    isSyncingRef.current = true
    const destinationRows = nextStops.map((stop, index) => ({
      id: stop.id,
      city: stop.city,
      country: (stop as any).country || "Destination",
      position: index,
      arrival_date: stop.startDate || null,
      departure_date: stop.endDate || null,
      days: stop.days || 1,
      // Real GPS from the worldwide search — kept locally so every map
      // pins the exact ville/city without re-geocoding.
      lat: Number.isFinite(Number((stop as any).lat)) ? Number((stop as any).lat) : undefined,
      lng: Number.isFinite(Number((stop as any).lng)) ? Number((stop as any).lng) : undefined,
    }))
    syncTripDestinations(targetId, destinationRows)
      .catch((error) => {
        console.warn("Trip route sync failed", error)
      })
      .finally(() => {
        setTimeout(() => {
          isSyncingRef.current = false
        }, 1500)
      })
  }

  const [transportLegs, setTransportLegs] = useState<Record<string, TransportLeg>>({})
  const [legModalKey, setLegModalKey] = useState<string | null>(null)
  const [transportSaveError, setTransportSaveError] = useState<string | null>(null)
  const [legEditType, setLegEditType] = useState("Flight")

  useEffect(() => {
    if (typeof window === "undefined") return
    const key = `trypo-transport-legs-${trip?.id || "draft"}`
    const saved = window.localStorage.getItem(key)
    if (!saved) {
      setTransportLegs({})
      return
    }
    try {
      setTransportLegs(JSON.parse(saved))
    } catch (error) {
      console.warn("Failed to restore transport legs", error)
    }
  }, [trip?.id])

  useEffect(() => {
    if (typeof window === "undefined") return
    const key = `trypo-transport-legs-${trip?.id || "draft"}`
    window.localStorage.setItem(key, JSON.stringify(transportLegs))
  }, [transportLegs, trip?.id])

  const totalStayDays = stops.reduce((sum, stop) => sum + (stop.days || 1), 0)
  const baseTripDays = Math.max(
    1,
    getDaysBetweenDates(
      trip?.start_date || "2026-06-12",
      trip?.end_date || "2026-06-18",
    ),
  )
  const remainingTripDays = baseTripDays - totalStayDays

  const swipeTouchRef = useRef<{
    startX: number
    startY: number
    id: string
    isH: boolean | null
  } | null>(null)
  const dragTouchRef = useRef<{ fromIndex: number; startY: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ── Swipe handlers ──────────────────────────────────────────
  const onSwipeTouchStart = (e: React.TouchEvent, id: string) => {
    swipeTouchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      id,
      isH: null,
    }
  }

  const onSwipeTouchMove = (e: React.TouchEvent, id: string) => {
    const t = swipeTouchRef.current
    if (!t || t.id !== id) return
    const dx = e.touches[0].clientX - t.startX
    const dy = e.touches[0].clientY - t.startY
    if (t.isH === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      swipeTouchRef.current = { ...t, isH: Math.abs(dx) > Math.abs(dy) }
    }
    if (!swipeTouchRef.current?.isH) return
    e.preventDefault()
    const clamped = Math.max(-110, Math.min(110, dx))
    setSwipeOffset((prev) => ({ ...prev, [id]: clamped }))
  }

  const onSwipeTouchEnd = (id: string) => {
    const offset = swipeOffset[id] ?? 0
    setSwipeSnapping((prev) => ({ ...prev, [id]: true }))

    if (offset < -80) {
      // delete
      const nextStops = normalizeStopDates(stops.filter((s) => s.id !== id), trip?.start_date)
      persistStops(nextStops, trip)
      setSwipeOffset((prev) => {
        const n = { ...prev }
        delete n[id]
        return n
      })
    } else if (offset > 80) {
      // lock
      setLockedIds((prev) => {
        const n = new Set(prev)
        n.has(id) ? n.delete(id) : n.add(id)
        return n
      })
      setSwipeOffset((prev) => ({ ...prev, [id]: 0 }))
    } else {
      setSwipeOffset((prev) => ({ ...prev, [id]: 0 }))
    }

    setTimeout(
      () => setSwipeSnapping((prev) => ({ ...prev, [id]: false })),
      300,
    )
    swipeTouchRef.current = null
  }

  // ── Drag handlers ───────────────────────────────────────────
  const onDragTouchStart = (e: React.TouchEvent, index: number) => {
    e.stopPropagation()
    dragTouchRef.current = { fromIndex: index, startY: e.touches[0].clientY }
    setDragIndex(index)
    setDragOverIndex(index)
  }

  const onDragTouchMove = (e: React.TouchEvent) => {
    if (dragTouchRef.current === null) return
    e.preventDefault()
    const dy = e.touches[0].clientY - dragTouchRef.current.startY
    const newIndex = Math.max(
      0,
      Math.min(
        stops.length - 1,
        dragTouchRef.current.fromIndex + Math.round(dy / ITEM_HEIGHT),
      ),
    )
    setDragOverIndex(newIndex)
  }

  const onDragTouchEnd = () => {
    if (dragTouchRef.current === null || dragOverIndex === null) return
    const from = dragTouchRef.current.fromIndex
    const to = dragOverIndex
    if (from !== to) {
      const arr = [...stops]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      const nextStops = normalizeStopDates(arr, trip?.start_date)
      persistStops(nextStops, trip)
    }
    dragTouchRef.current = null
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const moveStop = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= stops.length) return
    if (lockedIds.has(stops[fromIndex]?.id)) return

    const next = [...stops]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    const nextStops = normalizeStopDates(next, trip?.start_date)
    persistStops(nextStops, trip)
  }

  const onNativeDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    index: number,
  ) => {
    if (lockedIds.has(stops[index]?.id)) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", String(index))
    setDragIndex(index)
    setDragOverIndex(index)
  }

  const onNativeDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    index: number,
  ) => {
    if (dragIndex === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDragOverIndex(index)
  }

  const onNativeDrop = (
    event: React.DragEvent<HTMLDivElement>,
    toIndex: number,
  ) => {
    event.preventDefault()
    const fromIndex = Number(event.dataTransfer.getData("text/plain"))
    if (Number.isInteger(fromIndex)) moveStop(fromIndex, toIndex)
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const onNativeDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const deleteStop = (id: string) => {
    const nextStops = normalizeStopDates(stops.filter((s) => s.id !== id), trip?.start_date)
    persistStops(nextStops, trip)
  }

  const updateStopDays = (id: string, delta: number) => {
    const nextStops = normalizeStopDates(
      stops.map((stop) =>
        stop.id === id
          ? { ...stop, days: Math.max(1, (stop.days || 1) + delta) }
          : stop,
      ),
      trip?.start_date,
    )
    persistStops(nextStops, trip)
  }

  const addStop = (dest: DestinationSuggestion) => {
    // Every new destination starts at 1 day — the user extends with +.
    // GPS + country from the worldwide suggestion are kept so the pin is
    // exact for any city/ville on the map.
    const newStop: Stop = {
      id: generateUuid(),
      city: dest.city,
      dates: dest.dates || "Dates TBD",
      days: 1,
      emoji: dest.emoji || "📍",
      lat: Number.isFinite(Number(dest.lat)) ? Number(dest.lat) : undefined,
      lng: Number.isFinite(Number(dest.lng)) ? Number(dest.lng) : undefined,
      country: dest.country,
    }
    const nextStops = normalizeStopDates([...stops, newStop], trip?.start_date)
    persistStops(nextStops, trip)
    setDestinationQuery("")
    setDestinationResults([])
    setShowAdd(false)
  }

  const computeStopDays = (stop: any, index: number, route: Stop[]) => {
    const currentStop = route[index]
    if (!currentStop) return 1

    const nextStop = route[index + 1]
    if (nextStop) {
      const distance = getDistanceBetweenCities(currentStop.city, nextStop.city, stopCoord(currentStop), stopCoord(nextStop))
      if (distance !== "Distance à définir") return Math.max(1, Math.round(Number.parseInt(distance, 10) / 100) || 1)
    }

    const fallback = stop?.days ?? 1
    return fallback > 0 ? fallback : 1
  }

  const dynamicSuggestions = useMemo(
    () => getSmartSuggestedDestinations(stops, (trip as any)?.destinations),
    [stops, trip],
  )

  const filteredDestinations = destinationQuery.trim()
    ? destinationResults.length > 0
      ? destinationResults
      : []
    : dynamicSuggestions

  const customDestinationName = destinationQuery.trim()
  const hasCustomDestination =
    customDestinationName.length > 0 &&
    !filteredDestinations.some(
      (dest) => dest.city.toLowerCase() === customDestinationName.toLowerCase(),
    )

  if (!trip && !loading) {
    return (
      <div className="min-h-full bg-surface flex flex-col items-center justify-center px-8 text-center">
        <div className="pt-12" />
        <h1 className="text-navy font-black text-[20px] mb-2">No trip selected</h1>
        <p className="text-slate-400 text-[13px] mb-6 leading-relaxed">
          Create a trip and it will show up here with its itinerary, map,
          bookings and budget.
        </p>
        <button
          onClick={() => navigate("create-trip")}
          className="px-6 py-3 rounded-2xl text-white font-black text-[14px]"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 12px 32px rgba(59,65,200,0.35)",
          }}
        >
          Create your first trip
        </button>
      </div>
    )
  }

  if (notAMember && memberChecked && trip) {
    return (
      <div className="min-h-full bg-surface flex flex-col items-center justify-center px-8 text-center">
        <div className="pt-12" />
        <h1 className="text-navy font-black text-[20px] mb-2">
          You&apos;re not in this trip anymore
        </h1>
        <p className="text-slate-400 text-[13px] mb-6 leading-relaxed">
          « {trip.title} » is not part of your trips anymore. You can rejoin the
          crew only if the organizer invites or accepts you again.
        </p>
        <div className="flex flex-col gap-2.5 w-full max-w-[260px]">
          <button
            onClick={() => navigate("trips")}
            className="px-6 py-3 rounded-2xl text-white font-black text-[14px]"
            style={{
              background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
              boxShadow: "0 12px 32px rgba(59,65,200,0.35)",
            }}
          >
            Back to My Trips
          </button>
          <button
            onClick={() => navigate("trip-social")}
            className="px-6 py-3 rounded-2xl bg-white text-navy font-black text-[14px] border border-slate-200"
          >
            Browse community trips
          </button>
        </div>
      </div>
    )
  }

  const routeMapWidth = Math.max(280, stops.length * 44)
  const joinedMembers = ((trip?.members || []) as Array<{ status?: string; avatar_url?: string | null }>).filter(
    (member) => member.status === "joined",
  )
  const pendingMemberCount = ((trip?.members || []) as Array<{ status?: string }>).filter(
    (member) => member.status === "pending",
  ).length
  const joinedMemberCount = joinedMembers.length
  const communityAvatars = [
    ...new Set([
      ...joinedMembers.map((member) => member.avatar_url).filter((url): url is string => Boolean(url)),
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=40&h=40&fit=crop",
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=40&h=40&fit=crop",
    ]),
  ].slice(0, 2)

  return (
    <div className="relative min-h-full bg-surface pb-6">
      <div className="mx-auto w-full max-w-[820px] px-4 pt-3 md:px-8 md:pt-4">
        {/* Hero image */}
        <section aria-label="Trip banner" className="relative">
          <div className="group relative h-[280px] w-full overflow-hidden rounded-[28px] border border-slate-200/60 bg-slate-900 shadow-lg md:h-[340px]">
            <img
              src={
                trip?.cover_image_url ||
                "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=700&fit=crop&auto=format"
              }
              alt={(trip?.title || "Trip") + " cover"}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(2,6,23,0.9) 0%, rgba(15,23,42,0.45) 52%, rgba(15,23,42,0.05) 100%)",
              }}
            />
            <button
              onClick={() => setShowShare(true)}
              aria-label="Share trip"
              className="absolute right-3.5 top-3.5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md transition-all hover:bg-black/60 active:scale-95"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.933 2.185 2.25 2.25 0 00-3.933-2.185zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
            </button>
            <div className="absolute bottom-4 left-4 right-4 text-white md:bottom-5 md:left-5 md:right-5">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-[22px] font-black tracking-tight text-white drop-shadow-sm md:text-[28px]">
                  {trip?.title || (loading ? "Loading trip..." : "My Trip Overview")}
                </h1>
                <SyncStatusBadge />
              </div>
              <p className="mb-3 text-[12px] font-medium leading-relaxed text-slate-200/90 drop-shadow">
                {[trip?.start_date, trip?.end_date].filter(Boolean).join(" – ") || "Dates to be set"} · {stops.length} Destination{stops.length === 1 ? "" : "s"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditStartDate(trip?.start_date ? String(trip.start_date).slice(0, 10) : "")
                  setEditEndDate(trip?.end_date ? String(trip.end_date).slice(0, 10) : "")
                  setDatesError(null)
                  setShowDatesModal(true)
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/20 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-white shadow-sm backdrop-blur-md transition-all hover:bg-white/30 active:scale-95"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
                Edit dates
              </button>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <section aria-label="Trip summary counters" className="mt-2">
          <div className="grid grid-cols-5 divide-x divide-slate-100 rounded-3xl border border-slate-200/70 bg-white px-2 py-3 text-center shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
            {[
              { value: String(stops.length), label: "Places" },
              {
                value: String((trip?.bookings || []).filter((b: any) => b.booking_type === "stay").length),
                label: "Stays",
              },
              {
                value: String((trip?.bookings || []).filter((b: any) => b.booking_type === "flight").length),
                label: "Flights",
              },
              {
                value: String((trip?.itinerary_items || []).length),
                label: "Activities",
              },
              {
                value: String(joinedMemberCount),
                label: "On Trip",
              },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-0.5 px-1">
                <span className="text-[17px] font-bold leading-tight text-navy">{s.value}</span>
                <span className="text-[10px] font-semibold text-slate-400">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Viewer / Read-only notice */}
        {userRole === "viewer" && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 shadow-sm">
            <div>
              <p className="text-[11px] font-black leading-tight text-amber-900">
                Read-only access
              </p>
              <p className="text-[10px] text-amber-700">
                You&apos;re viewing this trip as a guest reader.
              </p>
            </div>
            <button
              onClick={() => navigate("collaborative")}
              className="flex-shrink-0 cursor-pointer rounded-xl border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-black text-amber-800 shadow-xs active:scale-95"
            >
              Crew →
            </button>
          </div>
        )}

        {/* Planning progress + duration */}
        <section aria-label="Planning progress" className="mt-4">
          <div className="mb-3 rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Planning progress</span>
              <span className="text-sm font-extrabold text-blue-600">
                {trip?.planning_progress || 0}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, trip?.planning_progress || 0))}%`,
                  background: "linear-gradient(90deg, #2563eb, #06b6d4)",
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-sm">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                Stay total
              </span>
              <span className="mt-1 text-lg font-black text-navy">{totalStayDays} days</span>
            </div>
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-sm">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                {remainingTripDays >= 0 ? "Days left" : "Over by"}
              </span>
              <span
                className={`mt-1 text-lg font-black ${
                  remainingTripDays >= 0 ? "text-blue-600" : "text-rose-500"
                }`}
              >
                {Math.abs(remainingTripDays)} {Math.abs(remainingTripDays) === 1 ? "day" : "days"}
              </span>
            </div>
          </div>
        </section>

        {/* Route map preview — numbered stops, tap for the full map */}
        <section aria-label="Route map preview" className="mt-4">
          <div className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                Route map
              </p>
              <button
                type="button"
                onClick={() => navigate("map")}
                className="group flex items-center gap-1 text-xs font-bold text-blue-600 transition-colors hover:text-blue-700"
              >
                Open map
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </button>
            </div>
            {stops.length > 0 ? (
              <div className="overflow-x-auto no-scrollbar">
                <svg
                  viewBox={`0 0 ${routeMapWidth} 64`}
                  className="mx-auto block max-w-none overflow-visible"
                  style={{ height: 64, width: routeMapWidth }}
                  aria-hidden="true"
                >
                  {stops.length > 1 && (
                    <path
                      d={stops
                        .map((_, i) => {
                          const x =
                            stops.length === 1
                              ? routeMapWidth / 2
                              : 18 + (i * (routeMapWidth - 36)) / (stops.length - 1)
                          const y = 32 - (i % 2 === 0 ? 0 : 12)
                          return `${i === 0 ? "M" : "L"} ${x} ${y}`
                        })
                        .join(" ")}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {stops.map((stop, i) => {
                    const x =
                      stops.length === 1
                        ? routeMapWidth / 2
                        : 18 + (i * (routeMapWidth - 36)) / (stops.length - 1)
                    const y = 32 - (i % 2 === 0 ? 0 : 12)
                    return (
                      <g key={stop.id || i}>
                        <circle cx={x} cy={y} r="11" fill="#0F172A" stroke="#FFFFFF" strokeWidth="3" />
                        <text x={x} y={y + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">
                          {i + 1}
                        </text>
                        <text x={x} y={y + 26} textAnchor="middle" fontSize="9" fontWeight="700" fill="#94A3B8">
                          {(stop.city || "").length > 9 ? `${stop.city.slice(0, 8)}…` : stop.city}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center"
              >
                <p className="text-[13px] font-bold text-slate-500">
                  No stops yet — add destinations to see your route
                </p>
              </button>
            )}
          </div>
        </section>

        {/* Community banner */}
        <section aria-label="Trip community" className="mt-3">
          <button
            onClick={() => navigate("trip-social")}
            className="relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-3xl border border-slate-800 p-4 text-left shadow-lg active:scale-[0.99]"
            style={{
              background: "linear-gradient(100deg, #020617 0%, #121B38 55%, #1E2958 100%)",
            }}
          >
            <div className="pointer-events-none absolute -bottom-8 -right-8 h-36 w-36 rounded-full bg-blue-500/10 blur-2xl" />
            <div className="relative z-10 flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-base font-black tracking-wider text-white shadow backdrop-blur-md">
                CO
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold tracking-tight text-white">Trip Community</h2>
                <p className="mt-0.5 truncate text-[11px] font-medium leading-snug text-slate-300/80">
                  {communityPublic ? "Public" : "Private"} · {joinedMemberCount} traveler
                  {joinedMemberCount === 1 ? "" : "s"}
                  {pendingMemberCount > 0 ? ` · ${pendingMemberCount} pending` : ""}
                </p>
              </div>
            </div>
            <div className="relative z-10 flex flex-shrink-0 flex-col items-end">
              <div className="mb-1.5 flex -space-x-2">
                {communityAvatars.map((avatar, i) => (
                  <img
                    key={i}
                    src={avatar}
                    className="h-7 w-7 rounded-full border-2 border-slate-900 object-cover ring-1 ring-white/10"
                    alt=""
                  />
                ))}
              </div>
              <span className="text-[10px] font-bold text-rose-400">
                {pendingMemberCount > 0
                  ? `${pendingMemberCount} want${pendingMemberCount === 1 ? "s" : ""} to join →`
                  : "Open community →"}
              </span>
            </div>
          </button>
        </section>

        {/* Route */}
        <section aria-label="Route timeline" className="mt-6">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
              Route
            </h2>
            <p className="text-[9px] font-semibold tracking-tight text-slate-400/90 md:text-[10px]">
              ← swipe to delete · → to lock · ⠿ drag
            </p>
          </div>

        <div
          ref={listRef}
          className="flex flex-col relative"
          onTouchMove={onDragTouchMove}
          onTouchEnd={onDragTouchEnd}
        >
          {stops.length === 0 && (
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm mb-3">
              <p className="text-navy font-bold text-sm">No destinations added yet</p>
              <p className="text-slate-400 text-xs mt-1">Tap below to add your first stop</p>
            </div>
          )}
          {stops.map((stop, i) => {
            const offset = swipeOffset[stop.id] ?? 0
            const snapping = swipeSnapping[stop.id] ?? false
            const isLocked = lockedIds.has(stop.id)
            const isDragging = dragIndex === i
            const isDropTarget =
              dragOverIndex === i && dragIndex !== null && dragIndex !== i
            const isExpanded = expandedStop === stop.id
            const detail = stopDetails[stop.id]

            // Transport leg between this stop and the next
            const nextStop = stops[i + 1]
            const legKey = nextStop ? `${stop.id}→${nextStop.id}` : null
            const leg = legKey ? (transportLegs[legKey] ?? defaultLeg) : null
            const hasLeg = leg && leg.icon !== "➕"
            const legDistance = nextStop ? getDistanceBetweenCities(stop.city, nextStop.city, stopCoord(stop), stopCoord(nextStop)) : ""
            const legDistanceShown = legDistance && legDistance !== "Distance à définir" ? legDistance : ""

            const swipeBg =
              offset < -20
                ? `rgba(239,68,68,${Math.min(1, Math.abs(offset) / 80)})`
                : offset > 20
                  ? `rgba(${
                      isLocked ? "16,185,129" : "37,99,235"
                    },${Math.min(1, offset / 80)})`
                  : "transparent"

            return (
              <div key={stop.id}>
                {/* Drop indicator */}
                {isDropTarget && (
                  <div
                    className="h-1 rounded-full mb-1"
                    style={{
                      background: "linear-gradient(90deg, #3B41C8, #06C4D4)",
                    }}
                  />
                )}

                <div
                  className="flex gap-3 items-start"
                  onDragOver={(event) => onNativeDragOver(event, i)}
                  onDrop={(event) => onNativeDrop(event, i)}
                  style={{
                    opacity: isDragging ? 0.4 : 1,
                    transition: isDragging ? "none" : "opacity 0.2s",
                  }}
                >
                  {/* Timeline spine */}
                  <div
                    className="flex flex-shrink-0 flex-col items-center self-stretch"
                    style={{ width: "32px" }}
                  >
                    <div
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white shadow-md ring-4 ring-white"
                      style={{
                        background: isLocked
                          ? "linear-gradient(135deg, #10b981, #047857)"
                          : "#2563EB",
                      }}
                    >
                      {isLocked ? "✓" : i + 1}
                    </div>
                    {(i < stops.length - 1 || isExpanded) && (
                      <div
                        className="my-1 w-[2px] flex-1"
                        style={{
                          background:
                            "linear-gradient(to bottom, #2563EB, #38BDF8, rgba(37,99,235,0.12))",
                          minHeight: isExpanded ? "16px" : "32px",
                        }}
                      />
                    )}
                  </div>

                  {/* Card + expand */}
                  <div className="pb-2 flex-1 min-w-0">
                    {/* Swipe wrapper */}
                    <div className="relative overflow-hidden rounded-[22px]">
                      <div
                        className="absolute inset-0 flex items-center justify-between rounded-[22px] px-5"
                        style={{ background: swipeBg }}
                      >
                        {offset < -20 && (
                          <span className="text-white font-black text-[11px] ml-auto">
                            Delete
                          </span>
                        )}
                        {offset > 20 && (
                          <span className="text-white font-black text-[11px]">
                            {isLocked ? "Unlock" : "Lock"}
                          </span>
                        )}
                      </div>

                      <div
                        className="relative flex flex-wrap items-start justify-between gap-2 rounded-[22px] border border-slate-200/80 bg-white p-4"
                        style={{
                          boxShadow: isExpanded
                            ? "0 8px 24px -4px rgba(37,99,235,0.16)"
                            : "0 4px 20px -2px rgba(15,23,42,0.05)",
                          transform: `translateX(${offset}px)`,
                          transition: snapping
                            ? "transform 0.25s cubic-bezier(0.25,1,0.5,1)"
                            : "none",
                        }}
                        onTouchStart={(e) => onSwipeTouchStart(e, stop.id)}
                        onTouchMove={(e) => onSwipeTouchMove(e, stop.id)}
                        onTouchEnd={() => onSwipeTouchEnd(stop.id)}
                      >
                        <div className="flex min-w-[110px] flex-1 items-start gap-0.5">
                          <button
                            type="button"
                            className="group min-w-0 max-w-full cursor-pointer text-left"
                            onClick={() =>
                              setSelectedHubDestination({
                                city: stop.city,
                                dates: stop.dates,
                                startDate: stop.startDate,
                                endDate: stop.endDate,
                                days: stop.days,
                              })
                            }
                          >
                            <div className="flex min-w-0 items-start gap-1">
                              <h3 className="line-clamp-2 text-[15px] font-bold leading-tight text-navy transition-colors group-hover:text-blue-600">
                                {stop.city}
                              </h3>
                              <span className="mt-0.5 flex-shrink-0 text-[11px] font-bold text-blue-500 opacity-80 group-hover:opacity-100">
                                ↗
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-slate-400">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                <path d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                              </svg>
                              <span className="truncate text-[11px] font-medium">{stop.dates}</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!detail) {
                                setSelectedHubDestination({
                                  city: stop.city,
                                  dates: stop.dates,
                                  startDate: stop.startDate,
                                  endDate: stop.endDate,
                                  days: stop.days,
                                })
                                return
                              }
                              setExpandedStop(isExpanded ? null : stop.id)
                            }}
                            className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy"
                            title={detail ? (isExpanded ? "Collapse" : "Expand") : "Open destination hub"}
                            aria-label={detail ? (isExpanded ? "Collapse destination" : "Expand destination") : "Open destination hub"}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{
                                transform: isExpanded && detail ? "rotate(180deg)" : "none",
                                transition: "transform 0.2s",
                              }}
                            >
                              <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                        </div>

                        <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
                          <div className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50 px-1 py-1 shadow-inner">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                updateStopDays(stop.id, -1)
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] font-bold text-slate-600 shadow-sm transition-transform hover:bg-slate-100 active:scale-90"
                              aria-label={`Remove a day from ${stop.city}`}
                            >
                              −
                            </button>
                            <span className="min-w-[28px] px-1 text-center text-[11px] font-bold text-blue-600">
                              {stop.days}d
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                updateStopDays(stop.id, 1)
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] font-bold text-slate-600 shadow-sm transition-transform hover:bg-slate-100 active:scale-90"
                              aria-label={`Add a day to ${stop.city}`}
                            >
                              +
                            </button>
                          </div>

                          {!isLocked && (
                            <div
                              draggable
                              onDragStart={(event) => onNativeDragStart(event, i)}
                              onDragEnd={onNativeDragEnd}
                              className="flex h-8 w-7 cursor-grab touch-none items-center justify-center rounded-lg text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
                              onTouchStart={(e) => onDragTouchStart(e, i)}
                              title="Drag to reorder"
                            >
                              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path d="M7 4a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0zM7 16a2 2 0 11-4 0 2 2 0 014 0zM17 4a2 2 0 11-4 0 2 2 0 014 0zM17 10a2 2 0 11-4 0 2 2 0 014 0zM17 16a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded stop detail */}
                    {isExpanded && detail && (
                      <div
                        className="mt-2 rounded-2xl overflow-hidden"
                        style={{
                          background: "rgba(59,65,200,0.04)",
                          border: "1px solid rgba(59,65,200,0.1)",
                        }}
                      >
                        {/* Stay */}
                        <div className="px-4 pt-3 pb-2 border-b border-slate-100">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                            Where You Stay
                          </p>
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                              style={{ background: "rgba(59,65,200,0.08)" }}
                            >
                              {detail.stay.emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-navy font-bold text-[13px] truncate">
                                {detail.stay.name}
                              </p>
                              <p className="text-slate-400 text-[11px]">
                                {detail.stay.type}
                              </p>
                            </div>
                            <span className="text-brand font-black text-[12px] flex-shrink-0">
                              {detail.stay.price}
                            </span>
                          </div>
                        </div>

                        {/* Arrival transport */}
                        {i > 0 &&
                          (() => {
                            const prevStop = stops[i - 1]
                            const arrivalLegKey = `${prevStop.id}→${stop.id}`
                            const arrivalLeg = transportLegs[arrivalLegKey]
                            return arrivalLeg ? (
                              <div className="px-4 py-2 border-b border-slate-100">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                  How You Arrive
                                </p>
                                <div className="flex items-center gap-2.5">
                                  <span className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black text-brand flex-shrink-0" style={{ background: "rgba(59,65,200,0.08)" }}>
                                    <TransportIcon type={arrivalLeg.label} size={16} />
                                  </span>
                                  <div className="flex-1">
                                    <p className="text-navy font-bold text-[12px]">
                                      {arrivalLeg.label} from {prevStop.city}
                                    </p>
                                    <p className="text-slate-400 text-[11px]">
                                      {arrivalLeg.detail}
                                      {arrivalLeg.duration ? ` · ${arrivalLeg.duration}` : ""}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-brand font-black text-[12px]">
                                      {arrivalLeg.price}
                                    </p>
                                    <p className="text-slate-400 text-[10px]">
                                      {arrivalLeg.distanceKm || "—"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : null
                          })()}

                        {/* Activities */}
                        <div className="px-4 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                            Planned Activities
                          </p>
                          {detail.activities.map((act, ai) => (
                            <div
                              key={ai}
                              className="flex items-center gap-2.5 mb-2 last:mb-0"
                            >
                              <span className="text-[9px] font-bold text-slate-300 w-8 flex-shrink-0">
                                {act.time}
                              </span>
                              <span className="text-[15px]">{act.emoji}</span>
                              <p className="flex-1 text-navy font-semibold text-[12px]">
                                {act.title}
                              </p>
                              <span className="text-slate-400 text-[11px] flex-shrink-0">
                                {act.cost}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 border-t border-slate-100 divide-x divide-y divide-slate-100">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedHubDestination({
                                city: stop.city,
                                dates: stop.dates,
                                startDate: stop.startDate,
                                endDate: stop.endDate,
                                days: stop.days,
                              })
                            }
                            className="py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-center transition-colors hover:bg-brand/5 cursor-pointer flex items-center justify-center gap-1.5"
                            style={{
                              color: "#3B41C8",
                              background: "rgba(59,65,200,0.04)",
                            }}
                          >
                            <span>Booking & Tours</span>
                            <span>↗</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                if (trip?.id) localStorage.setItem("trypo_active_trip_id", trip.id)
                                localStorage.setItem("trypo_vibe_match_target_city", stop.city)
                                localStorage.setItem("trypo_hidden_gems_target_city", stop.city)
                                localStorage.setItem(
                                  "trypo_vibe_match_destinations",
                                  JSON.stringify(stops.map((s) => s.city)),
                                )
                              }
                              navigate("vibe-match")
                            }}
                            className="py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-center transition-colors hover:bg-purple-50 cursor-pointer flex items-center justify-center gap-1.5"
                            style={{
                              color: "#7C3AED",
                              background: "rgba(124,58,237,0.04)",
                            }}
                          >
                            <span>Vibe Match</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                if (trip?.id) localStorage.setItem("trypo_active_trip_id", trip.id)
                                localStorage.setItem("trypo_hidden_gems_target_city", stop.city)
                                localStorage.setItem("trypo_vibe_match_target_city", stop.city)
                              }
                              navigate("hidden-gems")
                            }}
                            className="py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-center transition-colors hover:bg-emerald-50 cursor-pointer flex items-center justify-center gap-1.5"
                            style={{
                              color: "#059669",
                              background: "rgba(5,150,105,0.04)",
                            }}
                          >
                            <span>Hidden Gems</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate("itinerary")}
                            className="py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-center transition-colors hover:bg-slate-100/60 cursor-pointer flex items-center justify-center gap-1.5"
                            style={{
                              color: "#64748b",
                              background: "rgba(59,65,200,0.02)",
                            }}
                          >
                            <span>Itinerary →</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Transport leg connector between stops */}
                {leg && i < stops.length - 1 && (
                  <div className="flex gap-3">
                    <div
                      className="flex flex-shrink-0 flex-col items-center self-stretch"
                      style={{ width: "32px" }}
                    >
                      <div
                        className="w-[2px] flex-1"
                        style={{
                          background:
                            "linear-gradient(to bottom, rgba(37,99,235,0.12), rgba(37,99,235,0.55))",
                        }}
                      />
                    </div>

                    <div className="mb-1 flex flex-1 flex-col items-center gap-1.5 py-2.5">
                      {nextStop && (
                        <div className="text-center text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-400">
                          {stop.city} → {nextStop.city}
                          {legDistanceShown ? ` · ${legDistanceShown}` : ""}
                        </div>
                      )}

                      {hasLeg ? (
                        <div className="flex w-full items-center gap-2 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-3 py-2.5">
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600">
                            <TransportIcon type={leg.label} size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-bold text-navy">{leg.label}</p>
                            <p className="truncate text-[10px] text-slate-400">
                              {leg.detail}
                              {leg.duration ? ` · ${normalizeDuration(leg.duration)}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-1.5">
                            {legDistanceShown && (
                              <span className="text-[10px] font-bold text-slate-500">{legDistanceShown}</span>
                            )}
                            <span className="text-[11px] font-bold text-blue-600">{leg.price}</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (legKey) {
                                  setLegModalKey(legKey)
                                  setLegEditType(leg.label)
                                }
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/15 text-blue-600 transition-colors hover:bg-blue-500/25"
                              aria-label={`Edit transport to ${nextStop?.city}`}
                            >
                              <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                                <path
                                  d="M1 7l5.5-5.5M5.5 1.5H7V3"
                                  stroke="currentColor"
                                  strokeWidth="1.2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (legKey) {
                              setLegModalKey(legKey)
                              setLegEditType("Flight")
                            }
                          }}
                          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-blue-400/70 bg-blue-500/10 py-2 text-xs font-bold text-blue-600 transition-all hover:border-blue-500 hover:bg-blue-500/15 active:scale-[0.99]"
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-extrabold text-white">
                            +
                          </span>
                          Add transport to {nextStop?.city}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Add stop button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-blue-400/80 bg-blue-500/10 py-3.5 text-sm font-bold text-blue-600 shadow-sm transition-all hover:border-blue-500 hover:bg-blue-500/15 active:scale-[0.99]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-sm">
                +
              </span>
              Add a destination
            </button>
          </div>
        </div>
        </section>

        {/* Trip Tools */}
        <section aria-label="Trip tools" className="mt-8">
          <h2 className="mb-3 px-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
            Trip Tools
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {[
              {
                label: "Packing List",
                sub: "9/15 packed",
                screen: "packing-list" as Screen,
                iconBg: "bg-indigo-500/10",
                iconColor: "text-indigo-500",
              },
              {
                label: "Weather",
                sub: `${stops[0]?.city || "Tunis"} 28°C`,
                screen: "weather" as Screen,
                iconBg: "bg-sky-500/10",
                iconColor: "text-sky-500",
              },
              {
                label: "Currency",
                sub: `1 USD = ${liveRates.TND ? liveRates.TND.toFixed(2) : "2.91"} TND`,
                screen: "currency" as Screen,
                iconBg: "bg-emerald-500/10",
                iconColor: "text-emerald-500",
              },
              {
                label: "Trip Crew",
                sub: `${joinedMemberCount || 1} travelers`,
                screen: "collaborative" as Screen,
                iconBg: "bg-blue-500/10",
                iconColor: "text-blue-500",
              },
              {
                label: "Split Bills",
                sub: "$317 total · 3 people",
                screen: "split-bills" as Screen,
                iconBg: "bg-violet-500/10",
                iconColor: "text-violet-500",
              },
              {
                label: "Find Crew",
                sub: "Sarah 12min · Marco 32min",
                screen: "crew-tracker" as Screen,
                iconBg: "bg-amber-500/10",
                iconColor: "text-amber-500",
              },
              {
                label: "Hidden Gems",
                sub: stops.length > 0 ? `Secrets in ${stops.map((s) => s.city).slice(0, 2).join(" & ")}` : "Local secrets nearby",
                screen: "hidden-gems" as Screen,
                iconBg: "bg-rose-500/10",
                iconColor: "text-rose-500",
              },
              {
                label: "Vibe Match",
                sub: "Match today's mood",
                screen: "vibe-match" as Screen,
                iconBg: "bg-fuchsia-500/10",
                iconColor: "text-fuchsia-500",
              },
              {
                label: "Community",
                sub: communityPublic ? "Public · open to join" : "Private · share with crew",
                screen: "trip-social" as Screen,
                iconBg: "bg-cyan-500/10",
                iconColor: "text-cyan-500",
              },
              {
                label: "Memories",
                sub: "Map style · photos · slideshow",
                screen: "trip-memories" as Screen,
                iconBg: "bg-teal-500/10",
                iconColor: "text-teal-500",
              },
            ].map((tool) => (
              <button
                key={tool.label}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    if (trip?.id) localStorage.setItem("trypo_active_trip_id", trip.id)
                    if (tool.screen === "hidden-gems") {
                      if (stops.length > 0) {
                        localStorage.setItem("trypo_hidden_gems_target_city", stops[0].city)
                        localStorage.setItem("trypo_vibe_match_target_city", stops[0].city)
                      } else {
                        localStorage.removeItem("trypo_hidden_gems_target_city")
                      }
                    }
                    if (tool.screen === "vibe-match") {
                      if (stops.length > 0) {
                        const activeStopObj = expandedStop ? stops.find((s) => s.id === expandedStop) : null
                        const targetCity = activeStopObj ? activeStopObj.city : stops[0].city
                        localStorage.setItem("trypo_vibe_match_target_city", targetCity)
                        localStorage.setItem(
                          "trypo_vibe_match_destinations",
                          JSON.stringify(stops.map((s) => s.city)),
                        )
                      }
                    }
                  }
                  navigate(tool.screen)
                }}
                className="group flex flex-col rounded-3xl border border-slate-200/80 bg-white p-3.5 text-left shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] transition-all hover:shadow-md active:scale-[0.98]"
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tool.iconBg} ${tool.iconColor}`}>
                  <ToolIcon name={tool.label} size={20} />
                </span>
                <span className="mt-2.5 text-[13px] font-bold leading-tight text-navy">
                  {tool.label}
                </span>
                <span className="mt-1 text-[11px] font-semibold leading-tight text-slate-400">
                  {tool.sub}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* CTA */}
        <footer className="mb-4 mt-8 space-y-3">
          <button
            type="button"
            onClick={() => navigate("itinerary")}
            className="flex w-full items-center justify-center gap-2 rounded-3xl py-4 text-base font-extrabold tracking-wide text-white transition-all hover:opacity-95 active:scale-[0.98]"
            style={{
              background: "linear-gradient(90deg, #2563eb, #0284c7, #06b6d4)",
              boxShadow: "0 12px 30px -4px rgba(37,99,235,0.35)",
            }}
          >
            View Itinerary
            <span className="text-lg leading-none">→</span>
          </button>

          {userRole === "owner" && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="flex w-full items-center justify-center gap-2 rounded-3xl border border-rose-500/25 bg-rose-500/10 py-3.5 text-sm font-bold text-rose-500 transition-all hover:bg-rose-500/15 active:scale-[0.98]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Supprimer ce voyage
            </button>
          )}
        </footer>
      </div>

      {/* Delete Trip Confirmation Modal */}
      {showDatesModal && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-xs flex items-center justify-center p-5">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-[18px] font-black text-navy text-center mb-1.5">
              Modify trip dates
            </h3>
            <p className="text-[12px] text-slate-500 text-center mb-4">
              Destination dates shift automatically from the start date.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Start
                <input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] font-semibold text-navy outline-none border border-slate-200"
                />
              </label>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                End
                <input
                  type="date"
                  value={editEndDate}
                  min={editStartDate || undefined}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] font-semibold text-navy outline-none border border-slate-200"
                />
              </label>
            </div>
            {datesError && <p className="text-[12px] font-bold text-red-600 mb-2">{datesError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDatesModal(false)}
                disabled={savingDates}
                className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-[13px] active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void (async () => {
                    if (!trip?.id) return
                    if (editStartDate && editEndDate && editEndDate < editStartDate) {
                      setDatesError("End date cannot be before start date.")
                      return
                    }
                    setSavingDates(true)
                    setDatesError(null)
                    try {
                      await updateTripDates(editStartDate || null, editEndDate || null, trip.id)
                      const nextTrip = { ...trip, start_date: editStartDate || null, end_date: editEndDate || null }
                      setTrip(nextTrip)
                      const nextStops = normalizeStopDates(stops, editStartDate || undefined)
                      persistStops(nextStops, nextTrip)
                      setShowDatesModal(false)
                    } catch (e) {
                      setDatesError(e instanceof Error ? e.message : "Could not save dates.")
                    } finally {
                      setSavingDates(false)
                    }
                  })()
                }}
                disabled={savingDates}
                className="flex-1 py-3.5 rounded-xl text-white font-black text-[13px] active:scale-95 transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #3B41C8, #06C4D4)" }}
              >
                {savingDates ? "Saving..." : "Save dates"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-xs flex items-center justify-center p-5 animate-fadeIn">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center text-xl font-black mx-auto mb-4">
              !
            </div>
            <h3 className="text-[18px] font-black text-navy text-center mb-1.5">
              Supprimer ce voyage ?
            </h3>
            <p className="text-[13px] text-slate-500 text-center leading-relaxed mb-6">
              Êtes-vous sûr de vouloir supprimer définitivement le voyage <strong className="text-navy font-bold">« {trip?.title || "ce voyage"} »</strong> ? Toutes les étapes, réservations et données associées seront supprimées.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingTrip}
                className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-[13px] active:scale-95 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteTrip}
                disabled={isDeletingTrip}
                className="flex-1 py-3.5 rounded-xl bg-red-500 text-white font-black text-[13px] shadow-lg shadow-red-500/30 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isDeletingTrip ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showShare && (
        <ShareSheet
          title={trip?.title || "My Trip"}
          subtitle={`${trip?.start_date ? formatDateRange(trip.start_date, trip.end_date) : "Dates to be set"} · ${stops.length} Destination${stops.length > 1 ? "s" : ""}`}
          link={`https://trypo-app.vercel.app/trip/${trip?.id || "trip"}`}
          code={trip?.invite_code || generateTripInviteCode(trip?.title, trip?.id)}
          onClose={() => setShowShare(false)}
          communityPublic={communityPublic}
          communityBusy={communityBusy}
          communityError={communityError}
          onToggleCommunity={handleToggleCommunity}
          onOpenCommunity={() => {
            setShowShare(false)
            navigate("trip-social")
          }}
        />
      )}

      {/* Transport leg modal */}
      {legModalKey && (
        <TransportLegModal
          legKey={legModalKey}
          stops={stops}
          initialType={legEditType}
          initialLeg={transportLegs[legModalKey] ?? undefined}
          defaultDate={stops.find((stop) => stop.id === legModalKey.split("→")[0])?.startDate}
          onClose={() => setLegModalKey(null)}
          onSave={async (leg) => {
            try {
              const wasSaved = Boolean(transportLegs[legModalKey])
              setTransportSaveError(null)
              setTransportLegs((prev) => ({ ...prev, [legModalKey]: leg }))
              if (trip?.id) {
                const priceText = leg.price || ""
                const currency = priceText.includes("$")
                  ? "USD"
                  : priceText.includes("£")
                    ? "GBP"
                    : priceText.includes("د.ت")
                      ? "TND"
                      : "EUR"
                // Strip everything but digits/decimal separators: the leg
                // price carries a currency symbol ("$89", "50 €") and the old
                // regex KEPT the symbol, so Number() returned NaN and every
                // transport was saved with amount null → budget zero.
                const amount = priceText
                  ? Number(priceText.replace(/[^0-9.,-]/g, "").replace(",", ".")) || null
                  : null
                const [fromId, toId] = legModalKey.split("→")
                const fromStop = stops.find((s) => s.id === fromId)
                const toStop = stops.find((s) => s.id === toId)
                const fromCity = fromStop?.city || (fromId ? fromId.charAt(0).toUpperCase() + fromId.slice(1) : "")
                const toCity = toStop?.city || (toId ? toId.charAt(0).toUpperCase() + toId.slice(1) : "")
                const isFlight = leg.label.toLowerCase() === "flight"
                const legTitle = isFlight ? `Flight: ${fromCity} → ${toCity}` : `${leg.label}: ${fromCity} → ${toCity}`
                const startsAt = leg.departureDate && leg.departureTime ? `${leg.departureDate}T${leg.departureTime}:00` : null
                const endsAt = leg.departureDate && leg.arrivalTime ? `${leg.departureDate}T${leg.arrivalTime}:00` : null
                const details = `${leg.detail} · ${leg.duration || "Duration TBD"}${leg.reference ? ` · Ref ${leg.reference}` : ""}`
                const notes = `${fromId} → ${toId} · ${leg.duration || "Duration TBD"}${leg.reference ? ` · Ref ${leg.reference}` : ""}`
                const provider = leg.operator || leg.detail || "Planned transport"
                if (!wasSaved) {
                  const itineraryItem = await addItineraryItem({
                    tripId: trip.id,
                    itemType: isFlight ? "flight" : "transport",
                    title: legTitle,
                    details,
                    startsAt,
                    endsAt,
                    estimatedCost: amount,
                    currency,
                  })
                  await addBooking({
                    tripId: trip.id,
                    bookingType: leg.label.toLowerCase() === "flight" ? "flight" : "transport",
                    provider,
                    status: "booked",
                    startsAt,
                    endsAt,
                    confirmationCode: leg.reference,
                    amount,
                    currency,
                    notes,
                    itineraryItemId: itineraryItem.id,
                  })
                  window.dispatchEvent(new Event("trypo-itinerary-sync"))
                } else {
                  // Editing an existing leg: update the linked synced rows so
                  // the other account sees the edit (previously local-only).
                  const fresh = await getTripDetails(trip.id)
                  const link = fresh
                    ? findLegBookingLink(fresh.bookings ?? [], fresh.itinerary_items ?? [], legModalKey, stops)
                    : null
                  if (link?.item) {
                    await updateItineraryItem(
                      link.item.id,
                      {
                        item_type: isFlight ? "flight" : "transport",
                        title: legTitle,
                        details,
                        starts_at: startsAt,
                        ends_at: endsAt,
                        estimated_cost: amount,
                        currency,
                      },
                      trip.id,
                    )
                  }
                  if (link?.booking) {
                    await updateBooking(
                      link.booking.id,
                      {
                        booking_type: leg.label.toLowerCase() === "flight" ? "flight" : "transport",
                        provider,
                        status: "booked",
                        starts_at: startsAt,
                        ends_at: endsAt,
                        confirmation_code: leg.reference,
                        amount,
                        currency,
                        notes,
                      },
                      trip.id,
                    )
                  }
                }
              }
              setLegModalKey(null)
            } catch (error) {
              console.error("Failed to save transport", error)
              setTransportSaveError(error instanceof Error ? error.message : "Unable to save transport.")
            }
          }}
          onDelete={transportLegs[legModalKey] ? () => {
            void (async () => {
              try {
                // Remove the linked synced rows too, otherwise the leg
                // re-hydrates from the other account's booking on next sync.
                if (trip?.id) {
                  const fresh = await getTripDetails(trip.id)
                  const link = fresh
                    ? findLegBookingLink(fresh.bookings ?? [], fresh.itinerary_items ?? [], legModalKey, stops)
                    : null
                  if (link?.booking) await deleteBooking(link.booking.id, trip.id)
                  if (link?.item) await deleteItineraryItem(link.item.id, trip.id)
                }
              } catch (e) {
                console.warn("Failed to delete linked transport rows:", e)
              }
              setTransportLegs((prev) => {
                const next = { ...prev }
                delete next[legModalKey]
                return next
              })
              setLegModalKey(null)
            })()
          } : undefined}
        />
      )}
      {transportSaveError && (
        <div className="absolute bottom-5 left-5 right-5 z-[120] rounded-2xl bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-700 shadow-lg">
         {transportSaveError}
        </div>
      )}

      {/* Add destination modal */}
      {showAdd && (
        <div
          className="absolute inset-0 z-50 flex items-end"
          style={{
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(5px)",
          }}
          onClick={() => {
            setShowAdd(false)
            setDestinationQuery("")
          }}
        >
          <div
            className="w-full max-h-[85%] rounded-t-[32px] bg-white p-5 pb-8 shadow-[0_-18px_40px_rgba(15,23,42,0.22)] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h3 className="text-navy font-black text-[18px]">
                  Ajouter une étape
                </h3>
                <p className="text-slate-400 text-[11px]">
                  Recherche instantanée mondiale ou sélection GPS
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAdd(false)
                  setDestinationQuery("")
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 text-xl leading-none transition-colors"
                aria-label="Close destination modal"
              >
                ×
              </button>
            </div>

            {/* Quick Action: Pick directly on Mapbox interactive map */}
            <button
              type="button"
              onClick={() => {
                setShowAdd(false)
                setShowMapPicker(true)
              }}
              className="w-full mb-3 flex items-center justify-between p-3 rounded-2xl border border-brand/25 bg-brand/5 hover:bg-brand/10 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand/15 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <span className="text-brand flex items-center justify-center"><MapIcon size={20} /></span>
                </div>
                <div>
                  <p className="text-navy font-black text-[13px] flex items-center gap-1.5">
                    <span>Choose on the map</span>
                    <span className="text-[9px] bg-brand text-white px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider">
                      Mapbox GPS
                    </span>
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    Tap any point on the globe to add it
                  </p>
                </div>
              </div>
              <div className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold shadow-xs">
                →
              </div>
            </button>

            {/* Live Search Input powered by Mapbox */}
            <div className="relative mb-3">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="7" cy="7" r="5" />
                  <path d="m11 11 3 3" />
                </svg>
              </span>
              <input
                type="text"
                value={destinationQuery}
                onChange={(e) => setDestinationQuery(e.target.value)}
                placeholder="Search a city, region or country..."
                className="w-full rounded-2xl pl-10 pr-10 py-3 text-[13px] font-semibold text-navy outline-none"
                style={{
                  background: "#f8fafc",
                  border: "1.5px solid #e2e8f0",
                }}
              />
              {isSearchingDestinations ? (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              ) : destinationQuery ? (
                <button
                  type="button"
                  onClick={() => setDestinationQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold"
                >
                  ×
                </button>
              ) : null}
            </div>

            {/* Section label */}
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {destinationQuery.trim()
                  ? `Résultats Mapbox (${filteredDestinations.length})`
                  : "Suggestions personnalisées"}
              </span>
              {hasMapboxToken() && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Mapbox Live
                </span>
              )}
            </div>

            <div className="flex max-h-[44vh] flex-col gap-2 overflow-y-auto pr-1">
              {hasCustomDestination && (
                <button
                  onClick={() =>
                    addStop({
                      city: customDestinationName,
                      emoji: "📍",
                      dates: "Dates TBD",
                      days: 1,
                    })
                  }
                  className="flex items-center gap-3 py-3 px-4 rounded-2xl text-left transition-all hover:bg-brand/10"
                  style={{
                    background: "rgba(59,65,200,0.08)",
                    border: "1px solid rgba(59,65,200,0.15)",
                  }}
                >
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-black text-brand flex-shrink-0" style={{ background: "rgba(59,65,200,0.07)" }}>{customDestinationName.charAt(0).toUpperCase()}</span>
                  <div className="flex-1">
                    <p className="text-navy font-black text-[14px]">
                      Add "{customDestinationName}"
                    </p>
                    <p className="text-slate-400 text-[11px]">
                      Custom place · 1 day by default
                    </p>
                  </div>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white font-black"
                    style={{
                      background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                    }}
                  >
                    +
                  </div>
                </button>
              )}

              {filteredDestinations.map((dest) => (
                <button
                  key={`${dest.city}-${dest.country || "default"}`}
                  onClick={() => addStop(dest)}
                  className="flex items-center gap-3 py-3 px-4 rounded-2xl text-left transition-all hover:bg-brand/10 cursor-pointer"
                  style={{
                    background: "rgba(59,65,200,0.05)",
                    border: "1px solid rgba(59,65,200,0.1)",
                  }}
                >
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-black text-brand flex-shrink-0" style={{ background: "rgba(59,65,200,0.07)" }}>{dest.city.charAt(0).toUpperCase()}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-navy font-black text-[14px] truncate">
                      {dest.city}
                    </p>
                    <p className="text-slate-400 text-[11px] truncate">
                      {dest.country ? `${dest.country}` : `${dest.days ?? 1} day${(dest.days ?? 1) > 1 ? "s" : ""} recommended`}
                    </p>
                  </div>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white font-black flex-shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                    }}
                  >
                    +
                  </div>
                </button>
              ))}

              {filteredDestinations.length === 0 && !hasCustomDestination && !isSearchingDestinations && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                  <p className="text-[12px] font-bold text-slate-600">
                    No destination found for "{destinationQuery}"
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Try another city name or pick directly on the map
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Mapbox Place & Destination Picker Modal */}
      {showMapPicker && (
        <div
          className="fixed inset-0 z-[150] flex flex-col bg-slate-950/80 backdrop-blur-md"
          onClick={() => setShowMapPicker(false)}
        >
          <div
            className="w-full h-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <GoogleMapsPlacePicker
              cityContext={
                stops[stops.length - 1]?.city ||
                (Array.isArray((trip as any)?.destinations) && (trip as any)?.destinations[0]) ||
                "Paris"
              }
              initialQuery=""
              placeType="place"
              onSelectPlace={(place) => {
                const cityName = place.name || place.address.split(",")[0]
                const countryName = place.address.split(",").slice(-1)[0]?.trim() || ""
                addStop({
                  city: cityName,
                  country: countryName,
                  emoji: "📍",
                  dates: "Dates TBD",
                  days: 1,
                })
                setShowMapPicker(false)
              }}
              onClose={() => setShowMapPicker(false)}
            />
          </div>
        </div>
      )}

      {/* Destination Hub Modal (Booking, GetYourGuide, Airbnb, Best Hotels, Hidden Gems) */}
      <DestinationHubModal
        destination={selectedHubDestination}
        onClose={() => setSelectedHubDestination(null)}
        onExploreStay={() => navigate("find-stay")}
        onExploreHiddenGems={() => navigate("hidden-gems")}
      />
    </div>
  )
}
