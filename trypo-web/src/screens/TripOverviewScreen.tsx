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
import { useIsDesktop } from "../lib/useIsDesktop"
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

const parseIsoDate = (date: string) => {
  if (!date) return null
  const parsed = new Date(date)
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
    return base.toISOString().slice(0, 10)
  }

  const parsed = parseIsoDate(isoDate)
  if (!parsed) return isoDate

  const next = new Date(parsed)
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() + amount)
  return next.toISOString().slice(0, 10)
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

  const baseDate = tripStartDate || route[0]?.startDate || new Date().toISOString().slice(0, 10)
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

    const nextStop = {
      ...stop,
      days: stayDays,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      dates: formatDateRange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)),
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
  const isDesktop = useIsDesktop()
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

  return (
    <div className="relative min-h-full bg-surface">
      {/* Hero image */}
      <div className="relative h-[260px] md:h-[360px] bg-slate-900 flex-shrink-0">
        <img
          src={
            trip?.cover_image_url ||
            "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=700&fit=crop&auto=format"
          }
          alt={(trip?.title || "Trip") + " cover"}
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(13,15,46,0.7) 100%)",
          }}
        />
        <button
          onClick={() => setShowShare(true)}
          aria-label="Partager le voyage"
          className="absolute top-12 right-5 md:right-8 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="13" cy="3" r="2" stroke="white" strokeWidth="1.5" />
            <circle cx="3" cy="8" r="2" stroke="white" strokeWidth="1.5" />
            <circle cx="13" cy="13" r="2" stroke="white" strokeWidth="1.5" />
            <path
              d="M5 7l6-3M5 9l6 3"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="absolute bottom-5 left-5 right-5 md:left-8 md:right-8">
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-white font-black text-[22px] md:text-[28px] ${isDesktop ? "max-w-none" : "truncate"}`}>
              {trip?.title || (loading ? "Loading trip..." : "My Trip Overview")}
            </h1>
            <SyncStatusBadge />
          </div>
          <p className={`text-white/65 text-[13px] ${isDesktop ? "md:max-w-none" : "truncate"}`}>
            {[trip?.start_date, trip?.end_date].filter(Boolean).join(" – ") || "Dates to be set"} · {stops.length} Destinations
          </p>
          <button
            type="button"
            onClick={() => {
              setEditStartDate(trip?.start_date ? String(trip.start_date).slice(0, 10) : "")
              setEditEndDate(trip?.end_date ? String(trip.end_date).slice(0, 10) : "")
              setDatesError(null)
              setShowDatesModal(true)
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black text-white transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)" }}
          >
            Edit dates
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div
        className="mx-5 md:mx-8 -mt-4 rounded-2xl bg-white grid grid-cols-5 py-3 px-2"
        style={{
          boxShadow: "0 8px 24px rgba(59,65,200,0.12)",
          zIndex: 10,
          position: "relative",
        }}
      >
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
            value: String((trip?.members || []).filter((m: any) => m.status === "joined").length),
            label: "On Trip",
          },
        ].map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5">
            <span className="text-navy font-black text-[16px]">{s.value}</span>
            <span className="text-slate-400 text-[10px] font-medium">
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Viewer / Read-only notice */}
      {userRole === "viewer" && (
        <div className="mx-5 md:mx-8 mt-3 px-3.5 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <div>
              <p className="text-[11px] font-black text-amber-900 leading-tight">
                Read-only access
              </p>
              <p className="text-[10px] text-amber-700">
                You&apos;re viewing this trip as a guest reader.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("collaborative")}
            className="px-2.5 py-1 rounded-xl bg-white border border-amber-200 text-[10px] font-black text-amber-800 shadow-xs cursor-pointer active:scale-95"
          >
            Crew →
          </button>
        </div>
      )}

      {/* Progress */}
      <div className="mx-5 md:mx-8 mt-4">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[12px] font-semibold text-slate-500">
            Planning progress
          </span>
          <span className="text-[12px] font-black text-brand">
            {trip?.planning_progress || 0}%
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${trip?.planning_progress || 0}%`,
              background: "linear-gradient(90deg, #3B41C8, #06C4D4)",
            }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Stay total
            </p>
            <p className="text-[15px] font-black text-navy">{totalStayDays} days</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {remainingTripDays >= 0 ? "Days left" : "Over by"}
            </p>
            <p
              className={`text-[15px] font-black ${
                remainingTripDays >= 0 ? "text-brand" : "text-red-500"
              }`}
            >
              {Math.abs(remainingTripDays)} {remainingTripDays >= 0 ? "days" : "days"}
            </p>
          </div>
        </div>
      </div>

      {/* Route map preview — numbered stops, tap for the full map */}
      <div className="px-5 md:px-8 mt-4">
        <button
          onClick={() => navigate("map")}
          className="w-full trypo-card p-4 text-left active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="trypo-section-label">Route map</p>
            <span className="text-[12px] font-bold text-brand">Open map →</span>
          </div>
          {stops.length > 0 ? (
            <svg viewBox="0 0 320 86" className="w-full" style={{ height: 86 }} aria-hidden="true">
              <defs>
                <linearGradient id="trypo-route-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#3B41C8" />
                  <stop offset="1" stopColor="#06C4D4" />
                </linearGradient>
              </defs>
              {[20, 43, 66].map((y) => (
                <line key={y} x1="8" y1={y} x2="312" y2={y} stroke="#EEF0F8" strokeWidth="1" />
              ))}
              <path
                d={`M 20 52 ${stops.map((_, i) => {
                  const x = stops.length === 1 ? 160 : 20 + (i * 280) / (stops.length - 1)
                  const y = 52 - (i % 2 === 0 ? 0 : 14)
                  return `L ${x} ${y}`
                }).join(" ")}`}
                fill="none"
                stroke="url(#trypo-route-line)"
                strokeWidth="2.5"
                strokeDasharray="1 0"
                strokeLinecap="round"
              />
              {stops.map((stop, i) => {
                const x = stops.length === 1 ? 160 : 20 + (i * 280) / (stops.length - 1)
                const y = 52 - (i % 2 === 0 ? 0 : 14)
                return (
                  <g key={stop.id || i}>
                    <circle cx={x} cy={y} r="11" fill="#0D0F2E" />
                    <text x={x} y={y + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">
                      {i + 1}
                    </text>
                    <text x={x} y={y + 26} textAnchor="middle" fontSize="9" fontWeight="700" fill="#64748B">
                      {(stop.city || "").length > 10 ? `${stop.city.slice(0, 9)}…` : stop.city}
                    </text>
                  </g>
                )
              })}
            </svg>
          ) : (
            <div className="rounded-2xl border border-dashed px-4 py-5 text-center" style={{ borderColor: "#CBD5E1" }}>
              <p className="text-[13px] font-bold" style={{ color: "#64748B" }}>No stops yet — add destinations to see your route</p>
            </div>
          )}
        </button>
      </div>

      {/* Tabs live in TripDetailShell — one nav for all trip tools. */}

      {/* Community banner */}
      <div className="px-5 md:px-8 mb-4">
        <button
          onClick={() => navigate("trip-social")}
          className="w-full rounded-[20px] overflow-hidden flex items-center gap-4 px-4 py-4 relative"
          style={{
            background: "linear-gradient(135deg, #0D0F2E, #1e2080)",
            boxShadow: "0 8px 24px rgba(13,15,46,0.25)",
          }}
        >
          <div className="absolute inset-0 opacity-20">
            <div
              className="absolute right-0 top-0 w-32 h-32 rounded-full border border-white/20"
              style={{ transform: "translate(30%, -30%)" }}
            />
            <div
              className="absolute right-0 top-0 w-20 h-20 rounded-full border border-white/20"
              style={{ transform: "translate(20%, -10%)" }}
            />
          </div>
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-black text-[14px] tracking-wide"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            CO
          </div>
          <div className="flex-1 text-left relative">
            <p className="text-white font-black text-[15px]">Trip Community</p>
            <p className="text-white/50 text-[11px]">
              312 views · 3 join requests · 5 comments
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 relative">
            <div className="flex -space-x-1.5">
              {[
                "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&fit=crop",
                "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=40&h=40&fit=crop",
              ].map((a, i) => (
                <img
                  key={i}
                  src={a}
                  className="w-6 h-6 rounded-full object-cover border-2 border-[#1e2080]"
                  alt=""
                />
              ))}
            </div>
            <span
              className="text-[10px] font-black"
              style={{ color: "#FF6347" }}
            >
              3 want to join →
            </span>
          </div>
        </button>
      </div>

      {/* Route */}
      <div className="px-5 md:px-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Route
          </p>
          <p className="text-[10px] text-slate-300">
            ← swipe to delete · → to lock · ≡ drag
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

            const swipeBg =
              offset < -20
                ? `rgba(239,68,68,${Math.min(1, Math.abs(offset) / 80)})`
                : offset > 20
                  ? `rgba(${
                      isLocked ? "16,185,129" : "59,65,200"
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
                    className="flex flex-col items-center flex-shrink-0"
                    style={{ width: "32px" }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                      style={{
                        background: isLocked
                          ? "linear-gradient(135deg, #10b981, #047857)"
                          : "linear-gradient(135deg, #3B41C8, #06C4D4)",
                      }}
                    >
                      {isLocked ? "✓" : i + 1}
                    </div>
                    {(i < stops.length - 1 || isExpanded) && (
                      <div
                        className="w-[2px] flex-1 my-1"
                        style={{
                          background:
                            "linear-gradient(to bottom, #06C4D4, rgba(59,65,200,0.2))",
                          minHeight: isExpanded ? "12px" : "32px",
                        }}
                      />
                    )}
                  </div>

                  {/* Card + expand */}
                  <div className="pb-2 flex-1 min-w-0">
                    {/* Swipe wrapper */}
                    <div className="relative overflow-hidden rounded-2xl">
                      <div
                        className="absolute inset-0 rounded-2xl flex items-center justify-between px-5"
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
                        className="bg-white rounded-2xl flex items-center gap-3 relative"
                        style={{
                          boxShadow: isExpanded
                            ? "0 4px 16px rgba(59,65,200,0.14)"
                            : "0 2px 8px rgba(59,65,200,0.07)",
                          transform: `translateX(${offset}px)`,
                          transition: snapping
                            ? "transform 0.25s cubic-bezier(0.25,1,0.5,1)"
                            : "none",
                        }}
                        onTouchStart={(e) => onSwipeTouchStart(e, stop.id)}
                        onTouchMove={(e) => onSwipeTouchMove(e, stop.id)}
                        onTouchEnd={() => onSwipeTouchEnd(stop.id)}
                      >
                        <div className="flex-1 p-3.5 flex justify-between items-center min-w-0">
                          <button
                            type="button"
                            className="flex-1 text-left min-w-0 pr-2 group cursor-pointer"
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-navy font-black text-[15px] group-hover:text-brand transition-colors">
                                {stop.city}
                              </h3>
                              <span className="text-[11px] text-brand opacity-80 group-hover:opacity-100 font-bold flex items-center gap-0.5">
                                ↗
                              </span>
                            </div>
                            <p className="text-slate-400 text-[12px] truncate">
                              {stop.dates}
                            </p>
                          </button>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedStop(isExpanded ? null : stop.id)
                              }
                              className="px-2 py-1 rounded-xl text-[11px] font-bold text-slate-500 hover:text-navy hover:bg-slate-100 transition-colors flex items-center gap-1"
                              title={isExpanded ? "Collapse" : "Expand"}
                            >
                              <span
                                className="text-slate-400 text-[13px]"
                                style={{
                                  transform: isExpanded ? "rotate(180deg)" : "none",
                                  display: "inline-block",
                                  transition: "transform 0.2s",
                                }}
                              >
                                ▾
                              </span>
                            </button>

                            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  updateStopDays(stop.id, -1)
                                }}
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[12px] font-black"
                                  style={{ background: "rgba(59,65,200,0.08)", color: "#3B41C8" }}
                                >
                                  −
                                </button>
                                <span
                                  className="px-1 py-0.5 rounded-full text-[10px] font-bold"
                                  style={{
                                    background: "rgba(59,65,200,0.08)",
                                    color: "#3B41C8",
                                  }}
                                >
                                  {stop.days}d
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    updateStopDays(stop.id, 1)
                                  }}
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[12px] font-black"
                                  style={{ background: "rgba(59,65,200,0.08)", color: "#3B41C8" }}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>

                        {!isLocked && (
                          <div
                            draggable
                            onDragStart={(event) => onNativeDragStart(event, i)}
                            onDragEnd={onNativeDragEnd}
                            className="w-10 h-full flex items-center justify-center cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
                            onTouchStart={(e) => onDragTouchStart(e, i)}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 14 14"
                              fill="none"
                              opacity="0.25"
                            >
                              <circle cx="4" cy="3.5" r="1.2" fill="#0D0F2E" />
                              <circle cx="10" cy="3.5" r="1.2" fill="#0D0F2E" />
                              <circle cx="4" cy="7" r="1.2" fill="#0D0F2E" />
                              <circle cx="10" cy="7" r="1.2" fill="#0D0F2E" />
                              <circle cx="4" cy="10.5" r="1.2" fill="#0D0F2E" />
                              <circle
                                cx="10"
                                cy="10.5"
                                r="1.2"
                                fill="#0D0F2E"
                              />
                            </svg>
                          </div>
                        )}
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
                  <div className="flex gap-3 items-center" style={{ paddingLeft: "0px" }}>
                    <div
                      className="flex flex-col items-center flex-shrink-0"
                      style={{ width: "32px" }}
                    >
                      <div
                        className="w-[2px] h-3"
                        style={{ background: "rgba(59,65,200,0.2)" }}
                      />
                    </div>

                    <div className="flex-1 flex flex-col gap-1 mb-1">
                      {nextStop && (
                        <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {stop.city} → {nextStop.city} · {legDistance}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        {hasLeg ? (
                          <div
                            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
                            style={{
                              background: "rgba(59,65,200,0.06)",
                              border: "1px solid rgba(59,65,200,0.1)",
                            }}
                          >
                            <span className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black text-brand flex-shrink-0" style={{ background: "rgba(59,65,200,0.08)" }}><TransportIcon type={leg.label} size={16} /></span>
                            <div className="flex-1 min-w-0">
                              <p className="text-navy font-bold text-[12px]">
                                {leg.label}
                              </p>
                              <p className="text-slate-400 text-[10px] truncate">
                                {leg.detail}
                                {leg.duration ? ` · ${normalizeDuration(leg.duration)}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 font-black text-[10px]">
                                {legDistance}
                              </span>
                              <span className="text-brand font-black text-[11px]">
                                {leg.price}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (legKey) {
                                    setLegModalKey(legKey)
                                    setLegEditType(leg.label)
                                  }
                                }}
                                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                  background: "rgba(59,65,200,0.12)",
                                  color: "#3B41C8",
                                }}
                              >
                                <svg
                                  width="8"
                                  height="8"
                                  viewBox="0 0 8 8"
                                  fill="none"
                                >
                                  <path
                                    d="M1 7l5.5-5.5M5.5 1.5H7V3"
                                    stroke="#3B41C8"
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
                            className="flex items-center gap-2 px-3 py-2 rounded-xl"
                            style={{
                              background: "rgba(59,65,200,0.04)",
                              border: "1.5px dashed rgba(59,65,200,0.25)",
                            }}
                          >
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-white font-black text-[11px] flex-shrink-0"
                              style={{
                                background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                              }}
                            >
                              +
                            </div>
                            <span
                              className="text-[12px] font-bold"
                              style={{ color: "#3B41C8" }}
                            >
                              Add transport to {nextStop?.city}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Add stop button */}
          <div className="flex gap-3 items-center mt-1 mb-2">
            <div className="w-8 flex-shrink-0 flex items-center justify-center">
              <div
                className="w-[2px] h-5"
                style={{
                  background:
                    "linear-gradient(to bottom, #3B41C8, transparent)",
                }}
              />
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex-1 flex items-center gap-2.5 py-3 px-4 rounded-2xl border-2 border-dashed transition-all"
              style={{
                borderColor: "rgba(59,65,200,0.25)",
                background: "rgba(59,65,200,0.03)",
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-lg flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                }}
              >
                +
              </div>
              <span
                className="text-[13px] font-bold"
                style={{ color: "#3B41C8" }}
              >
                Add a destination
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Trip Tools */}
      <div className="px-5 md:px-8 mb-5 mt-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Trip Tools
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {[
            {
              label: "Packing List",
              sub: "9/15 packed",
              screen: "packing-list" as Screen,
            },
            {
              label: "Weather",
              sub: "Tunis 28°C",
              screen: "weather" as Screen,
            },
            {
              label: "Currency",
              sub: `1 USD = ${liveRates.TND ? liveRates.TND.toFixed(2) : "2.91"} TND`,
              screen: "currency" as Screen,
            },
            {
              label: "Trip Crew",
              sub: "3 travelers",
              screen: "collaborative" as Screen,
            },
            {
              label: "Split Bills",
              sub: "$317 total · 3 people",
              screen: "split-bills" as Screen,
            },
            {
              label: "Find Crew",
              sub: "Sarah 12min · Marco 32min",
              screen: "crew-tracker" as Screen,
            },
            {
              label: "Hidden Gems",
              sub: stops.length > 0 ? `Secrets in ${stops.map((s) => s.city).slice(0, 2).join(" & ")}` : "Local secrets nearby",
              screen: "hidden-gems" as Screen,
            },
            {
              label: "Vibe Match",
              sub: "Match today's mood",
              screen: "vibe-match" as Screen,
            },
            {
              label: "Community",
              sub: "312 views · 3 join requests",
              screen: "trip-social" as Screen,
            },
            {
              label: "Memories",
              sub: "Map style · photos · slideshow",
              screen: "trip-memories" as Screen,
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
              className="bg-white rounded-2xl p-3.5 flex items-center gap-3 text-left cursor-pointer transition-transform active:scale-98"
              style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.07)" }}
            >
              <span className="w-9 h-9 rounded-xl flex items-center justify-center text-brand flex-shrink-0" style={{ background: "rgba(59,65,200,0.07)" }}><ToolIcon name={tool.label} size={18} /></span>
              <div>
                <p className="text-navy font-bold text-[13px]">{tool.label}</p>
                <p className="text-slate-400 text-[10px]">{tool.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 md:px-8 pb-8 pt-2 flex flex-col gap-3">
        <button
          onClick={() => navigate("itinerary")}
          className="w-full py-4 rounded-2xl text-white font-bold text-[15px]"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 8px 24px rgba(59,65,200,0.3)",
          }}
        >
          View Itinerary →
        </button>

        {userRole === "owner" && (
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full py-3 rounded-2xl border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-600 font-bold text-[13px] flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Supprimer ce voyage
          </button>
        )}
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
