import { useState, useEffect } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import { useIsDesktop } from "../lib/useIsDesktop"
import { addBooking, addItineraryItem, deleteBooking, deleteItineraryItem, getTripDetails } from "../lib/trips"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
  openBooking?: (type: "flight" | "stay" | "transport" | "activity") => void
}

type TransportItem = {
  id?: string | number
  icon: string
  type: string
  from: string
  to: string
  fromCode: string
  toCode: string
  date: string
  time: string
  arrivalTime: string
  duration: string
  price: string
  priceNum: number
  status: "confirmed" | "booked" | "pending"
  operator: string
  reference?: string
  itineraryItemId?: string
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  confirmed: {
    bg: "rgba(5,150,105,0.1)",
    text: "#059669",
    label: "✓ Confirmed",
  },
  booked: { bg: "rgba(59,65,200,0.1)", text: "#3B41C8", label: "✓ Booked" },
  pending: {
    bg: "rgba(217,119,6,0.1)",
    text: "#d97706",
    label: "⏳ Pending",
  },
}

const transportTypes = [
  { icon: "✈️", label: "Flight" },
  { icon: "🚆", label: "Train" },
  { icon: "🚌", label: "Bus" },
  { icon: "⛴", label: "Ferry" },
  { icon: "🚕", label: "Taxi/Grab" },
  { icon: "🏍", label: "Motorbike" },
]

