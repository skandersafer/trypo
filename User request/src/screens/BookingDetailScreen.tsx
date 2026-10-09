import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { searchFlights, searchHotels } from "../lib/travelApi"
import { addBooking, addItineraryItem, getTripDetails } from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
  bookingType?: "flight" | "stay" | "transport" | "activity"
}

const details = {
  flight: {
    emoji: "✈️",
    label: "Flight",
    accentColor: "#3B41C8",
    name: "Tunis → Sousse",
    sub: "TunisAir · TU214",
    status: "confirmed",
    ref: "TU9F4K",
    price: "$110",
    image:
      "https://images.unsplash.com/photo-1532370184535-22cec5ca8480?w=800&h=400&fit=crop&auto=format",
    fields: [
      { label: "Airline", value: "TunisAir" },
      { label: "Flight", value: "TU214" },
      { label: "Class", value: "Economy" },
      { label: "Date", value: "Jun 5, 2025" },
      { label: "Departure", value: "11:20 · Tunis-Carthage (TUN)" },
      { label: "Arrival", value: "12:10 · Sousse (SUS)" },
      { label: "Duration", value: "50m" },
      { label: "Baggage", value: "23kg checked + 7kg cabin" },
      { label: "Seat", value: "12C (Window)" },
      { label: "Meal", value: "Light snack included" },
      { label: "Booking ref", value: "TU9F4K" },
      { label: "Booked via", value: "Official airline" },
    ],
    notes:
      "Check in at least 90 minutes before takeoff. Keep your boarding pass ready for the gate.",
    actions: ["Download e-ticket", "Add to wallet", "Check-in online"],
  },
  stay: {
    emoji: "🏨",
    label: "Stay",
    accentColor: "#0891b2",
    name: "Le Jardin Tunis",
    sub: "Boutique stay · Jun 5–8",
    status: "confirmed",
    ref: "TJ102",
    price: "$84",
    image:
      "https://images.unsplash.com/photo-1591233244187-ffd622c51fbd?w=800&h=400&fit=crop&auto=format",
    fields: [
      { label: "Property", value: "Le Jardin Tunis" },
      { label: "Type", value: "Boutique room · Double" },
      { label: "Address", value: "Medina, Tunis" },
      { label: "Check-in", value: "Jun 5 · From 14:00" },
      { label: "Check-out", value: "Jun 8 · Until 11:00" },
      { label: "Nights", value: "3 nights" },
      { label: "Guests", value: "2 adults" },
      { label: "Rate", value: "$28/night" },
      { label: "Total", value: "$84 (paid)" },
      { label: "Cancellation", value: "Free until 48h before arrival" },
      { label: "Booking ref", value: "TJ102" },
      { label: "Booked via", value: "Direct booking" },
    ],
    notes:
      "WiFi is strong in the courtyard. Breakfast is served on the rooftop terrace each morning.",
    actions: ["Download confirmation", "Get directions", "Contact host"],
  },
  transport: {
    emoji: "🚆",
    label: "Train",
    accentColor: "#059669",
    name: "Tunis → Sfax",
    sub: "Société Nationale des Chemins de Fer · Jun 9",
    status: "confirmed",
    ref: "TN2210",
    price: "$34",
    image:
      "https://images.unsplash.com/photo-1778394859799-67341e3ee958?w=800&h=400&fit=crop&auto=format",
    fields: [
      { label: "Operator", value: "SNCFT" },
      { label: "Train", value: "Intercity 2210" },
      { label: "Class", value: "Second class" },
      { label: "Date", value: "Jun 9, 2025" },
      { label: "Departure", value: "08:45 · Tunis Ville" },
      { label: "Arrival", value: "11:30 · Sfax" },
      { label: "Duration", value: "2h 45m" },
      { label: "Seat", value: "Window seat 20A" },
      { label: "Meals", value: "Coffee and snacks available" },
      { label: "Booking ref", value: "TN2210" },
    ],
    notes:
      "Arrive 20 minutes early and keep your ticket ready. The route is fast and comfortable.",
    actions: ["Download ticket", "View timetable", "Get to station"],
  },
  activity: {
    emoji: "🎟",
    label: "Activity",
    accentColor: "#d97706",
    name: "Sousse Medina Walk",
    sub: "Local experience · Jun 6",
    status: "booked",
    ref: "SS-0611",
    price: "$18",
    image:
      "https://images.unsplash.com/photo-1601224335112-b74158e231ec?w=800&h=400&fit=crop&auto=format",
    fields: [
      { label: "Experience", value: "Old Medina & market walk" },
      { label: "Location", value: "Sousse Medina" },
      { label: "Date", value: "Jun 6, 2025" },
      { label: "Opening hours", value: "09:00 – 18:00" },
      { label: "Ticket type", value: "Guided walking pass" },
      { label: "Includes", value: "Local guide + market stops" },
      { label: "Dress code", value: "Comfortable shoes recommended" },
      { label: "Duration", value: "2 hours" },
      { label: "Price", value: "45 TND ($18)" },
      { label: "Booking ref", value: "SS-0611" },
    ],
    notes:
      "Bring water and a light scarf. The best photo spots are near the old gates and seaside lane.",
    actions: ["Download ticket", "Get directions", "Share with crew"],
  },
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> =
  {
    confirmed: {
      label: "✓ Confirmed",
      bg: "rgba(5,150,105,0.1)",
      text: "#059669",
    },
    booked: { label: "✓ Booked", bg: "rgba(59,65,200,0.1)", text: "#3B41C8" },
    pending: {
      label: "⏳ Pending",
      bg: "rgba(217,119,6,0.1)",
      text: "#d97706",
    },
  }

export default function BookingDetailScreen({
  navigate,
  goBack,
  bookingType = "flight",
}: Props) {
  const [liveDetail, setLiveDetail] = useState<typeof details.flight | null>(null)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [addingToItinerary, setAddingToItinerary] = useState(false)
  const [addedToItinerary, setAddedToItinerary] = useState(false)
  const [itineraryError, setItineraryError] = useState<string | null>(null)

  // Stay dates: asked here so the stay lands on the right itinerary days.
  const [checkIn, setCheckIn] = useState("")
  const [checkOut, setCheckOut] = useState("")
  const [tripStart, setTripStart] = useState("")
  const [tripEnd, setTripEnd] = useState("")
  const isDesktop = useIsDesktop()

  useEffect(() => {
    void getTripDetails().then((trip) => {
      const s = (trip?.start_date || "").slice(0, 10)
      const e = (trip?.end_date || "").slice(0, 10)
      setTripStart(s)
      setTripEnd(e)
      setCheckIn((prev) => prev || s)
      setCheckOut((prev) => prev || e || s)
    }).catch(() => {})
  }, [])

  // The hotel actually tapped in Find Stay (cached on "Book now").
  const cachedStay = (() => {
    if (bookingType !== "stay" || typeof window === "undefined") return null
    try {
      const raw = localStorage.getItem("trypo_selected_stay")
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()

  useEffect(() => {
    let active = true

    async function loadLiveDetail() {
      try {
        if (bookingType === "flight") {
          const [offer] = await searchFlights({
            origin: "Tunis",
            destination: "Sousse",
            departureDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            maxResults: 1,
          })

          if (!active) return

          if (offer) {
            setLiveDetail({
              emoji: "✈️",
              label: "Flight",
              accentColor: "#3B41C8",
              name: `Tunis → ${offer.destination === "SUS" ? "Sousse" : "Sfax"}`,
              sub: `${offer.airline} · ${offer.cabin}`,
              status: "confirmed",
              ref: offer.id.slice(0, 8).toUpperCase(),
              price: `$${Math.round(offer.price)}`,
              image:
                "https://images.unsplash.com/photo-1532370184535-22cec5ca8480?w=800&h=400&fit=crop&auto=format",
              fields: [
                { label: "Airline", value: offer.airline },
                { label: "Flight", value: offer.id.slice(0, 6).toUpperCase() },
                { label: "Class", value: offer.cabin },
                { label: "Date", value: new Date(offer.departureAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                { label: "Departure", value: `${new Date(offer.departureAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Tunis (TUN)` },
                { label: "Arrival", value: `${new Date(offer.arrivalAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${offer.destination === "SUS" ? "Sousse" : "Sfax"} (${offer.destination})` },
                { label: "Duration", value: offer.duration },
                { label: "Baggage", value: "23kg checked + 7kg cabin" },
                { label: "Seat", value: "Window seat available" },
                { label: "Meal", value: "Light snack included" },
                { label: "Booking ref", value: offer.id.slice(0, 8).toUpperCase() },
                { label: "Booked via", value: "Amadeus / live provider" },
              ],
              notes:
                "Your itinerary is synced with the latest live flight data. Keep this booking ready before departure.",
              actions: ["Download e-ticket", "Add to wallet", "Check-in online"],
            })
            return
          }
        }

        if (bookingType === "stay") {
          const [stay] = await searchHotels({ city: "Tunis", maxResults: 1 })
          if (!active) return

          if (stay) {
            setLiveDetail({
              emoji: "🏨",
              label: "Stay",
              accentColor: "#0891b2",
              name: stay.name,
              sub: `${stay.city} · dynamic stay offer`,
              status: "confirmed",
              ref: stay.id.slice(0, 8).toUpperCase(),
              price: `$${Math.round(stay.price)}`,
              image:
                stay.image ??
                "https://images.unsplash.com/photo-1591233244187-ffd622c51fbd?w=800&h=400&fit=crop&auto=format",
              fields: [
                { label: "Property", value: stay.name },
                { label: "Type", value: "Private room / boutique stay" },
                { label: "Address", value: `${stay.city}, ${stay.country}` },
                { label: "Check-in", value: "From 14:00" },
                { label: "Check-out", value: "Until 11:00" },
                { label: "Nights", value: "3 nights" },
                { label: "Guests", value: "2 adults" },
                { label: "Rate", value: `$${Math.round(stay.price)}/night` },
                { label: "Total", value: `$${Math.round(stay.price)} (paid)` },
                { label: "Cancellation", value: "Free until 48h before arrival" },
                { label: "Booking ref", value: stay.id.slice(0, 8).toUpperCase() },
                { label: "Booked via", value: "Live hotel provider" },
              ],
              notes:
                "This stay was loaded from the live destination data stream and can be updated with provider results once credentials are added.",
              actions: ["Download confirmation", "Get directions", "Contact host"],
            })
            return
          }
        }

        setLiveDetail(null)
      } catch {
        setLiveDetail(null)
      }
    }

    void loadLiveDetail()
    return () => {
      active = false
    }
  }, [bookingType])

  const d = liveDetail ?? (bookingType === "stay" && cachedStay
    ? {
      ...details.stay,
      name: String(cachedStay.name || details.stay.name),
      sub: `${String(cachedStay.location || cachedStay.city || "")} · ${String(cachedStay.vibe || "Stay")}`.trim(),
      price: String(cachedStay.price || details.stay.price),
      image: String(cachedStay.image || details.stay.image),
    }
    : details[bookingType])
  const s = statusConfig[d.status]

  return (
    <div className="min-h-full bg-surface pb-6">
      {/* Hero image */}
      <div className="relative h-[200px] md:h-[320px] bg-slate-900">
        <img
          src={d.image}
          alt={d.name}
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(13,15,46,0.7) 100%)",
          }}
        />
        <button
          onClick={() => goBack("trip-overview")}
          className="absolute top-12 left-5 w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(8px)",
          }}
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
        <div className="absolute bottom-5 left-5 right-5 md:left-8 md:right-8 flex items-end justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{
                background: "rgba(255,255,255,0.15)",
                backdropFilter: "blur(8px)",
              }}
            >
              {d.emoji}
            </div>
            <div>
              <p className="text-white font-black text-[18px] md:text-[24px] leading-tight">
                {d.name}
              </p>
              <p className="text-white/60 text-[11px]">{d.sub}</p>
            </div>
          </div>
          <span
            className="px-3 py-1 rounded-full text-[11px] font-black"
            style={{
              background: s.bg,
              color: s.text,
              backdropFilter: "blur(8px)",
            }}
          >
            {s.label}
          </span>
        </div>
      </div>

      {/* Price + ref strip */}
      <div
        className="mx-5 md:mx-8 -mt-4 relative z-10 rounded-2xl bg-white px-5 py-3.5 flex items-center justify-between"
        style={{ boxShadow: "0 8px 24px rgba(59,65,200,0.12)" }}
      >
        <div>
          <p className="text-slate-400 text-[10px] font-medium">Total paid</p>
          <p className="text-navy font-black text-[22px]">{d.price}</p>
        </div>
        <div className="text-right">
          <p className="text-slate-400 text-[10px] font-medium">Booking ref</p>
          <p
            className="font-black text-[14px]"
            style={{ color: d.accentColor, fontFamily: "monospace" }}
          >
            {d.ref}
          </p>
        </div>
        <button
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${d.accentColor}15` }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect
              x="3"
              y="1"
              width="10"
              height="14"
              rx="1.5"
              stroke={d.accentColor}
              strokeWidth="1.5"
            />
            <path
              d="M6 5h4M6 8h4M6 11h2"
              stroke={d.accentColor}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Details */}
      <div className="px-5 md:px-8 mt-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Booking Details
        </p>
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.07)" }}
        >
          {d.fields.map((f, i) => (
            <div key={f.label}>
              <div className="flex items-start justify-between px-4 py-3">
                <p className="text-slate-400 text-[12px] font-medium flex-shrink-0 w-[110px]">
                  {f.label}
                </p>
                <p className="text-navy font-semibold text-[13px] text-right flex-1">
                  {f.value}
                </p>
              </div>
              {i < d.fields.length - 1 && (
                <div className="h-[1px] bg-slate-50 mx-4" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="px-5 md:px-8 mt-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Important Notes
        </p>
        <div
          className="rounded-2xl p-4 flex gap-3"
          style={{
            background: `${d.accentColor}0d`,
            border: `1px solid ${d.accentColor}25`,
          }}
        >
          <span className="text-lg flex-shrink-0">💡</span>
          <p className="text-[13px] text-slate-600 leading-relaxed">
            {d.notes}
          </p>
        </div>
      </div>

      {/* Stay dates → itinerary days */}
      {bookingType === "stay" && (
        <div className="px-5 md:px-8 mt-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Your stay dates
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Check-in</label>
              <div className="bg-white rounded-2xl px-4 py-3" style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}>
                <input
                  type="date"
                  value={checkIn}
                  min={tripStart || undefined}
                  max={tripEnd || checkOut || undefined}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full text-navy font-semibold text-[13px] bg-transparent outline-none cursor-pointer"
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Check-out</label>
              <div className="bg-white rounded-2xl px-4 py-3" style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}>
                <input
                  type="date"
                  value={checkOut}
                  min={checkIn || tripStart || undefined}
                  max={tripEnd || undefined}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full text-navy font-semibold text-[13px] bg-transparent outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>
          {tripStart && tripEnd && (
            <p className="text-slate-400 text-[11px] mt-2">Trip: {tripStart} → {tripEnd}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-5 md:px-8 mt-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Actions
        </p>
        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-2" : "flex flex-col gap-2"}>
          {d.actions.map((action) => (
            <button
              key={action}
              onClick={() => setActiveAction(action)}
              className="w-full flex items-center justify-between bg-white rounded-2xl px-4 py-3.5"
              style={{
                boxShadow:
                  activeAction === action
                    ? `0 4px 14px ${d.accentColor}30`
                    : "0 2px 8px rgba(59,65,200,0.06)",
                border:
                  activeAction === action
                    ? `1.5px solid ${d.accentColor}40`
                    : "1.5px solid transparent",
              }}
            >
              <span className="text-navy font-semibold text-[14px]">
                {action}
              </span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M5 3l4 4-4 4"
                  stroke={d.accentColor}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 md:px-8 mt-5">
        <button
          disabled={addingToItinerary || addedToItinerary}
          onClick={async () => {
            setAddingToItinerary(true)
            setItineraryError(null)
            try {
              const trip = await getTripDetails()
              if (!trip) throw new Error("Create a trip before adding itinerary items.")
              const startsAt = bookingType === "stay" && checkIn
                ? new Date(`${checkIn}T14:00:00`).toISOString()
                : null
              const endsAt = bookingType === "stay" && (checkOut || checkIn)
                ? new Date(`${checkOut || checkIn}T11:00:00`).toISOString()
                : null
              const itineraryItem = await addItineraryItem({
                tripId: trip.id,
                itemType:
                  bookingType === "stay"
                    ? "stay"
                    : bookingType === "transport"
                      ? "transport"
                      : bookingType === "activity"
                        ? "activity"
                        : "flight",
                title: bookingType === "flight" && !d.name.toLowerCase().includes("flight") ? `Flight: ${d.name}` : d.name,
                details: `${d.sub} · Booking ref ${d.ref}${startsAt ? ` · ${checkIn}${checkOut && checkOut !== checkIn ? ` → ${checkOut}` : ""}` : ""}`,
                location_name: bookingType === "stay" ? d.name : undefined,
                starts_at: startsAt,
                ends_at: endsAt,
                estimatedCost: Number(d.price.replace(/[^\d.]/g, "")) || null,
                currency: d.price.includes("€") ? "EUR" : "USD",
              })
              await addBooking({
                tripId: trip.id,
                bookingType,
                provider: d.sub,
                confirmationCode: d.ref,
                status: "booked",
                startsAt,
                endsAt,
                amount: Number(d.price.replace(/[^\d.]/g, "")) || null,
                currency: d.price.includes("€") ? "EUR" : "USD",
                itineraryItemId: itineraryItem.id,
              })
              setAddedToItinerary(true)
              setTimeout(() => navigate("itinerary"), 500)
            } catch (error) {
              console.error("Failed to add booking to itinerary", error)
              setItineraryError(
                error instanceof Error
                  ? error.message
                  : "Unable to add this item to the itinerary.",
              )
            } finally {
              setAddingToItinerary(false)
            }
          }}
          className="w-full py-4 rounded-2xl text-white font-bold text-[15px]"
          style={{
            background: `linear-gradient(135deg, ${d.accentColor}, #06C4D4)`,
            boxShadow: `0 10px 28px ${d.accentColor}40`,
          }}
        >
          {addedToItinerary
            ? "Added to Trip Itinerary ✓"
            : addingToItinerary
              ? "Adding…"
              : "Add to Trip Itinerary"}
        </button>
        {itineraryError && (
          <p className="mt-2 text-center text-xs text-red-500">{itineraryError}</p>
        )}
      </div>
    </div>
  )
}
