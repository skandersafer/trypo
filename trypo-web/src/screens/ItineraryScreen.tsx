import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import { addItineraryItem, deleteItineraryItem, getDestinationStayDays, getTripDetails } from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"
import { searchPlaces, type PlaceSearchResult } from "../lib/travelApi"
import GoogleMapsPlacePicker from "../components/GoogleMapsPlacePicker"

const typeColors: Record<string, string> = {
  flight: "rgba(59,65,200,0.08)",
  stay: "rgba(8,145,178,0.08)",
  activity: "rgba(5,150,105,0.08)",
  food: "rgba(217,119,6,0.08)",
  transport: "rgba(59,65,200,0.08)",
  place: "rgba(148,163,184,0.08)",
  note: "rgba(148,163,184,0.08)",
}

function resolveCityName(
  raw: string,
  destMap: Record<string, string>,
  destCities: string[],
  fallbackIndex: number,
): string {
  const clean = raw.trim()
  if (!clean) return destCities[fallbackIndex] || "Destination"

  if (destMap[clean]) return destMap[clean]
  if (destMap[clean.toLowerCase()]) return destMap[clean.toLowerCase()]

  if (/^[0-9a-f-]{20,}$/i.test(clean)) {
    return destCities[fallbackIndex] || destCities[0] || "Destination"
  }

  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function formatEventTitle(
  rawTitle: string,
  type: string,
  destMap: Record<string, string> = {},
  destCities: string[] = [],
  dayIndex = 0,
): string {
  if (!rawTitle) return type === "flight" ? "Flight" : type === "transport" ? "Transport" : "Event"
  let title = rawTitle.trim()

  Object.entries(destMap).forEach(([id, city]) => {
    if (id && city) {
      title = title.replaceAll(id, city)
      title = title.replaceAll(id.toUpperCase(), city)
      title = title.replaceAll(id.toLowerCase(), city)
    }
  })

  let prefix = ""
  if (/^transport:\s*/i.test(title)) {
    prefix = "Transport: "
    title = title.replace(/^transport:\s*/i, "").trim()
  } else if (/^flight:\s*/i.test(title)) {
    prefix = "Flight: "
    title = title.replace(/^flight:\s*/i, "").trim()
  } else if (/^vol:\s*/i.test(title)) {
    prefix = "Flight: "
    title = title.replace(/^vol:\s*/i, "").trim()
  }

  if (title.includes("→") || title.includes("->")) {
    const sep = title.includes("→") ? "→" : "->"
    const parts = title.split(sep).map((p) => p.trim())
    const fromCity = resolveCityName(parts[0], destMap, destCities, dayIndex)
    const toCity = resolveCityName(parts[1] || "", destMap, destCities, dayIndex + 1)

    const label = type === "flight" ? "Flight" : type === "transport" ? (prefix.replace(":", "").trim() || "Transport") : null
    if (label) {
      return `${label}: ${fromCity} → ${toCity}`
    }
    return `${prefix}${fromCity} → ${toCity}`
  }

  if (/^[0-9a-f-]{20,}$/i.test(title)) {
    const resolved = resolveCityName(title, destMap, destCities, dayIndex)
    return type === "flight" ? `Flight to ${resolved}` : type === "transport" ? `Transport to ${resolved}` : resolved
  }

  const lower = title.toLowerCase()
  if (type === "flight" && !lower.startsWith("flight") && !lower.startsWith("vol")) {
    return `Flight ${title}`
  }

  return `${prefix}${title}`
}

type ParsedDay = {
  day: number
  date: string
  isoDate?: string
  city: string
  items: Array<{
    time: string
    type: string
    icon: string
    title: string
    id: string
    detail: string
    cost: string
    color: string
  }>
}

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

export default function ItineraryScreen({ navigate, goBack }: Props) {
  const { configured, user } = useAuth()
  const isDesktop = useIsDesktop()
  const [activeDay, setActiveDay] = useState(0)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [loading, setLoading] = useState(true)
  const [trip, setTrip] = useState<any>(null)
  const [days, setDays] = useState<ParsedDay[]>([])
  const [addType, setAddType] = useState<"activity" | "food" | "place" | "note" | "stay" | null>(null)
  const [addTitle, setAddTitle] = useState("")
  const [addDetails, setAddDetails] = useState("")
  const [addLocation, setAddLocation] = useState("")
  const [addTime, setAddTime] = useState("12:00")
  const [addCost, setAddCost] = useState("")
  const [addCurrency, setAddCurrency] = useState("EUR")
  const [checkIn, setCheckIn] = useState("")
  const [checkOut, setCheckOut] = useState("")
  const [stayNights, setStayNights] = useState(1)
  const [stayDays, setStayDays] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([])
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null)
  const [searchingPlaces, setSearchingPlaces] = useState(false)
  const [showGoogleMapsExplorer, setShowGoogleMapsExplorer] = useState(true)
  const [refreshVersion, setRefreshVersion] = useState(0)

  const handleSelectMapPlace = (place: PlaceSearchResult) => {
    setSelectedPlace(place)
    setAddTitle(place.name)
    setAddLocation(place.address)
    setPlaceResults([])
    if (activeDayData?.isoDate) {
      if (!checkIn) setCheckIn(activeDayData.isoDate)
      if (!checkOut) {
        const nextDayDate = new Date(`${activeDayData.isoDate}T00:00:00`)
        nextDayDate.setDate(nextDayDate.getDate() + 1)
        setCheckOut(nextDayDate.toISOString().slice(0, 10))
      }
    }
  }

  const findPlace = async () => {
    if (!addLocation.trim()) return
    setSearchingPlaces(true)
    setAddError(null)
    try {
      const results = await searchPlaces(addLocation, activeDayData?.city)
      setPlaceResults(results)
      if (results.length > 0) {
        handleSelectMapPlace(results[0])
      }
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Impossible de trouver ce lieu.")
    } finally {
      setSearchingPlaces(false)
    }
  }

  useEffect(() => {
    const refresh = () => setRefreshVersion((value) => value + 1)
    window.addEventListener("trypo-itinerary-sync", refresh)
    window.addEventListener("trypo:db_changed", refresh)
    return () => {
      window.removeEventListener("trypo-itinerary-sync", refresh)
      window.removeEventListener("trypo:db_changed", refresh)
    }
  }, [])

  useEffect(() => {
    if (addType === "stay") {
      setStayDays((prev) => (prev.length > 0 ? prev : activeDayData ? [activeDay] : []))
      if (activeDayData?.isoDate && !checkIn) {
        setCheckIn(activeDayData.isoDate)
        const out = new Date(`${activeDayData.isoDate}T00:00:00`)
        out.setDate(out.getDate() + 1)
        if (!checkOut) setCheckOut(out.toISOString().slice(0, 10))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addType, showAddSheet])

  useEffect(() => {
    setLoading(true)
    getTripDetails()
      .then((tripData) => {
        if (!tripData) {
          setTrip(null)
          setDays([])
          return
        }
        setTrip(tripData)

        const rawItems = tripData.itinerary_items || []
        const grouped: Record<string, typeof rawItems> = {}
        rawItems.forEach((item: any) => {
          const dateStr = item.starts_at
            ? new Date(item.starts_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "Planned"
          if (!grouped[dateStr]) grouped[dateStr] = []
          grouped[dateStr].push(item)
        })

        const destinations = (tripData.trip_destinations || []).slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        const destCities = destinations.map((d: any) => d.city)
        const destMap: Record<string, string> = {}
        destinations.forEach((d: any) => {
          if (d?.id && d?.city) {
            destMap[String(d.id)] = d.city
            destMap[String(d.id).toLowerCase()] = d.city
          }
        })
        const cityLabel = destCities.join(" → ") || "Destination"
        // Spread destinations across days using each stop's stay length
        // (a 3-night stop owns Day 1–3, the next stop starts on Day 4).
        // The old code used destinations[dayIndex], so Day 2 of a 3-day
        // stay wrongly showed the next city.
        const dayCities: string[] = []
        destinations.forEach((d: any) => {
          const span = Math.max(1, getDestinationStayDays(d))
          for (let k = 0; k < span; k++) dayCities.push(d.city)
        })
        const startDate = tripData.start_date ? new Date(`${tripData.start_date}T00:00:00`) : null
        const endDate = tripData.end_date ? new Date(`${tripData.end_date}T00:00:00`) : null
        const dayCount =
          startDate && endDate
            ? Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
            : 0
        const dayKeys = Array.from({ length: dayCount }, (_, index) => {
          const dayDate = new Date(startDate!)
          dayDate.setDate(dayDate.getDate() + index)
          return dayDate.toISOString().slice(0, 10)
        })
        const allDayKeys =
          dayKeys.length > 0
            ? dayKeys
            : Object.keys(grouped).length > 0
              ? Object.keys(grouped)
              : ["Planned"]

        const parsedDays: ParsedDay[] = allDayKeys.map((dateKey, index) => {
          const itemKey =
            dateKey.length === 10
              ? new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : dateKey
          const city = dayCities[index] || destCities[index] || cityLabel
          return {
          day: index + 1,
          isoDate: dateKey.length === 10 ? dateKey : undefined,
          date: dateKey.length === 10
            ? new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : dateKey,
          city,
          items: (grouped[itemKey] || grouped[dateKey] || []).map((it: any) => {
            let detail = it.details || it.location_name || ""
            Object.entries(destMap).forEach(([id, cityName]) => {
              if (id && cityName) {
                detail = detail.replaceAll(id, cityName)
                detail = detail.replaceAll(id.toUpperCase(), cityName)
                detail = detail.replaceAll(id.toLowerCase(), cityName)
              }
            })
            return {
              id: it.id,
              time: it.starts_at
                ? new Date(it.starts_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "All Day",
              type: it.item_type || "activity",
              icon:
                it.item_type === "flight"
                  ? "✈️"
                  : it.item_type === "stay"
                    ? "🏨"
                    : it.item_type === "food"
                      ? "🍜"
                      : it.item_type === "transport"
                        ? "🚆"
                        : "🎯",
              title: formatEventTitle(it.title, it.item_type || "activity", destMap, destCities, index),
              detail,
              cost: it.estimated_cost
                ? `${it.estimated_cost} ${it.currency === "EUR" ? "€" : it.currency === "TND" ? "د.ت" : it.currency === "GBP" ? "£" : "$"}`
                : "Free",
              color: "#3B41C8",
            }
          }),
        }})

        setDays(parsedDays)
      })
      .catch(() => {
        setTrip(null)
        setDays([])
      })
      .finally(() => setLoading(false))
  }, [configured, user, refreshVersion])

  const activeDayData = days[activeDay] || null
  const tripTitle = trip?.title || "Day-by-Day Itinerary"
  const tripDests =
    (trip?.trip_destinations || []).map((d: any) => d.city).join(" → ") ||
    "No destinations set"

  const saveItineraryItem = async () => {
    if (!trip?.id || !addType || !addTitle.trim()) return
    setSaving(true)
    setAddError(null)
    try {
      const locationName = selectedPlace
        ? `${selectedPlace.address} [${selectedPlace.lat},${selectedPlace.lng}]`
        : addLocation.trim() || undefined
      // Stay: one row per selected trip day so the stay shows on every
      // chosen day. Other types: single row on the active day.
      const stayDayList =
        addType === "stay" && stayDays.length > 0
          ? [...new Set(stayDays)].sort((a, b) => a - b).filter((d) => days[d])
          : []
      const builds: Array<{ startsAt: string | null; endsAt: string | null }> =
        stayDayList.length > 0
          ? stayDayList.map((d) => {
              const iso = days[d]?.isoDate
              const startsAt = iso ? `${iso}T${addTime || "12:00"}:00` : null
              const nextIso = days[d + 1]?.isoDate
              const fallbackOut = iso
                ? new Date(new Date(`${iso}T00:00:00`).getTime() + 86400000).toISOString().slice(0, 10)
                : null
              const outIso = checkOut || nextIso || fallbackOut
              return { startsAt, endsAt: outIso ? `${outIso}T${addTime || "12:00"}:00` : null }
            })
          : [
              {
                startsAt: (addType === "stay" ? checkIn : activeDayData?.isoDate)
                  ? `${(addType === "stay" ? checkIn : activeDayData?.isoDate)}T${addTime || "12:00"}:00`
                  : null,
                endsAt:
                  addType === "stay" && checkOut ? `${checkOut}T${addTime || "12:00"}:00` : null,
              },
            ]
      const created: Array<{ item: any; dayIndex: number }> = []
      for (const b of builds) {
        const dayIndex =
          stayDayList.length > 0
            ? stayDayList[builds.indexOf(b)]
            : activeDay
        const item = await addItineraryItem({
          tripId: trip.id,
          itemType: addType,
          title: addTitle.trim(),
          details: addDetails.trim() || undefined,
          locationName,
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          estimatedCost: addCost ? Number(addCost) : null,
          currency: addCurrency,
        })
        created.push({ item, dayIndex })
      }
      const toRow = (item: any) => ({
        id: item.id,
        time: item.starts_at
          ? new Date(item.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "All Day",
        type: item.item_type,
        icon: item.item_type === "food" ? "🍜" : item.item_type === "place" ? "📍" : item.item_type === "note" ? "📝" : item.item_type === "stay" ? "🏨" : "🎯",
        title: item.title,
        detail: item.details || item.location_name || "",
        cost: item.estimated_cost ? `${item.estimated_cost} ${item.currency}` : "Free",
        color: "#3B41C8",
      })
      setDays((current) =>
        current.map((day, index) => {
          const rows = created.filter((c) => c.dayIndex === index).map((c) => toRow(c.item))
          return rows.length > 0 ? { ...day, items: [...day.items, ...rows] } : day
        }),
      )
      setAddType(null)
      setAddTitle("")
      setAddDetails("")
      setAddLocation("")
      setAddCost("")
      setCheckIn("")
      setCheckOut("")
      setStayDays([])
      setStayNights(1)
      setSelectedPlace(null)
      setPlaceResults([])
      setShowAddSheet(false)
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Unable to save this item.")
    } finally {
      setSaving(false)
    }
  }

  const removeItineraryItem = async (itemId: string) => {
    try {
      await deleteItineraryItem(itemId)
      setDays((current) =>
        current.map((day) => ({
          ...day,
          items: day.items.filter((item) => item.id !== itemId),
        })),
      )
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Unable to delete this item.")
    }
  }

  return (
    <div className="min-h-full bg-surface relative">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-4">
        <button
          onClick={() => goBack("trip-overview")}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
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
          <h1 className="text-[20px] font-black text-navy">{tripTitle}</h1>
          <p className={`text-slate-400 text-[12px] ${isDesktop ? "md:max-w-none" : "truncate max-w-[220px]"}`}>
            {loading ? "Loading..." : tripDests}
          </p>
        </div>
      </div>

      {/* Day selector - rendered ONLY when days exist */}
      {days.length > 0 && (
        <div className={isDesktop ? "grid grid-cols-4 lg:grid-cols-7 gap-2 px-5 md:px-8 mb-5 pb-1" : "flex gap-2 px-5 mb-5 overflow-x-auto pb-1"}>
          {days.map((d, i) => (
            <button
              key={d.day}
              onClick={() => setActiveDay(i)}
              className="flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-2xl transition-all"
              style={{
                background: i === activeDay ? "#3B41C8" : "white",
                boxShadow:
                  i === activeDay
                    ? "0 6px 16px rgba(59,65,200,0.3)"
                    : "0 2px 6px rgba(0,0,0,0.06)",
              }}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  i === activeDay ? "text-white/70" : "text-slate-400"
                }`}
              >
                {d.date}
              </span>
              <span
                className={`text-[13px] font-black ${
                  i === activeDay ? "text-white" : "text-navy"
                }`}
              >
                Day {d.day}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Location badge - rendered ONLY when active day exists */}
      {activeDayData && (
        <div className="px-5 md:px-8 mb-4 flex items-center gap-2">
          <span className="text-[13px]">📍</span>
          <span className="text-navy font-bold text-[14px]">
            {activeDayData.city}
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-400 text-[13px]">
            {activeDayData.items.length} events
          </span>
        </div>
      )}

      {/* Timeline or Empty State */}
      <div className="px-5 md:px-8 pb-24">
        {days.length === 0 && !loading && (
          <div
            className="bg-white rounded-[24px] p-8 text-center"
            style={{ boxShadow: "0 4px 20px rgba(59,65,200,0.08)" }}
          >
            <span className="text-4xl mb-3 block">🗓️</span>
            <h3 className="text-navy font-bold text-[17px] mb-1">
              No plans yet
            </h3>
            <p className="text-slate-400 text-[13px] mb-6 max-w-[240px] mx-auto">
              Start planning your trip by adding your first activity.
            </p>
            <button
              onClick={() => setShowAddSheet(true)}
              className="px-6 py-3 rounded-2xl font-black text-[13px] text-white"
              style={{
                background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                boxShadow: "0 6px 18px rgba(59,65,200,0.3)",
              }}
            >
              + Add First Activity
            </button>
          </div>
        )}

        {activeDayData &&
          activeDayData.items.map((item, i) => (
            <div key={i} className="flex gap-4 items-start">
              {/* Time + line */}
              <div
                className="flex flex-col items-center"
                style={{ width: "44px" }}
              >
                <span className="text-[11px] font-bold text-slate-400 text-center leading-tight mb-2">
                  {item.time}
                </span>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[15px] flex-shrink-0"
                  style={{
                    background: typeColors[item.type] || typeColors.activity,
                  }}
                >
                  {item.icon}
                </div>
                {i < activeDayData.items.length - 1 && (
                  <div
                    className="w-[2px] my-1 flex-1"
                    style={{ minHeight: "28px", background: "#e2e8f0" }}
                  />
                )}
              </div>

              {/* Card */}
              <div className="pb-3 flex-1">
                <div
                  className="relative bg-white rounded-2xl p-3.5 flex justify-between items-start"
                  style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.07)" }}
                >
                  <div className="flex-1 mr-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{
                          background:
                            typeColors[item.type] || typeColors.activity,
                          color: item.color,
                        }}
                      >
                        {item.type}
                      </span>
                    </div>
                    <h3 className="text-navy font-bold text-[14px] mb-0.5">
                      {item.title}
                    </h3>
                    <p className="text-slate-400 text-[12px]">{item.detail}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-brand font-black text-[13px] flex-shrink-0">
                      {item.cost}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeItineraryItem(item.id)}
                      className="text-[11px] font-bold text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowAddSheet(true)}
        className="absolute bottom-6 right-5 flex items-center gap-2 px-5 py-3.5 rounded-2xl text-white font-bold text-[14px]"
        style={{
          background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
          boxShadow: "0 12px 28px rgba(59,65,200,0.45)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 2v12M2 8h12"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Add to Day
      </button>

      {/* Add sheet overlay — fixed to the viewport (not the scroll container)
          so the sheet always anchors to the visible screen bottom on phones. */}
      {showAddSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
          onClick={() => setShowAddSheet(false)}
        >
          <div className="absolute inset-0 bg-navy/50" />
          <div
            className="relative w-full md:max-w-[430px] max-h-[88dvh] overflow-y-auto rounded-t-[28px] md:rounded-[28px] bg-white px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-3" />
            <div className="flex items-center justify-between mb-4 gap-2">
              <h3 className="text-navy font-black text-[18px] min-w-0">
                {addType ? `Add ${addType === "stay" ? "stay manually" : addType}` : "What do you want to add?"}
              </h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                {addType && (
                  <button
                    type="button"
                    onClick={() => setAddType(null)}
                    className="text-[12px] font-bold text-brand"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSheet(false)
                    setAddType(null)
                  }}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-[13px]"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            {!addType && (
              <div className="flex flex-col gap-2">
                {[
                  {
                    icon: "🏨",
                    label: "Stay",
                    sub: "Find a hostel or hotel",
                    screen: null,
                    type: "stay" as const,
                  },
                  {
                    icon: "✈️",
                    label: "Flight",
                    sub: "Add your flight details",
                    screen: "transport" as Screen,
                  },
                  {
                    icon: "🚆",
                    label: "Transport",
                    sub: "Train, bus, ferry or taxi",
                    screen: "transport" as Screen,
                  },
                  {
                    icon: "🎯",
                    label: "Activity",
                    sub: "Browse things to do",
                    screen: null,
                    type: "activity" as const,
                  },
                  {
                    icon: "💎",
                    label: "Hidden Gems",
                    sub: "Local secrets & tips",
                    screen: "hidden-gems" as Screen,
                  },
                  {
                    icon: "📝",
                    label: "Note",
                    sub: "Add personal notes",
                    screen: null,
                    type: "note" as const,
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      if (item.screen) navigate(item.screen)
                      else if ("type" in item) {
                        setAddType(item.type)
                        setShowAddSheet(true)
                      }
                    }}
                    className="flex items-center gap-4 p-3 rounded-2xl hover:bg-surface transition-colors text-left"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                      style={{ background: "rgba(59,65,200,0.07)" }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <p className="text-navy font-bold text-[14px]">
                        {item.label}
                      </p>
                      <p className="text-slate-400 text-[12px]">{item.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {addType && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-navy font-black text-[15px]">
                    Ajouter à Jour {activeDay + 1} ({activeDayData?.city || "Destination"})
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowGoogleMapsExplorer((prev) => !prev)}
                    className="text-[11px] font-bold text-brand hover:underline"
                  >
                    {showGoogleMapsExplorer ? "Mode simple" : "🗺️ Ouvrir Google Maps"}
                  </button>
                </div>

                {/* Google Maps Explorer Component */}
                {showGoogleMapsExplorer && (
                  <div className="mb-4">
                    <GoogleMapsPlacePicker
                      cityContext={activeDayData?.city || "Paris"}
                      initialQuery={addLocation || addTitle || ""}
                      placeType={addType}
                      onSelectPlace={handleSelectMapPlace}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                      Titre / Nom du lieu
                    </label>
                    <input
                      value={addTitle}
                      onChange={(e) => setAddTitle(e.target.value)}
                      placeholder={addType === "stay" ? "ex: Hôtel Le Meurice" : "ex: Visite Musée"}
                      className="w-full rounded-xl bg-slate-50 px-4 py-3 text-[13px] font-semibold text-navy outline-none border border-slate-200/60 focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                      Adresse ou Emplacement
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={addLocation}
                        onChange={(e) => {
                          setAddLocation(e.target.value)
                          setSelectedPlace(null)
                        }}
                        placeholder={addType === "stay" ? "Adresse, rue ou hôtel" : "Lieu (optionnel)"}
                        className="min-w-0 flex-1 rounded-xl bg-slate-50 px-4 py-3 text-[13px] outline-none border border-slate-200/60 focus:border-brand"
                      />
                      <button
                        type="button"
                        onClick={() => void findPlace()}
                        className="rounded-xl bg-indigo-50 px-3.5 text-[12px] font-bold text-brand hover:bg-indigo-100 transition-colors shadow-xs"
                      >
                        {searchingPlaces ? "..." : "Trouver"}
                      </button>
                    </div>
                  </div>

                  {placeResults.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm max-h-40 overflow-y-auto">
                      {placeResults.map((place) => (
                        <div
                          key={`${place.lat}-${place.lng}`}
                          className="border-b border-slate-100 p-2.5 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => handleSelectMapPlace(place)}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] font-bold text-navy">{place.name}</p>
                            <span className="text-[10px] font-bold text-brand">Choisir ✓</span>
                          </div>
                          <p className="text-[10px] text-slate-400 line-clamp-1">{place.address}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedPlace && !showGoogleMapsExplorer && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-emerald-600 text-[13px]">📍</span>
                          <p className="text-[12px] font-black text-emerald-900 truncate">{selectedPlace.name}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowGoogleMapsExplorer(true)}
                          className="text-[11px] font-bold text-brand hover:underline flex-shrink-0"
                        >
                          Changer sur la carte 🗺️
                        </button>
                      </div>
                      <p className="text-[10px] text-emerald-700 line-clamp-1">{selectedPlace.address}</p>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                      Détails ou Remarques
                    </label>
                    <input
                      value={addDetails}
                      onChange={(e) => setAddDetails(e.target.value)}
                      placeholder="Chambre vue mer, code réservation, etc."
                      className="w-full rounded-xl bg-slate-50 px-4 py-3 text-[13px] outline-none border border-slate-200/60"
                    />
                  </div>

                  {addType === "stay" && (
                    <div className="flex flex-col gap-3 rounded-2xl border border-brand/15 bg-brand/[0.03] p-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                          Which days are you staying? ({stayDays.length || stayNights} night{(stayDays.length || stayNights) > 1 ? "s" : ""})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {days.map((d, i) => {
                            const selected = stayDays.includes(i)
                            return (
                              <button
                                key={d.day}
                                type="button"
                                onClick={() => {
                                  setStayDays((prev) => {
                                    const next = prev.includes(i)
                                      ? prev.filter((x) => x !== i)
                                      : [...prev, i].sort((a, b) => a - b)
                                    const sorted = [...next].sort((a, b) => a - b)
                                    if (sorted.length > 0) {
                                      const first = days[sorted[0]]?.isoDate
                                      const last = days[sorted[sorted.length - 1]]?.isoDate
                                      if (first && !checkIn) setCheckIn(first)
                                      else if (first) setCheckIn(first)
                                      if (last) {
                                        const out = new Date(`${last}T00:00:00`)
                                        out.setDate(out.getDate() + 1)
                                        setCheckOut(out.toISOString().slice(0, 10))
                                      }
                                      setStayNights(sorted.length)
                                    }
                                    return next
                                  })
                                }}
                                className="px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all"
                                style={{
                                  background: selected ? "#3B41C8" : "white",
                                  color: selected ? "white" : "#3B41C8",
                                  border: selected ? "1.5px solid #3B41C8" : "1.5px solid #e2e8f0",
                                }}
                              >
                                Day {d.day} · {d.date}
                              </button>
                            )
                          })}
                        </div>
                        {days.length === 0 && (
                          <p className="text-[11px] text-slate-400">Set trip dates first to pick days.</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex-1">
                          Nights
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.max(1, stayNights - 1)
                              setStayNights(next)
                              const base = stayDays.length > 0 ? Math.min(...stayDays) : activeDay
                              const seq = Array.from({ length: next }, (_, k) => base + k).filter((x) => days[x])
                              setStayDays(seq)
                              const last = days[seq[seq.length - 1]]?.isoDate
                              if (days[base]?.isoDate) setCheckIn(days[base].isoDate!)
                              if (last) {
                                const out = new Date(`${last}T00:00:00`)
                                out.setDate(out.getDate() + 1)
                                setCheckOut(out.toISOString().slice(0, 10))
                              }
                            }}
                            className="w-7 h-7 rounded-full font-black"
                            style={{ background: "rgba(59,65,200,0.08)", color: "#3B41C8" }}
                          >
                            −
                          </button>
                          <span className="text-[14px] font-black text-navy min-w-[48px] text-center">{stayNights}n</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.min(days.length || 30, stayNights + 1)
                              setStayNights(next)
                              const base = stayDays.length > 0 ? Math.min(...stayDays) : activeDay
                              const seq = Array.from({ length: next }, (_, k) => base + k).filter((x) => days[x])
                              setStayDays(seq)
                              const last = days[seq[seq.length - 1]]?.isoDate
                              if (days[base]?.isoDate) setCheckIn(days[base].isoDate!)
                              if (last) {
                                const out = new Date(`${last}T00:00:00`)
                                out.setDate(out.getDate() + 1)
                                setCheckOut(out.toISOString().slice(0, 10))
                              }
                            }}
                            className="w-7 h-7 rounded-full font-black"
                            style={{ background: "rgba(59,65,200,0.08)", color: "#3B41C8" }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Arrivée (Check-in)
                          <input
                            type="date"
                            value={checkIn}
                            onChange={(e) => setCheckIn(e.target.value)}
                            className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] font-medium border border-slate-200/60"
                          />
                        </label>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Départ (Check-out)
                          <input
                            type="date"
                            value={checkOut}
                            min={checkIn || undefined}
                            onChange={(e) => setCheckOut(e.target.value)}
                            className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] font-medium border border-slate-200/60"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Heure
                      </label>
                      <input
                        type="time"
                        value={addTime}
                        onChange={(e) => setAddTime(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] font-medium outline-none border border-slate-200/60"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                        Coût estimé
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={addCost}
                          onChange={(e) => setAddCost(e.target.value.replace(/[^0-9]/g, ""))}
                          placeholder="0"
                          className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] font-medium outline-none border border-slate-200/60"
                        />
                        <select
                          value={addCurrency}
                          onChange={(e) => setAddCurrency(e.target.value)}
                          className="w-18 rounded-xl bg-slate-50 px-2 py-2.5 text-[12px] font-bold outline-none border border-slate-200/60"
                        >
                          <option>EUR</option>
                          <option>USD</option>
                          <option>GBP</option>
                          <option>TND</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    disabled={saving || !addTitle.trim()}
                    onClick={() => void saveItineraryItem()}
                    className="mt-2 rounded-xl bg-brand py-3.5 text-white font-bold text-[14px] shadow-sm hover:bg-brand/90 disabled:opacity-50 transition-all"
                  >
                    {saving ? "Enregistrement..." : "Enregistrer dans l'itinéraire ✓"}
                  </button>
                  {addError && <p className="text-[11px] font-bold text-red-600">{addError}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