export default function TransportScreen({ navigate, openBooking, goBack }: Props) {
  const { configured, user } = useAuth()
  const isDesktop = useIsDesktop()
  const [transportsList, setTransportsList] = useState<TransportItem[]>([])
  const [tripTitle, setTripTitle] = useState<string>("My Trip")
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedType, setSelectedType] = useState("Flight")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [date, setDate] = useState("")
  const [departureTime, setDepartureTime] = useState("12:00")
  const [duration, setDuration] = useState("3h")
  const [reference, setReference] = useState("")
  const [price, setPrice] = useState("")
  const [currency, setCurrency] = useState("EUR")
  const [added, setAdded] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const removeTransport = async (t: TransportItem) => {
    if (!t.id || deletingId) return
    if (!window.confirm("Delete this transport segment?")) return
    const transportId = String(t.id)
    setDeletingId(transportId)
    try {
      await deleteBooking(transportId)
      if (t.itineraryItemId) await deleteItineraryItem(t.itineraryItemId)
      // Drop it locally right away so the TripOverview leg (which prunes
      // legs without booking rows on its next load) disappears too.
      setTransportsList((prev) => prev.filter((x) => String(x.id) !== transportId))
    } catch (e) {
      console.error("Failed to delete transport:", e)
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    let active = true

    async function loadRoute() {
      setLoading(true)

      try {
        const tripData = await getTripDetails()

        if (!active) return

        if (tripData) {
          setTripTitle(tripData.title || "My Trip")
          const destinations = tripData.trip_destinations || []
          const destCities = destinations.map((d: any) => d.city)
          const destMap: Record<string, string> = {}
          destinations.forEach((d: any) => {
            if (d?.id && d?.city) {
              destMap[String(d.id)] = d.city
              destMap[String(d.id).toLowerCase()] = d.city
            }
          })
          const cleanCityName = (val: string, fallback: string) => {
            let res = (val || "").trim()
            Object.entries(destMap).forEach(([id, city]) => {
              if (id && city) {
                res = res.replaceAll(id, city)
                res = res.replaceAll(id.toUpperCase(), city)
                res = res.replaceAll(id.toLowerCase(), city)
              }
            })
            if (/^[0-9a-f-]{20,}$/i.test(res)) return fallback
            return res || fallback
          }

          const bookings = (tripData.bookings || []).filter(
            (b: any) => b.booking_type === "transport" || b.booking_type === "flight",
          )
          const mappedBookings: TransportItem[] = bookings.map((b: any, index: number) => {
            const rawFrom = b.notes?.match(/^(.+?) → /)?.[1] || "From"
            const rawTo = b.notes?.match(/ → (.+?)(?: ·|$)/)?.[1] || "To"
            const fromCity = cleanCityName(rawFrom, destCities[index] || "From")
            const toCity = cleanCityName(rawTo, destCities[index + 1] || "To")

            return {
              id: b.id,
              icon: b.booking_type === "flight" ? "✈️" : "🚆",
              type: b.booking_type === "flight" ? "Flight" : "Transport",
              from: fromCity,
              to: toCity,
              fromCode: fromCity.slice(0, 3).toUpperCase(),
              toCode: toCity.slice(0, 3).toUpperCase(),
              date: b.starts_at ? new Date(b.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD",
              time: b.starts_at ? new Date(b.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
              arrivalTime: b.ends_at ? new Date(b.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
              duration: b.notes?.match(/ · ([^·]+?)(?: · Ref|$)/)?.[1] || "—",
              price: b.amount ? `${b.amount} ${b.currency === "EUR" ? "€" : b.currency === "TND" ? "د.ت" : "$"}` : "—",
              priceNum: Number(b.amount) || 0,
              status: (b.status || "confirmed") as any,
              operator: b.provider || b.vendor_name || "Direct",
              reference: b.confirmation_code || b.notes?.match(/Ref (.+)$/)?.[1],
              itineraryItemId: b.itinerary_item_id || b.itineraryItemId || undefined,
            }
          })
          if (mappedBookings.length > 0) {
            setTransportsList(mappedBookings)
            setLoading(false)
            return
          }
        }
        setTransportsList([])
      } catch {
        if (active) {
          setTransportsList([])
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadRoute()
    const onDbChange = () => {
      void loadRoute()
    }
    window.addEventListener("trypo:db_changed", onDbChange)
    return () => {
      active = false
      window.removeEventListener("trypo:db_changed", onDbChange)
    }
  }, [])

  const totalCost = transportsList.reduce((sum, t) => sum + (t.priceNum || 0), 0)

  const submit = async () => {
    if (!from || !to) return
    const chosenIcon = transportTypes.find((t) => t.label === selectedType)?.icon || "🚌"
    const amount = price ? Number(String(price).replace(",", ".")) || 0 : 0
    const priceLabel = amount > 0 ? `${amount} ${currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "TND" ? "د.ت" : "€"}` : "—"
    const durationMatch = duration.match(/(\d+(?:[.,]\d+)?)\s*h/i)
    const minuteMatch = duration.match(/(\d+)\s*m/i)
    const totalMinutes = Math.round(Number(durationMatch?.[1]?.replace(",", ".") || 0) * 60 + Number(minuteMatch?.[1] || 0))
    const departure = date ? new Date(`${date}T${departureTime}:00`) : null
    const arrival = departure ? new Date(departure.getTime() + totalMinutes * 60000) : null
    const newSegment: TransportItem = {
      id: Date.now(),
      icon: chosenIcon,
      type: selectedType,
      from,
      to,
      fromCode: from.slice(0, 3).toUpperCase(),
      toCode: to.slice(0, 3).toUpperCase(),
      date: date || "TBD",
      time: departureTime || "12:00",
      arrivalTime: arrival ? arrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "15:00",
      duration: duration || "3h",
      price: priceLabel,
      priceNum: amount,
      status: "confirmed",
      operator: "Planned Transport",
    }
    const tripData = await getTripDetails()
    if (!tripData) return
    const startsAt = departure ? departure.toISOString() : null
    const endsAt = arrival ? arrival.toISOString() : null
    const itineraryItem = await addItineraryItem({
      tripId: tripData.id,
      itemType: selectedType === "Flight" ? "flight" : "transport",
      title: selectedType === "Flight" ? `Flight: ${from} → ${to}` : `${selectedType}: ${from} → ${to}`,
      details: `${selectedType} · ${duration}${reference ? ` · Ref ${reference}` : ""}`,
      startsAt,
      endsAt,
      estimatedCost: amount > 0 ? amount : null,
      currency,
    })
    await addBooking({
      tripId: tripData.id,
      bookingType: selectedType === "Flight" ? "flight" : "transport",
      provider: "Planned transport",
      status: "booked",
      startsAt,
      endsAt,
      confirmationCode: reference || undefined,
      amount: amount > 0 ? amount : null,
      currency,
      notes: `${from} → ${to} · ${duration}${reference ? ` · Ref ${reference}` : ""}`,
      itineraryItemId: itineraryItem.id,
    })
    window.dispatchEvent(new Event("trypo-itinerary-sync"))
    setTransportsList((prev) => [...prev, { ...newSegment }])
    setAdded(true)
    setTimeout(() => {
      setAdded(false)
      setShowAdd(false)
      setFrom("")
      setTo("")
      setDate("")
      setDepartureTime("12:00")
      setDuration("3h")
      setReference("")
      setPrice("")
    }, 1200)
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-5">
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
          <h1 className="text-[20px] md:text-[26px] font-black text-navy">Getting Around</h1>
          <p className="text-slate-400 text-[12px] md:max-w-none">
            {tripTitle} · {transportsList.length} segments
          </p>
        </div>
      </div>

      {/* Total cost banner */}
      <div
        className="mx-5 md:mx-8 mb-5 rounded-2xl p-4 flex items-center justify-between"
        style={{ background: "linear-gradient(135deg, #0D0F2E, #1e2080)" }}
      >
        <div>
          <p className="text-white/60 text-[11px] font-medium mb-0.5">
            Total Transport Cost
          </p>
          <p className="text-white font-black text-[24px]">${totalCost}</p>
        </div>
        <button
          onClick={() => openBooking?.("flight")}
          className="px-3 py-2 rounded-xl text-[11px] font-black text-white"
          style={{ background: "rgba(6,196,212,0.2)" }}
        >
          Book now
        </button>
      </div>

      {/* Transport segments */}
      <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 pb-6" : "px-5 flex flex-col gap-4 pb-6"}>
        {loading ? (
          <div className="bg-white rounded-[22px] p-8 text-center shadow-sm">
            <p className="text-slate-400 text-sm">Loading transport options...</p>
          </div>
        ) : transportsList.length === 0 ? (
          <div className="bg-white rounded-[22px] p-8 text-center shadow-sm">
            <span className="text-4xl mb-3 block">🗺</span>
            <h3 className="text-navy font-bold text-[15px]">No transport added yet</h3>
            <p className="text-slate-400 text-[12px] mt-1">
              Tap below to add your flights, trains, or buses
            </p>
          </div>
        ) : (
          transportsList.map((t, i) => {
            const s = statusColors[t.status] || statusColors.confirmed
            return (
              <div
                key={t.id || i}
                className="bg-white rounded-[22px] overflow-hidden"
                style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.08)" }}
              >
                {/* Top row */}
                <div className="px-4 pt-4 pb-3 border-b border-slate-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                        style={{ background: "rgba(59,65,200,0.07)" }}
                      >
                        {t.icon}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                        {t.type}
                      </span>
                    </div>
                    <span
                      className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                      style={{ background: s.bg, color: s.text }}
                    >
                      {s.label}
                    </span>
                  </div>

                  {/* Route */}
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <span className="text-navy font-black text-[18px]">
                        {t.fromCode}
                      </span>
                      <span className="text-slate-400 text-[11px]">{t.from}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-slate-300 text-[11px] font-medium">
                        {t.duration}
                      </span>
                      <div className="flex items-center w-full gap-1">
                        <div className="flex-1 h-[1.5px] bg-slate-200" />
                        <span className="text-sm">{t.icon}</span>
                        <div className="flex-1 h-[1.5px] bg-slate-200" />
                      </div>
                      <span className="text-slate-300 text-[10px]">
                        {t.operator}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-navy font-black text-[18px]">
                        {t.toCode}
                      </span>
                      <span className="text-slate-400 text-[11px]">{t.to}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom row */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex gap-4">
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Date
                      </p>
                      <p className="text-navy font-bold text-[12px]">{t.date}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Depart
                      </p>
                      <p className="text-navy font-bold text-[12px]">{t.time}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Arrive
                      </p>
                      <p className="text-navy font-bold text-[12px]">
                        {t.arrivalTime}
                      </p>
                    </div>
                    {t.reference && (
                      <div>
                        <p className="text-[10px] text-slate-400 font-medium">Ref</p>
                        <p className="text-navy font-bold text-[12px] font-mono">{t.reference}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-navy font-black text-[17px]">
                      {t.price}
                    </span>
                    <button
                      onClick={() => void removeTransport(t)}
                      disabled={deletingId === String(t.id)}
                      aria-label="Delete transport"
                      title="Delete transport"
                      className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40"
                      style={{ background: "rgba(220,38,38,0.08)" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M2 4h12M6.5 4V2.5h3V4M4 4l1 9.5h6l1-9.5M6.5 7v4M9.5 7v4"
                          stroke="#DC2626"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add Transport */}
      <div className="px-5 md:px-8 pb-6">
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-4 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2"
          style={{
            border: "2px dashed #3B41C8",
            color: "#3B41C8",
            background: "rgba(59,65,200,0.04)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 2v12M2 8h12"
              stroke="#3B41C8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Add Transport
        </button>
      </div>

      {/* Add Transport Sheet */}
      {showAdd && (
        <div
          className="absolute inset-0 flex items-end"
          style={{
            zIndex: 100,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setShowAdd(false)}
        >
          <div
            className="w-full bg-white rounded-t-[32px] p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-5" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-navy font-black text-[18px]">
                Add Transport
              </h3>
              <button
                onClick={() => setShowAdd(false)}
                className="text-slate-300 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Type selector */}
            <div className={isDesktop ? "grid grid-cols-3 lg:grid-cols-6 gap-2 mb-4" : "flex gap-2 mb-4 overflow-x-auto pb-1"}>
              {transportTypes.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setSelectedType(t.label)}
                  className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-2xl"
                  style={{
                    background:
                      selectedType === t.label
                        ? "rgba(59,65,200,0.1)"
                        : "rgba(241,245,249,1)",
                    outline:
                      selectedType === t.label ? "2px solid #3B41C8" : "none",
                  }}
                >
                  <span className="text-xl">{t.icon}</span>
                  <span
                    className="text-[10px] font-bold"
                    style={{
                      color: selectedType === t.label ? "#3B41C8" : "#94a3b8",
                    }}
                  >
                    {t.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  From
                </p>
                <input
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="City or airport"
                  className="w-full bg-slate-50 rounded-xl px-3 py-2.5 text-[13px] text-navy font-semibold outline-none"
                />
              </div>
              <div className="flex items-end pb-2 text-slate-300 text-xl">
                →
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  To
                </p>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="City or airport"
                  className="w-full bg-slate-50 rounded-xl px-3 py-2.5 text-[13px] text-navy font-semibold outline-none"
                />
              </div>
            </div>

            <div className="mb-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Date
              </p>
              <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                type="date"
                className="w-full bg-slate-50 rounded-xl px-3 py-2.5 text-[13px] text-navy font-semibold outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Departure
                <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} className="mt-1 w-full bg-slate-50 rounded-xl px-3 py-2.5 text-[13px] text-navy font-semibold outline-none" />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Duration
                <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="2h 15m" className="mt-1 w-full bg-slate-50 rounded-xl px-3 py-2.5 text-[13px] text-navy font-semibold outline-none" />
              </label>
            </div>
            <label className="block mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Booking reference
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TU8F3K" className="mt-1 w-full bg-slate-50 rounded-xl px-3 py-2.5 text-[13px] text-navy font-semibold outline-none" />
            </label>
            <div className="mb-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Price paid (counts toward Budget → Transportation)
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="e.g. 45"
                  className="min-w-0 flex-1 bg-slate-50 rounded-xl px-3 py-2.5 text-[13px] text-navy font-semibold outline-none"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-24 bg-slate-50 rounded-xl px-2 py-2.5 text-[13px] text-navy font-bold outline-none"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="TND">TND</option>
                </select>
              </div>
            </div>
            {date && departureTime && duration && (
              <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                Arrival: {new Date(new Date(`${date}T${departureTime}:00`).getTime() + (Math.round(Number(duration.match(/(\d+(?:[.,]\d+)?)\s*h/i)?.[1]?.replace(",", ".") || 0) * 60 + Number(duration.match(/(\d+)\s*m/i)?.[1] || 0)) * 60000)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}

            <button
              onClick={submit}
              className="w-full py-4 rounded-2xl text-white font-black text-[15px]"
              style={{
                background: added
                  ? "rgba(16,185,129,0.9)"
                  : "linear-gradient(135deg, #3B41C8, #06C4D4)",
                boxShadow: "0 8px 24px rgba(59,65,200,0.3)",
              }}
            >
              {added ? "✓ Added to Transport!" : `Add ${selectedType}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
